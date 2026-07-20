import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubDataSource } from '../src/adapters/github.js';
import { parseActionInputs } from '../src/config/inputs.js';
import {
  executeAction,
  type ActionIO,
  type ActionEnvironment,
} from '../src/run.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.length = 0;
});

function inputs(
  overrides: Readonly<Record<string, string>> = {},
): Map<string, string> {
  return new Map(
    Object.entries({
      'github-token': 'test-token',
      'config-path': '.greenci.yml',
      locale: 'en',
      'baseline-runs': '7',
      'parse-failure-logs': 'false',
      'upload-report-artifact': 'true',
      ...overrides,
    }),
  );
}

function source(
  repositoryResult: unknown = { visibility: 'public' },
): GitHubDataSource {
  return {
    async getRepository() {
      if (repositoryResult instanceof Error) {
        throw repositoryResult;
      }
      return repositoryResult;
    },
    async getWorkflowRun() {
      return {
        id: 100,
        workflow_id: 200,
        run_attempt: 1,
        path: '.github/workflows/ci.yml',
        head_sha: 'abcdef',
        head_branch: 'feature',
        event: 'push',
        pull_requests: [],
      };
    },
    async listJobsForRunAttempt() {
      return [
        {
          id: 1,
          name: 'build',
          runner_name: 'runner',
          labels: ['ubuntu-latest'],
          started_at: '2026-07-20T00:00:00.000Z',
          completed_at: '2026-07-20T00:01:00.000Z',
          conclusion: 'success',
          steps: [],
        },
        {
          id: 2,
          name: 'greenci',
          runner_name: 'runner',
          labels: ['ubuntu-latest'],
          started_at: '2026-07-20T00:01:00.000Z',
          completed_at: null,
          conclusion: null,
          steps: [],
        },
      ];
    },
  };
}

const environment: ActionEnvironment = {
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_JOB: 'greenci',
};

describe('Action inputs', () => {
  it('rejects unsafe configuration paths and invalid booleans', () => {
    const unsafe = inputs({
      'config-path': '../secret',
      'parse-failure-logs': 'yes',
    });
    expect(() => parseActionInputs((name) => unsafe.get(name) ?? '')).toThrow();
  });
});

describe('executeAction', () => {
  it('collects jobs, writes the summary and JSON, uploads it, and sets outputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const values = inputs();
    const outputs = new Map<string, string | number>();
    let summary = '';
    let uploaded = false;
    const io: ActionIO = {
      getInput: (name) => values.get(name) ?? '',
      info: () => undefined,
      warning: () => undefined,
      setOutput: (name, value) => outputs.set(name, value),
      async writeSummary(markdown) {
        summary = markdown;
      },
      async uploadArtifact(name, files) {
        expect(name).toBe('greenci-report');
        expect(files).toHaveLength(1);
        uploaded = true;
      },
    };
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () => source(),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    const reportPath = join(directory, 'greenci-report.json');
    const persisted: unknown = JSON.parse(
      await readFile(reportPath, 'utf8'),
    ) as unknown;
    expect(persisted).toEqual(report);
    expect(report.jobs.map((job) => job.apiName)).toEqual(['build']);
    expect(summary).toContain('Total runner time | 1m 0s');
    expect(uploaded).toBe(true);
    expect(outputs.get('runner-seconds')).toBe(60);
  });

  it('degrades gracefully when optional report publishing fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const values = inputs({ locale: 'ko', 'parse-failure-logs': 'true' });
    const warnings: string[] = [];
    const io: ActionIO = {
      getInput: (name) => values.get(name) ?? '',
      info: () => undefined,
      warning: (message) => warnings.push(message),
      setOutput: () => undefined,
      async writeSummary() {
        throw new Error('permission denied');
      },
      async uploadArtifact() {
        throw new Error('unavailable');
      },
    };
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () => source(),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(warnings).toHaveLength(2);
    expect(report.warnings).toHaveLength(4);
  });

  it('rejects missing workflow identity environment values', async () => {
    const values = inputs({ 'upload-report-artifact': 'false' });
    const io: ActionIO = {
      getInput: (name) => values.get(name) ?? '',
      info: () => undefined,
      warning: () => undefined,
      setOutput: () => undefined,
      async writeSummary() {},
      async uploadArtifact() {},
    };
    await expect(
      executeAction(
        io,
        {},
        {
          createSource: () => source(),
          now: () => new Date('2026-07-20T00:02:00.000Z'),
          workingDirectory: process.cwd(),
        },
      ),
    ).rejects.toThrow('could not be identified');
  });

  it('continues the Action when repository metadata is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const values = inputs({ 'upload-report-artifact': 'false' });
    const warningMessages: string[] = [];
    const io: ActionIO = {
      getInput: (name) => values.get(name) ?? '',
      info: () => undefined,
      warning: (message) => warningMessages.push(message),
      setOutput: () => undefined,
      async writeSummary() {},
      async uploadArtifact() {},
    };
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () => source(new Error('repository API failed')),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.identity.repositoryVisibility).toBe('unknown');
    expect(report.current.runnerSeconds).toBe(60);
    expect(report.warnings[0]?.code).toBe('REPOSITORY_METADATA_UNAVAILABLE');
    expect(warningMessages[0]).toContain(
      'code=REPOSITORY_METADATA_UNAVAILABLE',
    );
  });
});
