import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import type { AnalysisReport } from '../src/domain/report.js';
import { renderJobSummary } from '../src/reporting/markdown.js';
import { renderPullRequestComment } from '../src/reporting/pr-comment.js';

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function at(seconds: number): string {
  return new Date(epoch + seconds * 1000).toISOString();
}

const identity = {
  owner: 'owner',
  repository: 'repo',
  workflowId: 1,
  workflowPath: '.github/workflows/ci.yml',
  runId: 500,
  runAttempt: 1,
  headSha: 'abc123',
  headBranch: 'feature',
  baseBranch: 'main',
  event: 'pull_request',
  pullRequestNumber: 4,
  repositoryVisibility: 'private' as const,
};

function job(
  id: number,
  apiName: string,
  start: number,
  duration: number,
  steps: readonly {
    name: string;
    start: number;
    duration: number;
    conclusion?: 'success' | 'failure';
  }[] = [],
  conclusion: 'success' | 'failure' = 'success',
): unknown {
  return {
    id,
    apiName,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: at(start),
    completedAt: at(start + duration),
    conclusion,
    steps: steps.map((step, index) => ({
      index: index + 1,
      name: step.name,
      normalizedName: step.name.toLocaleLowerCase('en-US'),
      startedAt: at(step.start),
      completedAt: at(step.start + step.duration),
      conclusion: step.conclusion ?? 'success',
      isRunnerInternal: false,
    })),
  };
}

const workflowDefinition = {
  jobs: {
    build: { name: 'Build' },
    test: { name: 'Test', needs: ['build'] },
    security: { name: 'Security', strategy: { matrix: { rule: [1, 2, 3] } } },
  },
};

