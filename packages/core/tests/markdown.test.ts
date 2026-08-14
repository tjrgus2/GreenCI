import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import type { AnalysisReport } from '../src/domain/report.js';
import type { AnalyzeWorkflowInput } from '../src/domain/schemas.js';
import {
  escapeMarkdown,
  formatDuration,
  formatGrams,
  formatKwh,
  formatNumber,
  formatRatio,
  formatSignedPercent,
  formatUsd,
  truncate,
} from '../src/reporting/format.js';
import { renderJobSummary } from '../src/reporting/markdown.js';
import {
  REPORT_MARKER,
  renderPullRequestComment,
} from '../src/reporting/pr-comment.js';

const identity: AnalyzeWorkflowInput['identity'] = {
  owner: 'owner',
  repository: 'repo',
  workflowId: 1,
  workflowPath: '.github/workflows/ci.yml',
  runId: 1,
  runAttempt: 1,
  headSha: 'abc',
  headBranch: 'feature',
  baseBranch: 'main',
  event: 'pull_request',
  pullRequestNumber: 5,
  repositoryVisibility: 'private',
};

function baselineJobs(durationSeconds: number): unknown[] {
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
      steps: [
        {
          index: 1,
          name: 'install',
          normalizedName: 'install',
          startedAt: '2026-07-20T00:00:00.000Z',
          completedAt: new Date(
            Date.parse('2026-07-20T00:00:00.000Z') +
              (durationSeconds / 2) * 1000,
          ).toISOString(),
          conclusion: 'success',
          isRunnerInternal: false,
        },
      ],
    },
  ];
}

function report(locale: 'en' | 'ko' = 'en'): AnalysisReport {
  return analyzeWorkflow({
    identity,
    jobs: baselineJobs(300),
    generatedAt: '2026-07-20T00:10:00.000Z',
    locale,
    baseline: {
      available: true,
      branch: 'main',
      samples: [100, 102, 99, 101, 98].map((seconds, index) => ({
        runId: index + 1,
        runAttempt: 1,
        headSha: `sha-${index}`,
        jobs: baselineJobs(seconds),
      })),
    },
  });
}

