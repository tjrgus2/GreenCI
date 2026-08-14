import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { estimateCost } from '../src/estimation/cost.js';
import type { NormalizedJob } from '../src/domain/schemas.js';

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

describe('cost estimation', () => {
  it('rounds every job up to a whole minute before summing', () => {
    const result = estimateCost([job(1, 61), job(2, 59)], {
      repositoryVisibility: 'private',
    });
    expect(result.jobs[0]?.billableMinutes).toBe(2);
    expect(result.jobs[1]?.billableMinutes).toBe(1);
    expect(result.billableMinutes).toBe(3);
    expect(result.grossListPriceUsd).toBeCloseTo(0.024, 10);
    expect(result.estimatedBillableUsd).toBeCloseTo(0.024, 10);
    expect(result.billingBasis).toBe('list-price');
  });

  it('never rounds the summed run duration instead of each job', () => {
    const perJob = estimateCost([job(1, 30), job(2, 30)], {
      repositoryVisibility: 'private',
    });
    expect(perJob.billableMinutes).toBe(2);
    expect(perJob.billableMinutes).not.toBe(1);
  });

  it('separates the public-repository charge from the list-price equivalent', () => {
    const result = estimateCost([job(1, 120)], {
      repositoryVisibility: 'public',
    });
    expect(result.grossListPriceUsd).toBeCloseTo(0.016, 10);
    expect(result.estimatedBillableUsd).toBe(0);
    expect(result.billingBasis).toBe('standard-public-free');
    expect(result.actualInvoiceAvailable).toBe(false);
  });

  it('charges macOS runners on a public repository at list price', () => {
    const result = estimateCost([job(1, 60, 'macos-arm64')], {
      repositoryVisibility: 'public',
    });
    expect(result.billingBasis).toBe('list-price');
    expect(result.estimatedBillableUsd).toBeCloseTo(0.08, 10);
  });

  it('never applies a price to an unknown runner class', () => {
    const result = estimateCost([job(1, 120), job(2, 120, 'unknown')], {
      repositoryVisibility: 'private',
    });
    expect(result.unknownRunnerClasses).toEqual(['unknown']);
    expect(result.unpricedJobs).toBe(1);
    expect(result.jobs[1]?.grossListPriceUsd).toBeUndefined();
    expect(result.grossListPriceUsd).toBeCloseTo(0.016, 10);
  });

  it('handles a run with no analyzable jobs', () => {
    const result = estimateCost([], { repositoryVisibility: 'public' });
    expect(result.grossListPriceUsd).toBe(0);
    expect(result.billingBasis).toBe('list-price');
  });

  it('stays non-negative and monotonic for generated durations', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000 }), { maxLength: 20 }),
        fc.integer({ min: 0, max: 100_000 }),
        (durations, added) => {
          const jobs = durations.map((duration, index) => job(index, duration));
          const before = estimateCost(jobs, {
            repositoryVisibility: 'private',
          });
          const after = estimateCost([...jobs, job(jobs.length, added)], {
            repositoryVisibility: 'private',
          });
          expect(before.grossListPriceUsd).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(before.grossListPriceUsd)).toBe(true);
          expect(after.grossListPriceUsd).toBeGreaterThanOrEqual(
            before.grossListPriceUsd,
          );
        },
      ),
    );
  });
});
