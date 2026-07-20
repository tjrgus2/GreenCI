import { describe, expect, it } from 'vitest';
import { normalizeCurrentRun } from '../src/adapters/github.js';

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
  repository: { visibility: 'public', ignored: true },
  pull_requests: [{ number: 4, base: { ref: 'main' } }],
};

describe('GitHub adapter', () => {
  it('validates and normalizes GitHub response shapes', () => {
    const result = normalizeCurrentRun(
      run,
      [
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
      ],
      reference,
    );
    expect(result.identity.baseBranch).toBe('main');
    expect(result.jobs[0]?.runnerClass).toBe('windows-x64');
    expect(result.jobs[0]?.conclusion).toBe('unknown');
    expect(result.jobs[0]?.steps[0]?.isRunnerInternal).toBe(true);
  });

  it('rejects malformed untrusted API responses', () => {
    expect(() => normalizeCurrentRun({}, [], reference)).toThrow();
    expect(() =>
      normalizeCurrentRun(run, [{ id: 'not-a-number' }], reference),
    ).toThrow();
  });
});
