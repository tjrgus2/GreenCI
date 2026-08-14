import { describe, expect, it } from 'vitest';
import { collectBaseline } from '../src/adapters/baseline.js';
import { fakeSource, httpError } from './fake-source.js';

const reference = {
  owner: 'owner',
  repository: 'repo',
  workflowId: 12,
  branch: 'main',
  currentRunId: 100,
  maxRuns: 7,
};

function runSummary(id: number, conclusion = 'success'): unknown {
  return {
    id,
    run_attempt: 1,
    head_sha: `sha-${id}`,
    head_branch: 'main',
    created_at: '2026-07-19T00:00:00Z',
    conclusion,
  };
}

const jobsPayload = [
  {
    id: 1,
    name: 'build',
    runner_name: 'runner',
    labels: ['ubuntu-latest'],
    started_at: '2026-07-19T00:00:00.000Z',
    completed_at: '2026-07-19T00:01:00.000Z',
    conclusion: 'success',
    steps: [],
  },
];

describe('baseline collection', () => {
  it('skips the current run, failures, and duplicates', async () => {
    const source = fakeSource({
      async listSuccessfulRuns() {
        return [
          runSummary(100),
          runSummary(101),
          runSummary(101),
          runSummary(102, 'failure'),
          runSummary(103),
        ];
      },
      async listJobsForRunAttempt() {
        return jobsPayload;
      },
    });
    const result = await collectBaseline(source, reference);
    expect(result.available).toBe(true);
    expect(result.samples.map((sample) => sample.runId)).toEqual([101, 103]);
    expect(result.samples[0]?.createdAt).toBe('2026-07-19T00:00:00.000Z');
    expect(result.warnings).toEqual([]);
  });

  it('caps the number of historical runs it requests', async () => {
    let requested = 0;
    const source = fakeSource({
      async listSuccessfulRuns(parameters) {
        expect(parameters.perPage).toBe(9);
        return Array.from({ length: 20 }, (_, index) =>
          runSummary(200 + index),
        );
      },
      async listJobsForRunAttempt() {
        requested += 1;
        return jobsPayload;
      },
    });
    const result = await collectBaseline(source, { ...reference, maxRuns: 4 });
    expect(result.samples).toHaveLength(4);
    expect(requested).toBe(4);
  });

  it('degrades to an unavailable baseline without a branch', async () => {
    const result = await collectBaseline(fakeSource(), {
      ...reference,
      branch: undefined,
    });
    expect(result.available).toBe(false);
    expect(result.warnings[0]?.code).toBe('BASELINE_UNAVAILABLE');
  });

  it('degrades when history cannot be listed', async () => {
    const source = fakeSource({
      async listSuccessfulRuns() {
        throw httpError(403);
      },
    });
    const result = await collectBaseline(source, reference);
    expect(result.available).toBe(false);
    expect(result.samples).toEqual([]);
    expect(result.warnings[0]?.message).toContain('HTTP 403');
  });

  it('degrades when the history payload is malformed', async () => {
    const source = fakeSource({
      async listSuccessfulRuns() {
        return { unexpected: true };
      },
    });
    const result = await collectBaseline(source, reference);
    expect(result.available).toBe(false);
    expect(result.warnings[0]?.code).toBe('BASELINE_UNAVAILABLE');
  });

  it('skips only the runs whose jobs cannot be collected', async () => {
    const source = fakeSource({
      async listSuccessfulRuns() {
        return [runSummary(101), runSummary(102)];
      },
      async listJobsForRunAttempt(parameters) {
        if (parameters.runId === 102) {
          throw httpError(500);
        }
        return jobsPayload;
      },
    });
    const result = await collectBaseline(source, reference);
    expect(result.available).toBe(true);
    expect(result.samples.map((sample) => sample.runId)).toEqual([101]);
    expect(result.warnings[0]?.message).toContain('1 of 2 historical runs');
  });
});
