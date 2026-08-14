import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/domain/config.js';
import type { NormalizedJob } from '../src/domain/schemas.js';
import {
  estimateCarbon,
  type CarbonEstimateInput,
} from '../src/estimation/carbon.js';
import { createSeededRandom, triangular } from '../src/estimation/random.js';

function job(
  id: number,
  durationSeconds: number,
  runnerClass = 'linux-x64',
): NormalizedJob {
  return {
    id,
    apiName: `job-${id}`,
    runnerLabels: ['ubuntu-latest'],
    runnerClass,
    durationSeconds,
    conclusion: 'success',
    steps: [],
  };
}

function input(
  overrides: Partial<CarbonEstimateInput> = {},
): CarbonEstimateInput {
  return {
    jobs: [job(1, 300), job(2, 480)],
    runId: 42,
    configHash: 'a'.repeat(64),
    region: 'KR',
    simulationSamples: 500,
    pue: DEFAULT_CONFIG.carbon.pue,
    utilization: DEFAULT_CONFIG.carbon.utilization,
    referenceYear: 2026,
    ...overrides,
  };
}

describe('seeded randomness', () => {
  it('reproduces the same stream for the same seed', () => {
    const left = createSeededRandom('deadbeef'.repeat(8));
    const right = createSeededRandom('deadbeef'.repeat(8));
    const other = createSeededRandom('cafebabe'.repeat(8));
    const leftValues = Array.from({ length: 8 }, () => left.next());
    expect(leftValues).toEqual(Array.from({ length: 8 }, () => right.next()));
    expect(leftValues).not.toEqual(
      Array.from({ length: 8 }, () => other.next()),
    );
    for (const value of leftValues) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('accepts a short seed and degenerate triangular bounds', () => {
    const random = createSeededRandom('short-seed');
    expect(Number.isFinite(random.next())).toBe(true);
    expect(triangular({ min: 5, mode: 5, max: 5 }, random)).toBe(5);
    const swapped = triangular({ min: 9, mode: 1, max: 1 }, random);
    expect(swapped).toBeGreaterThanOrEqual(1);
    expect(swapped).toBeLessThanOrEqual(9);
  });

  it('stays inside the triangular support', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (a, b, c) => {
          const bounds = { min: Math.min(a, b), mode: c, max: Math.max(a, b) };
          const random = createSeededRandom('seed');
          for (let index = 0; index < 20; index += 1) {
            const value = triangular(bounds, random);
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(bounds.min - 1e-9);
            expect(value).toBeLessThanOrEqual(bounds.max + 1e-9);
          }
        },
      ),
    );
  });
});

describe('carbon estimation', () => {
  it('is deterministic for identical inputs', () => {
    expect(estimateCarbon(input())).toEqual(estimateCarbon(input()));
  });

  it('changes when the run, configuration, or region changes', () => {
    const base = estimateCarbon(input());
    expect(estimateCarbon(input({ runId: 43 })).seedHash).not.toBe(
      base.seedHash,
    );
    expect(
      estimateCarbon(input({ configHash: 'b'.repeat(64) })).seedHash,
    ).not.toBe(base.seedHash);
    expect(
      estimateCarbon(input({ region: 'EU' })).operationalCarbonGrams.p50,
    ).toBeLessThan(base.operationalCarbonGrams.p50);
  });

  it('keeps p05 <= p50 <= p95 and never reports a negative value', () => {
    const result = estimateCarbon(input());
    for (const value of [result.energyKwh, result.operationalCarbonGrams]) {
      expect(value.p05).toBeGreaterThanOrEqual(0);
      expect(value.p05).toBeLessThanOrEqual(value.p50);
      expect(value.p50).toBeLessThanOrEqual(value.p95);
    }
    expect(result.operationalCarbonGrams.p95).toBeGreaterThan(
      result.operationalCarbonGrams.p05,
    );
  });

  it('lowers confidence instead of guessing an unknown runner', () => {
    const result = estimateCarbon(
      input({ jobs: [job(1, 300), job(2, 480, 'unknown')] }),
    );
    expect(result.unknownRunnerClasses).toEqual(['unknown']);
    expect(result.unmodeledJobs).toBe(1);
    expect(result.quality.reasons).toContain('unmodeled-runner-class');
    expect(result.quality.score).toBeLessThan(0.8);
  });

  it('falls back to the global region and discloses it', () => {
    const result = estimateCarbon(input({ region: 'ZZ' }));
    expect(result.regionResolved).toBe(false);
    expect(result.region).toBe('GLOBAL');
    expect(result.quality.reasons).toContain('global-average-carbon-intensity');
    expect(
      result.assumptions.find(
        (assumption) => assumption.key === 'data-center-region',
      )?.value,
    ).toContain('fallback');
  });

  it('produces zero emissions and a low grade with no analyzable jobs', () => {
    const result = estimateCarbon(input({ jobs: [] }));
    expect(result.operationalCarbonGrams.p50).toBe(0);
    expect(result.quality.grade).toBe('low');
    expect(result.quality.reasons).toEqual(['no-analyzed-jobs']);
  });

  it('never yields NaN and never shrinks when a job is added', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3600 }), { maxLength: 6 }),
        fc.integer({ min: 0, max: 3600 }),
        (durations, added) => {
          const jobs = durations.map((duration, index) => job(index, duration));
          const before = estimateCarbon(
            input({ jobs, simulationSamples: 200 }),
          );
          const after = estimateCarbon(
            input({
              jobs: [...jobs, job(jobs.length, added)],
              simulationSamples: 200,
            }),
          );
          expect(Number.isFinite(before.operationalCarbonGrams.p50)).toBe(true);
          expect(before.operationalCarbonGrams.p50).toBeGreaterThanOrEqual(0);
          expect(after.energyKwh.p50).toBeGreaterThanOrEqual(0);
          expect(before.quality.score).toBeGreaterThanOrEqual(0);
          expect(before.quality.score).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 15 },
    );
  });
});