describe('report formatting helpers', () => {
  it('escapes repository-controlled table and HTML syntax', () => {
    expect(escapeMarkdown('bad|`name`<tag>\nnext')).toBe(
      'bad\\|\\`name\\`&lt;tag&gt;<br>next',
    );
  });

  it('formats finite values safely and never emits NaN', () => {
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(Number.NaN)).toBe('Unavailable');
    expect(formatDuration(-1)).toBe('0s');
    expect(formatSignedPercent(14.94)).toBe('▲ 14.9%');
    expect(formatSignedPercent(-12)).toBe('▼ 12.0%');
    expect(formatSignedPercent(0)).toBe('▬ 0.0%');
    expect(formatSignedPercent(undefined)).toBe('—');
    expect(formatSignedPercent(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatUsd(0.018)).toBe('$0.0180');
    expect(formatUsd(2)).toBe('$2.00');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatGrams(3.1)).toBe('3.10 gCO₂eq');
    expect(formatGrams(0.001)).toBe('0.0010 gCO₂eq');
    expect(formatGrams(undefined)).toBe('—');
    expect(formatKwh(0.000012)).toBe('0.000012 kWh');
    expect(formatKwh(undefined)).toBe('—');
    expect(formatRatio(0.9612)).toBe('96.1%');
    expect(formatRatio(undefined)).toBe('—');
    expect(formatNumber(1.23456, 2)).toBe('1.23');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('Job Summary', () => {
  it('renders jobs, steps, and escaped names', () => {
    const escaped = analyzeWorkflow({
      identity,
      jobs: [
        {
          id: 1,
          apiName: 'build | unsafe',
          runnerLabels: ['ubuntu-latest'],
          runnerClass: 'linux-x64',
          startedAt: '2026-07-20T00:00:00.000Z',
          completedAt: '2026-07-20T00:01:00.000Z',
          conclusion: 'success',
          steps: [
            {
              index: 1,
              name: '<script>',
              normalizedName: '<script>',
              startedAt: '2026-07-20T00:00:00.000Z',
              completedAt: '2026-07-20T00:00:30.000Z',
              conclusion: 'success',
              isRunnerInternal: false,
            },
          ],
        },
      ],
      generatedAt: '2026-07-20T00:02:00.000Z',
    });
    const markdown = renderJobSummary(escaped);
    expect(markdown).toContain('build \\| unsafe');
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).not.toContain('<script>');
  });

  it('includes baseline, cost, carbon, and provenance sections', () => {
    const markdown = renderJobSummary(report());
    expect(markdown).toContain('Baseline comparison');
    expect(markdown).toContain('runner-seconds');
    expect(markdown).toContain('Gross list-price equivalent');
    expect(markdown).toContain('gCO₂eq');
    expect(markdown).toContain('github-pricing@');
    expect(markdown).toContain('modeled operational emissions');
    expect(markdown).not.toContain('NaN');
    expect(markdown).not.toContain('Infinity');
  });

  it('renders the same structure in Korean', () => {
    const markdown = renderJobSummary(report('ko'));
    expect(markdown).toContain('기준선 비교');
    expect(markdown).toContain('러너 시간');
    expect(markdown).toContain('정가 환산 총액');
    expect(markdown).not.toContain('NaN');
  });
});

describe('pull-request comment', () => {
  it('starts with the hidden idempotency marker', () => {
    const markdown = renderPullRequestComment(report());
    expect(markdown.startsWith(REPORT_MARKER)).toBe(true);
    expect(markdown).toContain('🌱 GreenCI Report');
  });

  it('shows an absent z-score rather than 0.00 when no robust scale exists', () => {
    const uniformBaseline = analyzeWorkflow({
      identity,
      jobs: baselineJobs(300),
      generatedAt: '2026-07-20T00:10:00.000Z',
      baseline: {
        available: true,
        branch: 'main',
        samples: [100, 100, 100, 100, 100].map((seconds, index) => ({
          runId: index + 1,
          runAttempt: 1,
          headSha: `sha-${index}`,
          jobs: baselineJobs(seconds),
        })),
      },
    });
    const runnerTime = uniformBaseline.baseline.metrics.find(
      (metric) => metric.metric === 'runner-seconds',
    );
    expect(runnerTime?.scaleMethod).toBe('unavailable');
    expect(runnerTime?.modifiedZScore).toBe(0);
    expect(runnerTime?.verdict).toBe('regression');

    const markdown = renderPullRequestComment(uniformBaseline);
    const regressionRow = markdown
      .split('\n')
      .find((line) => line.includes('`build`'));
    expect(regressionRow).toContain('▲ 200.0%');
    expect(regressionRow).not.toContain('0.00');
    expect(regressionRow?.endsWith('— |')).toBe(true);
  });

  it('answers regression, size, cause, and method in order', () => {
    const markdown = renderPullRequestComment(report(), { topHotspots: 3 });
    const headline = markdown.indexOf('Runner time increased by');
    const table = markdown.indexOf('🖥 Runner time');
    const regressions = markdown.indexOf('Top regressions');
    const details = markdown.indexOf('Estimation and data-quality details');
    expect(headline).toBeGreaterThan(0);
    expect(table).toBeGreaterThan(headline);
    expect(regressions).toBeGreaterThan(table);
    expect(details).toBeGreaterThan(regressions);
    expect(markdown).toContain('Confidence');
  });

  it('states that no baseline was available instead of inventing one', () => {
    const withoutBaseline = analyzeWorkflow({
      identity,
      jobs: baselineJobs(120),
      generatedAt: '2026-07-20T00:10:00.000Z',
    });
    const markdown = renderPullRequestComment(withoutBaseline);
    expect(markdown).toContain('No comparable baseline run was available');
    expect(markdown).toContain('—');
  });

  it('translates the comment to Korean', () => {
    const markdown = renderPullRequestComment(report('ko'));
    expect(markdown).toContain('러너 시간이');
    expect(markdown).toContain('추정 방식과 데이터 품질');
  });
});

describe('degraded and disabled rendering', () => {
  function withBaseline(
    currentSeconds: number,
    samples: readonly number[],
    extra: Record<string, unknown> = {},
  ): AnalysisReport {
    return analyzeWorkflow({
      identity,
      jobs: baselineJobs(currentSeconds),
      generatedAt: '2026-07-20T00:10:00.000Z',
      baseline: {
        available: true,
        branch: 'main',
        samples: samples.map((seconds, index) => ({
          runId: index + 1,
          runAttempt: 1,
          headSha: `sha-${index}`,
          jobs: baselineJobs(seconds),
        })),
      },
      ...extra,
    });
  }

  it('announces an improvement and a stable run', () => {
    const improved = renderPullRequestComment(
      withBaseline(40, [100, 102, 99, 101, 98]),
    );
    expect(improved).toContain('Runner time decreased by');
    const stable = renderPullRequestComment(
      withBaseline(100, [100, 102, 99, 101, 98]),
    );
    expect(stable).toContain('No statistically significant change');
    expect(stable).toContain('_None_');
  });

  it('explains an insufficient sample and a changed workflow shape', () => {
    expect(renderPullRequestComment(withBaseline(100, [100, 102]))).toContain(
      'Only 2 comparable baseline runs',
    );
    const rebuilt = analyzeWorkflow({
      identity,
      jobs: baselineJobs(100),
      generatedAt: '2026-07-20T00:10:00.000Z',
      baseline: {
        available: true,
        branch: 'main',
        samples: [
          {
            runId: 1,
            runAttempt: 1,
            headSha: 'sha-1',
            jobs: [
              {
                id: 9,
                apiName: 'completely-different',
                runnerLabels: ['ubuntu-latest'],
                runnerClass: 'linux-x64',
                startedAt: '2026-07-20T00:00:00.000Z',
                completedAt: '2026-07-20T00:01:00.000Z',
                conclusion: 'success',
                steps: [],
              },
            ],
          },
        ],
      },
    });
    expect(renderPullRequestComment(rebuilt)).toContain(
      'workflow structure changed',
    );
  });

  it('marks disabled cost and carbon sections instead of inventing values', () => {
    const markdown = renderJobSummary(
      withBaseline(100, [100, 102, 99], {
        config: { cost: { enabled: false }, carbon: { enabled: false } },
      }),
    );
    expect(markdown).toContain('## Cost\n\n_Disabled_');
    expect(markdown).toContain('## Carbon\n\n_Disabled_');
    expect(markdown).not.toContain('NaN');
  });

  it('discloses unknown runner classes and warnings', () => {
    const unknownRunner = analyzeWorkflow({
      identity,
      jobs: [
        {
          id: 1,
          apiName: 'exotic',
          runnerLabels: ['moon-latest'],
          runnerClass: 'unknown',
          startedAt: '2026-07-20T00:00:00.000Z',
          completedAt: '2026-07-20T00:01:00.000Z',
          conclusion: 'success',
          steps: [],
        },
      ],
      generatedAt: '2026-07-20T00:10:00.000Z',
      config: { carbon: { region: 'ZZ' } },
    });
    const markdown = renderJobSummary(unknownRunner);
    expect(markdown).toContain('No price is applied to unknown runner classes');
    expect(markdown).toContain(
      'No power model is applied to unknown runner classes',
    );
    expect(markdown).toContain('RUNNER_MODEL_UNKNOWN');
    expect(markdown).toContain('CARBON_REGION_UNKNOWN');
    expect(markdown).toContain('(fallback)');
  });

  it('reports no warnings when there is nothing to disclose', () => {
    const analyzerJob = {
      id: 99,
      apiName: 'greenci',
      runnerLabels: ['ubuntu-latest'],
      runnerClass: 'linux-x64',
      startedAt: '2026-07-20T00:05:00.000Z',
      completedAt: '2026-07-20T00:06:00.000Z',
      conclusion: 'success',
      steps: [],
    };
    const clean = analyzeWorkflow({
      identity,
      jobs: [...baselineJobs(100), analyzerJob],
      currentJobName: 'greenci',
      generatedAt: '2026-07-20T00:10:00.000Z',
      workflowDefinition: { jobs: { build: {}, greenci: { needs: 'build' } } },
      baseline: {
        available: true,
        branch: 'main',
        samples: [100, 102, 99].map((seconds, index) => ({
          runId: index + 1,
          runAttempt: 1,
          headSha: `sha-${index}`,
          jobs: baselineJobs(seconds),
        })),
      },
    });
    expect(clean.warnings).toEqual([]);
    expect(renderJobSummary(clean)).toContain('No warnings.');
  });
});
