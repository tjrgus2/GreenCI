import { describe, expect, it } from 'vitest';
import {
  collectCurrentRun,
  mapWithConcurrency,
  normalizeCurrentRun,
  normalizeRepositoryMetadata,
} from '../src/adapters/github.js';
import { fakeSource } from './fake-source.js';

const reference = {
  owner: 'owner',
  repository: 'repo',
  runId: 10,
  runAttempt: 2,
};

const run = {
  id: 10,
  workflow_id: 20,
  run_attempt: 2,
  path: '.github/workflows/ci.yml',
  head_sha: 'abc',
  head_branch: 'feature',
  event: 'pull_request',
  pull_requests: [{ number: 4, base: { ref: 'main' } }],
};

const jobs = [
  {
    id: 30,
    name: 'test',
    runner_name: 'GitHub Actions 1',
    labels: ['windows-latest'],
    started_at: '2026-07-20T00:00:00.000Z',
    completed_at: '2026-07-20T00:01:00.000Z',
    conclusion: 'future_value',
    steps: [
      {
        number: 1,
        name: 'Set up job',
        started_at: '2026-07-20T00:00:00.000Z',
        completed_at: '2026-07-20T00:00:05.000Z',
        conclusion: 'success',
      },
    ],
  },
];

describe('repository visibility', () => {
  it.each([
    ['public', 'public'],
    ['private', 'private'],
    ['internal', 'internal'],
  ] as const)('normalizes canonical %s visibility', (raw, expected) => {
    const result = normalizeRepositoryMetadata({ visibility: raw });
    expect(result.visibility).toBe(expected);
    expect(result.warnings).toEqual([]);
  });

  it('uses unknown with a warning when visibility is missing', () => {
    const result = normalizeRepositoryMetadata({ private: true });
    expect(result.visibility).toBe('unknown');
    expect(result.warnings[0]?.code).toBe('REPOSITORY_VISIBILITY_UNKNOWN');
  });

  it('uses unknown with a warning for an unexpected visibility value', () => {
    const result = normalizeRepositoryMetadata({
      visibility: 'partner',
      private: true,
    });
    expect(result.visibility).toBe('unknown');
    expect(result.warnings[0]?.code).toBe('REPOSITORY_VISIBILITY_UNKNOWN');
  });
});

describe('GitHub adapter', () => {
  it('validates a workflow_dispatch run without payload repository visibility', () => {
    const result = normalizeCurrentRun(run, jobs, reference, 'public');
    expect(result.identity.baseBranch).toBe('main');
    expect(result.identity.repositoryVisibility).toBe('public');
    expect(result.jobs[0]?.runnerClass).toBe('windows-x64');
    expect(result.jobs[0]?.conclusion).toBe('unknown');
    expect(result.jobs[0]?.steps[0]?.isRunnerInternal).toBe(true);
  });

  it('rejects malformed untrusted API responses', () => {
    expect(() => normalizeCurrentRun({}, [], reference, 'unknown')).toThrow();
    expect(() =>
      normalizeCurrentRun(run, [{ id: 'not-a-number' }], reference, 'unknown'),
    ).toThrow();
  });

  it('runs bounded concurrent work in input order', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) =>
      Promise.resolve(value * 2),
    );
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it('continues with a structured warning when repository metadata fails', async () => {
    const source = fakeSource({
      async getRepository() {
        throw new Error('permission denied');
      },
      async getWorkflowRun() {
        return run;
      },
      async listJobsForRunAttempt() {
        return jobs;
      },
    });
    const result = await collectCurrentRun(source, reference);
    expect(result.identity.repositoryVisibility).toBe('unknown');
    expect(result.jobs).toHaveLength(1);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'REPOSITORY_METADATA_UNAVAILABLE',
        source: 'github-api',
      }),
    ]);
  });
});
