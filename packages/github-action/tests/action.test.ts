import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubDataSource } from '../src/adapters/github.js';
import { parseActionInputs } from '../src/config/inputs.js';
import {
  executeAction,
  resolveBaselineBranch,
  withEventIdentity,
  type ActionIO,
  type ActionEnvironment,
} from '../src/run.js';
import { fakeSource } from './fake-source.js';

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

function currentJobs(runnerSeconds: number): unknown[] {
  return [
    {
      id: 1,
      name: 'build',
      runner_name: 'runner',
      labels: ['ubuntu-latest'],
      started_at: '2026-07-20T00:00:00.000Z',
      completed_at: new Date(
        Date.parse('2026-07-20T00:00:00.000Z') + runnerSeconds * 1000,
      ).toISOString(),
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
}

function source(
  repositoryResult: unknown = { visibility: 'public' },
  overrides: Partial<GitHubDataSource> = {},
): GitHubDataSource {
  return fakeSource({
    async getRepository() {
      if (repositoryResult instanceof Error) {
        throw repositoryResult;
      }
      return repositoryResult;
    },
    async listJobsForRunAttempt() {
      return currentJobs(60);
    },
    ...overrides,
  });
}

const environment: ActionEnvironment = {
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_JOB: 'greenci',
};

function collectingIO(
  values: Map<string, string>,
  overrides: Partial<ActionIO> = {},
): {
  io: ActionIO;
  outputs: Map<string, string | number>;
  warnings: string[];
  summaries: string[];
  failures: string[];
  annotations: { file: string; line: number; message: string }[];
} {
  const outputs = new Map<string, string | number>();
  const warnings: string[] = [];
  const summaries: string[] = [];
  const failures: string[] = [];
  const annotations: { file: string; line: number; message: string }[] = [];
  const io: ActionIO = {
    getInput: (name) => values.get(name) ?? '',
    info: () => undefined,
    warning: (message) => warnings.push(message),
    setOutput: (name, value) => outputs.set(name, value),
    setFailed: (message) => failures.push(message),
    annotate: (annotation) =>
      annotations.push({
        file: annotation.file,
        line: annotation.line,
        message: annotation.message,
      }),
    async writeSummary(markdown) {
      summaries.push(markdown);
    },
    async uploadArtifact() {},
    ...overrides,
  };
  return { io, outputs, warnings, summaries, failures, annotations };
}

describe('Action inputs', () => {
  it('rejects unsafe configuration paths and invalid booleans', () => {
    const unsafe = inputs({
      'config-path': '../secret',
      'parse-failure-logs': 'yes',
    });
    expect(() => parseActionInputs((name) => unsafe.get(name) ?? '')).toThrow();
  });
});

describe('event identity and baseline branch', () => {
  const identity = {
    owner: 'owner',
    repository: 'repo',
    workflowId: 1,
    workflowPath: '.github/workflows/ci.yml',
    runId: 1,
    runAttempt: 1,
    headSha: 'abc',
    headBranch: 'feature',
    event: 'pull_request',
    repositoryVisibility: 'public' as const,
  };

  it('recovers pull-request identity from the runner environment', () => {
    const result = withEventIdentity(identity, {
      GITHUB_REF: 'refs/pull/42/merge',
      GITHUB_BASE_REF: 'main',
    });
    expect(result.pullRequestNumber).toBe(42);
    expect(result.baseBranch).toBe('main');
  });

  it('keeps a payload-provided pull-request identity unchanged', () => {
    const provided = {
      ...identity,
      baseBranch: 'release',
      pullRequestNumber: 7,
    };
    expect(withEventIdentity(provided, { GITHUB_BASE_REF: 'main' })).toEqual(
      provided,
    );
  });

  it('falls back from base branch to configuration to head branch', () => {
    const config = {
      baseline: { branch: 'develop' },
    } as unknown as Parameters<typeof resolveBaselineBranch>[1];
    expect(
      resolveBaselineBranch({ ...identity, baseBranch: 'main' }, config),
    ).toBe('main');
    expect(resolveBaselineBranch(identity, config)).toBe('develop');
    expect(
      resolveBaselineBranch(identity, {
        baseline: {},
      } as unknown as Parameters<typeof resolveBaselineBranch>[1]),
    ).toBe('feature');
  });
});

describe('executeAction', () => {
  it('collects jobs, writes the summary and JSON, uploads it, and sets outputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    let uploaded = false;
    const { io, outputs, summaries } = collectingIO(inputs(), {
      async uploadArtifact(name, files) {
        expect(name).toBe('greenci-report');
        expect(files).toHaveLength(1);
        uploaded = true;
      },
    });
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
    expect(summaries[0]).toContain('🖥 Runner time');
    expect(uploaded).toBe(true);
    expect(outputs.get('runner-seconds')).toBe(60);
    expect(outputs.get('list-price-usd')).toBe(0.008);
    expect(Number(outputs.get('carbon-p50-grams'))).toBeGreaterThan(0);
    expect(report.baseline.status).toBe('unavailable');
  });

  it('compares against collected history and updates one pull-request comment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const updated: { id?: number; body?: string } = {};
    let created = 0;
    const historyJobs = currentJobs(30).slice(0, 1);
    const { io, outputs } = collectingIO(inputs());
    const report = await executeAction(
      io,
      {
        ...environment,
        RUNNER_TEMP: directory,
        GITHUB_REF: 'refs/pull/9/merge',
        GITHUB_BASE_REF: 'main',
      },
      {
        createSource: () =>
          source(
            { visibility: 'public' },
            {
              async listSuccessfulRuns() {
                return Array.from({ length: 5 }, (_, index) => ({
                  id: 500 + index,
                  run_attempt: 1,
                  head_sha: `sha${index}`,
                  head_branch: 'main',
                  created_at: '2026-07-19T00:00:00Z',
                  conclusion: 'success',
                }));
              },
              async listJobsForRunAttempt(parameters) {
                return parameters.runId === 100 ? currentJobs(60) : historyJobs;
              },
              async listIssueComments() {
                return [
                  {
                    id: 11,
                    body: 'unrelated comment',
                    user: { login: 'someone', type: 'User' },
                  },
                  {
                    id: 22,
                    body: '<!-- greenci-report:v1 workflow=".github/workflows/ci.yml" -->\nold report',
                    user: { login: 'github-actions[bot]', type: 'Bot' },
                  },
                ];
              },
              async updateIssueComment(parameters) {
                updated.id = parameters.commentId;
                updated.body = parameters.body;
                return { id: parameters.commentId };
              },
              async createIssueComment() {
                created += 1;
                return { id: 33 };
              },
            },
          ),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.baseline.status).toBe('ready');
    expect(report.baseline.sampleCount).toBe(5);
    expect(updated.id).toBe(22);
    expect(updated.body).toContain(
      '<!-- greenci-report:v1 workflow=".github/workflows/ci.yml" -->',
    );
    expect(created).toBe(0);
    expect(outputs.get('policy-conclusion')).toBe('skipped');
  });

  it('degrades gracefully when optional report publishing fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const { io, warnings } = collectingIO(
      inputs({ locale: 'ko', 'parse-failure-logs': 'true' }),
      {
        async writeSummary() {
          throw new Error('permission denied');
        },
        async uploadArtifact() {
          throw new Error('unavailable');
        },
      },
    );
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () => source(),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.locale).toBe('ko');
    expect(warnings.some((message) => message.includes('report.summary'))).toBe(
      true,
    );
    expect(report.warnings.map((warning) => warning.code)).toContain(
      'SUMMARY_PUBLISH_FAILED',
    );
    expect(report.warnings.map((warning) => warning.code)).toContain(
      'ARTIFACT_UPLOAD_FAILED',
    );
  });

  it('keeps the Job Summary when pull-request comment permission is denied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const { io, summaries } = collectingIO(
      inputs({ 'upload-report-artifact': 'false' }),
    );
    const report = await executeAction(
      io,
      {
        ...environment,
        RUNNER_TEMP: directory,
        GITHUB_REF: 'refs/pull/9/merge',
        GITHUB_BASE_REF: 'main',
      },
      {
        createSource: () =>
          source(
            { visibility: 'public' },
            {
              async listIssueComments() {
                throw Object.assign(new Error('Forbidden'), { status: 403 });
              },
            },
          ),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(summaries).toHaveLength(1);
    expect(report.warnings.map((warning) => warning.code)).toContain(
      'PR_COMMENT_UNAVAILABLE',
    );
  });

  it('rejects missing workflow identity environment values', async () => {
    const { io } = collectingIO(inputs({ 'upload-report-artifact': 'false' }));
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
    const { io, warnings } = collectingIO(
      inputs({ 'upload-report-artifact': 'false' }),
    );
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
    expect(warnings[0]).toContain('code=REPOSITORY_METADATA_UNAVAILABLE');
  });

  it('applies a repository configuration file over bundled defaults', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const yaml = [
      'version: 1',
      'locale: ko',
      'carbon:',
      '  region: KR',
      'report:',
      '  pr-comment: false',
      '',
    ].join('\n');
    const { io } = collectingIO(
      inputs({ 'upload-report-artifact': 'false', locale: '' }),
    );
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () =>
          source(
            { visibility: 'public' },
            {
              async getFileContent() {
                return {
                  type: 'file',
                  encoding: 'base64',
                  size: yaml.length,
                  content: Buffer.from(yaml, 'utf8').toString('base64'),
                };
              },
            },
          ),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.carbon?.region).toBe('KR');
    expect(report.carbon?.regionResolved).toBe(true);
    expect(report.locale).toBe('ko');
  });

  it('rebuilds the critical path from the fetched workflow definition', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const workflow = [
      'name: CI',
      'jobs:',
      '  build:',
      '    name: build',
      '  greenci:',
      '    name: greenci',
      '    needs: [build]',
      '',
    ].join('\n');
    const { io, outputs } = collectingIO(
      inputs({ 'upload-report-artifact': 'false' }),
    );
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () =>
          source(
            { visibility: 'public' },
            {
              async getFileContent(parameters) {
                if (parameters.path === '.github/workflows/ci.yml') {
                  return {
                    type: 'file',
                    encoding: 'base64',
                    size: workflow.length,
                    content: Buffer.from(workflow, 'utf8').toString('base64'),
                  };
                }
                throw Object.assign(new Error('Not Found'), { status: 404 });
              },
            },
          ),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.criticalPath.method).toBe('dag');
    expect(report.criticalPath.path.map((node) => node.id)).toEqual(['build']);
    expect(report.shape.edgesAvailable).toBe(true);
    expect(outputs.get('critical-path-seconds')).toBe(60);
    expect(report.warnings.map((warning) => warning.code)).not.toContain(
      'WORKFLOW_DAG_UNAVAILABLE',
    );
  });

  it('fails the job only when a confident policy budget is exceeded', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const config = [
      'version: 1',
      'policy:',
      '  rules:',
      '    - metric: runner-time-regression-percent',
      '      operator: greater-than',
      '      value: 5',
      '      mode: fail',
      '      minimum-confidence: medium',
      '',
    ].join('\n');
    const { io, outputs, failures } = collectingIO(
      inputs({ 'upload-report-artifact': 'false' }),
    );
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () =>
          source(
            { visibility: 'public' },
            {
              async getFileContent(parameters) {
                if (parameters.path === '.greenci.yml') {
                  return {
                    type: 'file',
                    encoding: 'base64',
                    size: config.length,
                    content: Buffer.from(config, 'utf8').toString('base64'),
                  };
                }
                throw Object.assign(new Error('Not Found'), { status: 404 });
              },
              async listSuccessfulRuns() {
                return Array.from({ length: 6 }, (_, index) => ({
                  id: 700 + index,
                  run_attempt: 1,
                  head_sha: `sha${index}`,
                  head_branch: 'main',
                  created_at: '2026-07-19T00:00:00Z',
                  conclusion: 'success',
                }));
              },
              async listJobsForRunAttempt(parameters) {
                return parameters.runId === 100
                  ? currentJobs(60)
                  : [...currentJobs(20 + (parameters.runId % 3)).slice(0, 1)];
              },
            },
          ),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.baseline.status).toBe('ready');
    expect(report.policy.conclusion).toBe('fail');
    expect(outputs.get('policy-conclusion')).toBe('fail');
    expect(failures[0]).toContain('Policy budget exceeded');
  });

  it('does not fail the job with the default configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-action-test-'));
    temporaryDirectories.push(directory);
    const { io, outputs, failures } = collectingIO(
      inputs({ 'upload-report-artifact': 'false' }),
    );
    const report = await executeAction(
      io,
      { ...environment, RUNNER_TEMP: directory },
      {
        createSource: () => source(),
        now: () => new Date('2026-07-20T00:02:00.000Z'),
        workingDirectory: directory,
      },
    );
    expect(report.policy.conclusion).toBe('skipped');
    expect(outputs.get('policy-conclusion')).toBe('skipped');
    expect(failures).toEqual([]);
  });
});
