import { describe, expect, it } from 'vitest';
import {
  compareWithBaseline,
  jobComparisonKey,
  type BaselineComparisonInput,
  type BaselineRunSample,
} from '../src/analysis/baseline.js';
import type { NormalizedJob } from '../src/domain/schemas.js';

const epoch = Date.parse('2026-07-20T00:00:00.000Z');

function job(
  id: number,
  name: string,
  durationSeconds: number,
  stepSeconds: readonly number[] = [],
): NormalizedJob {
  return {
    id,
    apiName: name,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: new Date(epoch).toISOString(),
    completedAt: new Date(epoch + durationSeconds * 1000).toISOString(),
    durationSeconds,
    conclusion: 'success',
    steps: stepSeconds.map((seconds, index) => ({
      index,
      name: `step-${index}`,
      normalizedName: `step-${index}`,
      startedAt: new Date(epoch).toISOString(),
      completedAt: new Date(epoch + seconds * 1000).toISOString(),
      durationSeconds: seconds,
      conclusion: 'success' as const,
      isRunnerInternal: false,
    })),
  };
}

function sample(runId: number, durationSeconds: number): BaselineRunSample {
  return {
    runId,
    runAttempt: 1,
    headSha: `sha-${runId}`,
    jobs: [job(1, 'Build', durationSeconds, [durationSeconds / 2])],
  };
}

function input(
  overrides: Partial<BaselineComparisonInput> = {},
): BaselineComparisonInput {
  return {
    workflowPath: '.github/workflows/ci.yml',
    currentRunId: 999,
    currentJobs: [job(1, 'Build', 100, [50])],
    samples: [],
    branch: 'main',
    requestedRuns: 7,
    minimumSamples: 3,
    shapeThreshold: 0.8,
    regressionPercent: 15,
    modifiedZScoreThreshold: 3.5,
    available: true,
    ...overrides,
  };
}

