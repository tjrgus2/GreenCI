import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import type { AnalyzeWorkflowInput } from '../src/domain/schemas.js';

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(resolve(`schemas/${name}`), 'utf8')) as object;
}

const identity: AnalyzeWorkflowInput['identity'] = {
  owner: 'owner',
  repository: 'repo',
  workflowId: 1,
  workflowPath: '.github/workflows/ci.yml',
  runId: 7,
  runAttempt: 1,
  headSha: 'abc',
  headBranch: 'feature',
  baseBranch: 'main',
  event: 'pull_request',
  pullRequestNumber: 5,
  repositoryVisibility: 'public',
};

function jobs(durationSeconds: number): unknown[] {
  return [
    {
      id: 1,
      apiName: 'build',
      runnerLabels: ['ubuntu-latest'],
      runnerClass: 'linux-x64',
      startedAt: '2026-07-20T00:00:00.000Z',
      completedAt: new Date(
        Date.parse('2026-07-20T00:00:00.000Z') + durationSeconds * 1000,
      ).toISOString(),
      conclusion: 'success',
      steps: [],
    },
  ];
}

describe('published JSON Schema', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateReport = ajv.compile(loadSchema('report-v1.schema.json'));
  const validateConfig = ajv.compile(loadSchema('config.schema.json'));

  it('accepts a report produced by the analyzer', () => {
    const validate = validateReport;
    const report = analyzeWorkflow({
      identity,
      jobs: jobs(300),
      generatedAt: '2026-07-20T00:10:00.000Z',
      baseline: {
        available: true,
        branch: 'main',
        samples: [100, 102, 99].map((seconds, index) => ({
          runId: index + 1,
          runAttempt: 1,
          headSha: `sha-${index}`,
          jobs: jobs(seconds),
        })),
      },
    });
    const serialized: unknown = JSON.parse(JSON.stringify(report)) as unknown;
    expect(validate(serialized), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects an unknown top-level field', () => {
    const validate = validateReport;
    const report = analyzeWorkflow({
      identity,
      jobs: jobs(60),
      generatedAt: '2026-07-20T00:10:00.000Z',
    });
    expect(validate({ ...report, surprise: true })).toBe(false);
  });

  it('describes the repository configuration file', () => {
    expect(validateConfig({ version: 1, locale: 'ko' })).toBe(true);
    expect(validateConfig({})).toBe(true);
    expect(validateConfig({ verison: 1 })).toBe(false);
    expect(validateConfig({ locale: 'fr' })).toBe(false);
  });
});