function currentJobs(): unknown[] {
  return [
    job(1, 'Build', 0, 120, [
      { name: 'npm ci', start: 0, duration: 90 },
      { name: 'Compile', start: 90, duration: 30 },
    ]),
    job(
      2,
      'Test',
      120,
      300,
      [
        { name: 'npm ci', start: 120, duration: 90 },
        {
          name: 'Integration tests',
          start: 210,
          duration: 210,
          conclusion: 'failure',
        },
      ],
      'failure',
    ),
    job(3, 'Security (1)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
    job(4, 'Security (2)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
    job(5, 'Security (3)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
  ];
}

function baselineJobs(testDuration: number): unknown[] {
  return [
    job(1, 'Build', 0, 120, [
      { name: 'npm ci', start: 0, duration: 90 },
      { name: 'Compile', start: 90, duration: 30 },
    ]),
    job(2, 'Test', 120, testDuration, [
      { name: 'npm ci', start: 120, duration: 90 },
      {
        name: 'Integration tests',
        start: 210,
        duration: testDuration - 90,
      },
    ]),
    job(3, 'Security (1)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
    job(4, 'Security (2)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
    job(5, 'Security (3)', 0, 200, [{ name: 'Scan', start: 0, duration: 200 }]),
  ];
}

const tests = {
  artifact: 'test-results',
  total: 4,
  passed: 2,
  failed: 1,
  errored: 1,
  skipped: 0,
  durationSeconds: 12.5,
  parsedFiles: 1,
  truncated: false,
  slowestSuites: [
    { name: 'integration', total: 4, failed: 2, durationSeconds: 12.5 },
  ],
  slowestCases: [
    {
      suite: 'integration',
      name: 'slow path',
      durationSeconds: 9,
      status: 'passed' as const,
    },
  ],
  failedCases: [
    {
      suite: 'integration',
      name: 'checkout | broken',
      durationSeconds: 2,
      status: 'failed' as const,
      message: 'expected <ok> got <bad>',
    },
  ],
  rejections: [{ path: '../escape.xml', reason: 'path-traversal' }],
};

const diagnostics = {
  enabled: true,
  jobsParsed: 1,
  annotationsEmitted: 1,
  diagnostics: [
    {
      parserId: 'typescript',
      severity: 'error' as const,
      message: 'TS2345 Argument of type string is not assignable',
      file: 'src/app.ts',
      line: 12,
      column: 5,
      confidence: 0.92,
      fingerprint: 'a'.repeat(32),
      jobName: 'Test',
    },
  ],
};

function report(
  locale: 'en' | 'ko' = 'en',
  overrides: Record<string, unknown> = {},
): AnalysisReport {
  return analyzeWorkflow({
    identity,
    jobs: currentJobs(),
    generatedAt: at(600),
    locale,
    workflowDefinition,
    baseline: {
      available: true,
      branch: 'main',
      samples: [120, 118, 122, 119, 121].map((duration, index) => ({
        runId: index + 1,
        runAttempt: 1,
        headSha: `sha-${index}`,
        jobs: baselineJobs(duration),
      })),
    },
    tests,
    diagnostics,
    config: {
      policy: {
        rules: [
          {
            metric: 'runner-time-regression-percent',
            operator: 'greater-than',
            value: 10,
            mode: 'warn',
          },
          {
            metric: 'failed-jobs',
            operator: 'greater-than',
            value: 0,
            mode: 'report',
          },
          {
            metric: 'critical-path-regression-percent',
            operator: 'greater-than',
            value: 500,
            mode: 'fail',
          },
        ],
      },
      recommendations: { 'minimum-confidence': 0.5, 'max-count': 8 },
    },
    ...overrides,
  });
}

describe('week 3 analysis wiring', () => {
  const analysis = report();

  it('separates the critical path from parallel resource hotspots', () => {
    expect(analysis.criticalPath.method).toBe('dag');
    expect(analysis.criticalPath.path.map((node) => node.id)).toEqual([
      'build',
      'test',
    ]);
    expect(analysis.criticalPath.totalSeconds).toBe(420);
    // The security matrix consumes 600s of runner time but delays nobody.
    expect(
      analysis.criticalPath.nonCriticalHotspots.map((entry) => entry.id),
    ).toEqual(['security']);
    expect(analysis.criticalPath.confidence).toBe('medium');
  });

  it('records the failed job and the failed step', () => {
    expect(analysis.failures.failedJobCount).toBe(1);
    expect(analysis.failures.failures[0]?.failedStepName).toBe(
      'Integration tests',
    );
  });

  it('produces evidence-backed recommendations', () => {
    const ids = analysis.recommendations.map((entry) => entry.ruleId);
    expect(ids).toContain('GCI-REGRESSION-001');
    expect(ids).toContain('GCI-CRITICAL-001');
    expect(ids).toContain('GCI-CACHE-001');
    expect(ids).toContain('GCI-MATRIX-001');
    expect(ids).toContain('GCI-ORDER-001');
    expect(analysis.recommendations[0]?.severity).toBe('critical');
  });

  it('evaluates policies without failing on an unmet fail rule', () => {
    expect(analysis.policy.conclusion).toBe('warn');
    const criticalPathRule = analysis.policy.evaluations.find(
      (entry) => entry.metric === 'critical-path-regression-percent',
    );
    expect(criticalPathRule?.evaluated).toBe(true);
    expect(criticalPathRule?.passed).toBe(true);
  });

  it('stays schema-valid and deterministic with every Week 3 section', () => {
    expect(JSON.stringify(report())).toBe(JSON.stringify(report()));
    expect(analysis.tests?.total).toBe(4);
    expect(analysis.diagnostics?.enabled).toBe(true);
  });
});

describe('week 3 rendering', () => {
  const markdown = renderJobSummary(report());
  const comment = renderPullRequestComment(report());

  it('renders every Job Summary section without unsafe or invalid output', () => {
    for (const heading of [
      '## Critical path',
      '### Non-critical resource hotspots',
      '## Recommendations',
      '## Policy',
      '## Failures',
      '## Test report',
      '## Failure diagnostics',
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain('Reconstructed from the workflow needs graph');
    expect(markdown).toContain('`GCI-CRITICAL-001`');
    expect(markdown).toContain('Evidence');
    expect(markdown).toContain('Estimated upper-bound saving');
    expect(markdown).toContain('`src/app.ts:12`');
    expect(markdown).toContain('path-traversal');
    // Repository-controlled test names must be escaped.
    expect(markdown).toContain('checkout \\| broken');
    expect(markdown).not.toContain('NaN');
    expect(markdown).not.toContain('Infinity');
    expect(markdown).not.toContain('undefined');
  });

  it('keeps the pull-request comment concise but decision-ready', () => {
    expect(comment).toContain('**Critical path:**');
    expect(comment).toContain('## Recommendations');
    expect(comment).toContain('**Policy:**');
    expect(comment).not.toContain('## Test report');
    expect(comment).not.toContain('Evidence');
    expect(comment).not.toContain('NaN');
  });

  it('renders the Week 3 sections in Korean', () => {
    const korean = renderJobSummary(report('ko'));
    expect(korean).toContain('## Critical Path');
    expect(korean).toContain('## 개선 제안');
    expect(korean).toContain('## 정책');
    expect(korean).toContain('## 테스트 리포트');
    expect(korean).toContain('## 실패 진단');
    expect(korean).toContain('워크플로 needs 그래프로 재구성함');
    expect(korean).not.toContain('NaN');
  });

  it('states clearly when optional analysis is unavailable', () => {
    const minimal = analyzeWorkflow({
      identity,
      jobs: [
        job(1, 'Build', 0, 60, [{ name: 'Compile', start: 0, duration: 60 }]),
      ],
      generatedAt: at(600),
    });
    const summary = renderJobSummary(minimal);
    expect(summary).toContain('Interval-overlap estimate');
    expect(summary).toContain('No test-report artifact was analyzed.');
    expect(summary).toContain('Failed-log parsing is disabled');
    expect(summary).toContain('_No job failed._');
    expect(summary).toContain('No policy configured');
    expect(summary).toContain(
      'No recommendation reached the confidence threshold.',
    );
    // The fallback still ranks jobs, but the comment must never present it as
    // an exact DAG critical path.
    const minimalComment = renderPullRequestComment(minimal);
    expect(minimalComment).toContain('**Critical path:**');
    expect(minimalComment).toContain('Interval-overlap estimate');
    expect(minimalComment).toContain('not an exact DAG critical path');
  });

  it('marks a disabled critical-path analysis instead of guessing', () => {
    const disabled = analyzeWorkflow({
      identity,
      jobs: currentJobs(),
      generatedAt: at(600),
      workflowDefinition,
      config: { analysis: { 'critical-path': { enabled: false } } },
    });
    expect(disabled.criticalPath.method).toBe('unavailable');
    expect(disabled.criticalPath.reasons).toContain('critical-path-disabled');
    expect(renderJobSummary(disabled)).toContain('Not available for this run');
  });
});