describe('baseline comparison', () => {
  it('reports an unavailable baseline without claiming a regression', () => {
    const result = compareWithBaseline(input({ available: false }));
    expect(result.status).toBe('unavailable');
    expect(result.metrics).toEqual([]);
    expect(result.currentFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('refuses to decide with fewer samples than the configured minimum', () => {
    const result = compareWithBaseline(
      input({ samples: [sample(1, 100), sample(2, 101)] }),
    );
    expect(result.status).toBe('insufficient-samples');
    expect(result.sampleCount).toBe(2);
    expect(
      result.metrics.every((metric) => metric.verdict === 'inconclusive'),
    ).toBe(true);
  });

  it('detects a runner-time regression against a robust median', () => {
    const samples = [100, 102, 99, 101, 98, 100, 300].map((seconds, index) =>
      sample(index + 1, seconds),
    );
    const result = compareWithBaseline(
      input({ currentJobs: [job(1, 'Build', 125, [62])], samples }),
    );
    expect(result.status).toBe('ready');
    expect(result.sampleCount).toBe(7);
    const runnerTime = result.metrics.find(
      (metric) => metric.metric === 'runner-seconds',
    );
    expect(runnerTime?.baselineMedian).toBe(100);
    expect(runnerTime?.percentChange).toBe(25);
    expect(runnerTime?.verdict).toBe('regression');
    expect(result.jobComparisons[0]?.verdict).toBe('regression');
    expect(result.stepComparisons[0]?.label).toBe('Build / step-0');
  });

  it('drops structurally incompatible runs before comparing', () => {
    const compatible = [1, 2, 3, 4].map((index) => sample(index, 100));
    const rebuilt: BaselineRunSample = {
      runId: 90,
      runAttempt: 1,
      headSha: 'sha-90',
      jobs: [
        job(1, 'Compile', 100, [50]),
        job(2, 'Package', 100, [50]),
        job(3, 'Publish', 100, [50]),
      ],
    };
    const result = compareWithBaseline(
      input({ samples: [rebuilt, ...compatible] }),
    );
    expect(result.excludedForShape).toBe(1);
    expect(result.sampleCount).toBe(4);
    expect(result.runs.find((run) => run.runId === 90)?.included).toBe(false);
  });

  it('reports shape-changed when nothing structurally matches', () => {
    const rebuilt: BaselineRunSample = {
      runId: 90,
      runAttempt: 1,
      headSha: 'sha-90',
      jobs: [job(1, 'Totally different', 100, [50])],
    };
    const result = compareWithBaseline(input({ samples: [rebuilt] }));
    expect(result.status).toBe('shape-changed');
    expect(result.excludedForShape).toBe(1);
  });

  it('aggregates duplicate node keys inside one run', () => {
    const samples = [1, 2, 3].map((index) => sample(index, 100));
    const result = compareWithBaseline(
      input({
        currentJobs: [job(1, 'Build', 100, [50]), job(2, 'Build', 40, [20])],
        samples,
      }),
    );
    expect(result.status).toBe('ready');
    expect(result.jobComparisons).toHaveLength(1);
    expect(result.jobComparisons[0]?.current).toBe(140);
  });

  it('lists a new job as unmatched instead of calling it a regression', () => {
    const shared = (durationSeconds: number): NormalizedJob[] =>
      ['Build', 'Test', 'Lint', 'Typecheck', 'Audit'].map((name, index) =>
        job(index + 1, name, durationSeconds, [durationSeconds / 2]),
      );
    const samples: BaselineRunSample[] = [1, 2, 3, 4].map((runId) => ({
      runId,
      runAttempt: 1,
      headSha: `sha-${runId}`,
      jobs: shared(100),
    }));
    const result = compareWithBaseline(
      input({
        currentJobs: [...shared(100), job(9, 'Docs', 900, [450])],
        samples,
      }),
    );
    expect(result.status).toBe('ready');
    expect(result.unmatchedJobs).toEqual(['Docs']);
    expect(result.jobComparisons.some((entry) => entry.label === 'Docs')).toBe(
      false,
    );
  });

  it('compares derived cost-like metrics supplied by the caller', () => {
    const samples = [1, 2, 3, 4].map((index) => sample(index, 100));
    const result = compareWithBaseline(
      input({
        samples,
        derivedMetrics: [
          {
            metric: 'list-price-usd',
            compute: (jobs) =>
              jobs.reduce(
                (total, entry) =>
                  total + Math.ceil((entry.durationSeconds ?? 0) / 60) * 0.008,
                0,
              ),
          },
        ],
      }),
    );
    const listPrice = result.metrics.find(
      (metric) => metric.metric === 'list-price-usd',
    );
    expect(listPrice?.sampleCount).toBe(4);
    expect(listPrice?.baselineMedian).toBeCloseTo(0.016, 10);
  });

  it('removes the analyzer job from historical runs as well', () => {
    const samples: BaselineRunSample[] = [1, 2, 3, 4].map((runId) => ({
      runId,
      runAttempt: 1,
      headSha: `sha-${runId}`,
      jobs: [
        job(1, 'Build', 100, [50]),
        // Historical runs recorded a *completed* analyzer job.
        job(2, 'GreenCI', 45, [40]),
      ],
    }));
    const withoutExclusion = compareWithBaseline(input({ samples }));
    expect(withoutExclusion.shapeSimilarity).toBeLessThan(1);

    const result = compareWithBaseline(
      input({ samples, excludedLogicalJobIds: ['greenci'] }),
    );
    expect(result.status).toBe('ready');
    expect(result.shapeSimilarity).toBe(1);
    expect(result.excludedForShape).toBe(0);
    const runnerTime = result.metrics.find(
      (metric) => metric.metric === 'runner-seconds',
    );
    expect(runnerTime?.baselineMedian).toBe(100);
  });

  it('builds a stable comparison key from logical identity', () => {
    expect(jobComparisonKey(job(1, 'Test (20, ubuntu-latest)', 10))).toBe(
      'test|20, ubuntu-latest|linux-x64',
    );
  });
});
