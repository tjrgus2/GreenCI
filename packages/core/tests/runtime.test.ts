import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  analyzeRuntime,
  calculateDurationSeconds,
  withCalculatedDurations,
} from '../src/analysis/runtime.js';
import type { NormalizedJob } from '../src/domain/schemas.js';

const epoch = Date.parse('2026-07-20T00:00:00.000Z');

function timedJob(
  id: number,
  startSeconds: number,
  durationSeconds: number,
): NormalizedJob {
  return {
    id,
    apiName: `job-${id}`,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: new Date(epoch + startSeconds * 1000).toISOString(),
    completedAt: new Date(
      epoch + (startSeconds + durationSeconds) * 1000,
    ).toISOString(),
    durationSeconds,
    conclusion: 'success',
    steps: [],
  };
}

describe('calculateDurationSeconds', () => {
  it('calculates a non-negative duration', () => {
    expect(
      calculateDurationSeconds(
        '2026-07-20T00:01:00.000Z',
        '2026-07-20T00:00:00.000Z',
      ),
    ).toBe(0);
    expect(calculateDurationSeconds(undefined, undefined)).toBeUndefined();
    expect(calculateDurationSeconds('bad', 'also-bad')).toBeUndefined();
  });

  it('recalculates job and step durations from timestamps', () => {
    const result = withCalculatedDurations({
      ...timedJob(1, 0, 61),
      durationSeconds: 999,
      steps: [
        {
          index: 1,
          name: 'test',
          normalizedName: 'test',
          startedAt: new Date(epoch).toISOString(),
          completedAt: new Date(epoch + 15_000).toISOString(),
          conclusion: 'success',
          isRunnerInternal: false,
        },
      ],
    });
    expect(result.durationSeconds).toBe(61);
    expect(result.steps[0]?.durationSeconds).toBe(15);
  });
});

describe('analyzeRuntime', () => {
  it('matches the parallel runtime acceptance scenario', () => {
    const result = analyzeRuntime([
      timedJob(1, 0, 300),
      timedJob(2, 0, 480),
      timedJob(3, 0, 120),
    ]);
    expect(result.wallClockSeconds).toBe(480);
    expect(result.runnerSeconds).toBe(900);
    expect(result.peakConcurrency).toBe(3);
    expect(result.averageConcurrency).toBe(1.875);
    expect(result.activeSeconds).toBe(480);
    expect(result.idleSeconds).toBe(0);
  });

  it('reports idle gaps separately from elapsed wall-clock time', () => {
    const result = analyzeRuntime([timedJob(1, 0, 60), timedJob(2, 120, 60)]);
    expect(result.wallClockSeconds).toBe(180);
    expect(result.activeSeconds).toBe(120);
    expect(result.idleSeconds).toBe(60);
    expect(result.peakConcurrency).toBe(1);
  });

  it('handles missing intervals without negative or non-finite metrics', () => {
    const result = analyzeRuntime([
      {
        ...timedJob(1, 0, 10),
        startedAt: undefined,
        completedAt: undefined,
      },
    ]);
    expect(result.wallClockSeconds).toBe(0);
    expect(result.runnerSeconds).toBe(10);
    expect(result.averageConcurrency).toBe(0);
    expect(result.timeline).toEqual([]);
  });

  it('preserves numeric invariants for generated concurrent jobs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10_000 }), {
          minLength: 1,
          maxLength: 30,
        }),
        (durations) => {
          const jobs = durations.map((duration, index) =>
            timedJob(index, 0, duration),
          );
          const result = analyzeRuntime(jobs);
          expect(result.runnerSeconds).toBeGreaterThanOrEqual(0);
          expect(result.wallClockSeconds).toBeLessThanOrEqual(
            result.runnerSeconds,
          );
          expect(Number.isFinite(result.averageConcurrency)).toBe(true);
        },
      ),
    );
  });

  it('never reduces runner time when a non-negative job is added', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 30 }),
        fc.integer({ min: 0, max: 10_000 }),
        (durations, addedDuration) => {
          const jobs = durations.map((duration, index) =>
            timedJob(index, 0, duration),
          );
          const before = analyzeRuntime(jobs).runnerSeconds;
          const after = analyzeRuntime([
            ...jobs,
            timedJob(jobs.length, 0, addedDuration),
          ]).runnerSeconds;
          expect(after).toBeGreaterThanOrEqual(before);
        },
      ),
    );
  });
});
