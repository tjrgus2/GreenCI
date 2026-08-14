import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import { excludeAnalyzerJob } from '../src/analysis/exclusion.js';
import { AnalysisReportSchema } from '../src/domain/report.js';
import {
  AnalyzeWorkflowInputSchema,
  type AnalyzeWorkflowInput,
  type NormalizedJob,
} from '../src/domain/schemas.js';

function job(id: number, name: string, completed = true): NormalizedJob {
  return {
    id,
    apiName: name,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: '2026-07-20T00:00:00.000Z',
    ...(completed ? { completedAt: '2026-07-20T00:01:00.000Z' } : {}),
    conclusion: completed ? 'success' : 'unknown',
    steps: [],
  };
}

const input: AnalyzeWorkflowInput = {
  identity: {
    owner: 'owner',
    repository: 'repository',
    workflowId: 1,
    workflowPath: '.github/workflows/ci.yml',
    runId: 2,
    runAttempt: 1,
    headSha: 'abc123',
    headBranch: 'feature',
    baseBranch: 'main',
    event: 'pull_request',
    pullRequestNumber: 3,
    repositoryVisibility: 'public',
  },
  jobs: [job(1, 'build'), job(2, 'GreenCI', false)],
  currentJobName: 'greenci',
  generatedAt: '2026-07-20T00:02:00.000Z',
  warnings: [],
};

describe('excludeAnalyzerJob', () => {
  it('uses a normalized exact name match without a heuristic', () => {
    const result = excludeAnalyzerJob(input.jobs, 'green-ci');
    expect(result.excludedJobIds).toEqual([2]);
    expect(result.method).toBe('name');
    expect(result.heuristic).toBe(false);
  });

  it('falls back to the only in-progress job and discloses the heuristic', () => {
    const result = excludeAnalyzerJob(input.jobs, 'different-name');
    expect(result.excludedJobIds).toEqual([2]);
    expect(result.method).toBe('in-progress');
    expect(result.heuristic).toBe(true);
  });

  it('does not guess when multiple jobs are in progress', () => {
    const result = excludeAnalyzerJob(
      [...input.jobs, job(3, 'another', false)],
      undefined,
    );
    expect(result.excludedJobIds).toEqual([]);
    expect(result.method).toBe('none');
  });
});

describe('analyzeWorkflow', () => {
  it('validates, excludes itself, and returns schema-valid JSON data', () => {
    const report = analyzeWorkflow(input);
    expect(report.jobs.map(({ apiName }) => apiName)).toEqual(['build']);
    expect(report.current.runnerSeconds).toBe(60);
    expect(report.current.wallClockSeconds).toBe(60);
    expect(report.analyzerExclusion.method).toBe('name');
    expect(report.schemaVersion).toBe('1.1.0');
    expect(report.locale).toBe('en');
    expect(report.shape.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(report.dataManifest.length).toBeGreaterThan(0);
    expect(AnalysisReportSchema.parse(report)).toEqual(report);
  });

  it('is byte-for-byte reproducible for identical input', () => {
    expect(JSON.stringify(analyzeWorkflow(input))).toBe(
      JSON.stringify(analyzeWorkflow(input)),
    );
  });

  it('rejects unknown persisted-input keys', () => {
    expect(() =>
      AnalyzeWorkflowInputSchema.parse({ ...input, unexpected: true }),
    ).toThrow();
  });

  it('warns about incomplete step timestamps and unidentified analyzers', () => {
    const report = analyzeWorkflow({
      ...input,
      currentJobName: 'missing',
      jobs: [
        {
          ...job(1, 'build'),
          steps: [
            {
              index: 1,
              name: 'partial',
              normalizedName: 'partial',
              conclusion: 'unknown',
              isRunnerInternal: false,
            },
          ],
        },
      ],
    });
    expect(report.warnings.map((warning) => warning.code)).toEqual([
      'ANALYZER_NOT_IDENTIFIED',
      'STEP_TIMESTAMPS_INCOMPLETE',
      'BASELINE_UNAVAILABLE',
    ]);
  });

  it('reports an unavailable baseline without cost or carbon regressions', () => {
    const report = analyzeWorkflow(input);
    expect(report.baseline.status).toBe('unavailable');
    expect(report.baseline.metrics).toEqual([]);
    expect(report.cost?.billingBasis).toBe('standard-public-free');
    expect(report.carbon?.operationalCarbonGrams.p50).toBeGreaterThan(0);
  });

  it('honours a repository configuration that disables estimation', () => {
    const report = analyzeWorkflow({
      ...input,
      config: { cost: { enabled: false }, carbon: { enabled: false } },
    });
    expect(report.cost).toBeUndefined();
    expect(report.carbon).toBeUndefined();
  });

  it('keeps every job when analyzer exclusion is disabled', () => {
    const report = analyzeWorkflow({
      ...input,
      config: { analysis: { 'exclude-current-job': false } },
    });
    expect(report.jobs).toHaveLength(2);
    expect(report.analyzerExclusion.method).toBe('none');
  });
});
