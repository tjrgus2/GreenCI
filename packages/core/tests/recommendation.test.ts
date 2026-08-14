import { describe, expect, it } from 'vitest';
import { compareWithBaseline } from '../src/analysis/baseline.js';
import { analyzeCriticalPath } from '../src/analysis/critical-path.js';
import {
  buildWorkflowDag,
  parseWorkflowDefinition,
} from '../src/analysis/dag.js';
import { analyzeFailures } from '../src/analysis/failures.js';
import { analyzeRuntime } from '../src/analysis/runtime.js';
import type { NormalizedJob, NormalizedStep } from '../src/domain/schemas.js';
import { estimateCost } from '../src/estimation/cost.js';
import {
  BUILT_IN_RULES,
  evaluateRecommendations,
} from '../src/recommendation/index.js';
import type { AnalysisContext } from '../src/recommendation/types.js';

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function step(
  index: number,
  name: string,
  startSeconds: number,
  durationSeconds: number,
  conclusion: NormalizedStep['conclusion'] = 'success',
): NormalizedStep {
  return {
    index,
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    startedAt: new Date(epoch + startSeconds * 1000).toISOString(),
    completedAt: new Date(
      epoch + (startSeconds + durationSeconds) * 1000,
    ).toISOString(),
    durationSeconds,
    conclusion,
    isRunnerInternal: false,
  };
}

function job(
  id: number,
  name: string,
  startSeconds: number,
  durationSeconds: number,
  steps: readonly NormalizedStep[] = [],
  overrides: Partial<NormalizedJob> = {},
): NormalizedJob {
  return {
    id,
    apiName: name,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: new Date(epoch + startSeconds * 1000).toISOString(),
    completedAt: new Date(
      epoch + (startSeconds + durationSeconds) * 1000,
    ).toISOString(),
    durationSeconds,
    conclusion: 'success',
    steps: [...steps],
    ...overrides,
  };
}

function context(
  jobs: readonly NormalizedJob[],
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  const runtime = analyzeRuntime(jobs);
  const baseline = compareWithBaseline({
    workflowPath: 'ci.yml',
    currentRunId: 1,
    currentJobs: jobs,
    samples: [],
    branch: 'main',
    requestedRuns: 7,
    minimumSamples: 3,
    shapeThreshold: 0.8,
    regressionPercent: 15,
    modifiedZScoreThreshold: 3.5,
    available: false,
  });
  return {
    jobs,
    runtime,
    baseline,
    criticalPath: {
      method: 'unavailable',
      confidence: 'low',
      totalSeconds: 0,
      wallClockSharePercent: 0,
      path: [],
      nonCriticalHotspots: [],
      reasons: [],
    },
    failures: analyzeFailures(jobs),
    cost: estimateCost(jobs, { repositoryVisibility: 'private' }),
    carbon: undefined,
    ...overrides,
  };
}

function ruleIds(analysis: AnalysisContext, minimumConfidence = 0): string[] {
  return evaluateRecommendations(analysis, {
    enabled: true,
    minimumConfidence,
    maxCount: 20,
  }).recommendations.map((entry) => entry.ruleId);
}

describe('recommendation engine', () => {
  it('produces nothing when disabled', () => {
    const result = evaluateRecommendations(context([job(1, 'Build', 0, 60)]), {
      enabled: false,
      minimumConfidence: 0,
      maxCount: 5,
    });
    expect(result.recommendations).toEqual([]);
    expect(result.evaluatedRules).toBe(0);
  });

  it('flags a slow dependency install (GCI-CACHE-001)', () => {
    const jobs = [
      job(1, 'Build', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Build', 150, 50),
      ]),
    ];
    const recommendation = evaluateRecommendations(context(jobs), {
      enabled: true,
      minimumConfidence: 0,
      maxCount: 5,
    }).recommendations.find((entry) => entry.ruleId === 'GCI-CACHE-001');
    expect(recommendation).toBeDefined();
    expect(recommendation?.severity).toBe('warning');
    expect(
      recommendation?.evidence.find(
        (entry) => entry.metric === 'install-share-percent',
      )?.observed,
    ).toBe(75);
    expect(recommendation?.estimatedImpact?.upperBound).toBe(true);
    expect(recommendation?.estimatedImpact?.runnerSeconds).toBe(105);
  });

  it('flags a repeated step across jobs (GCI-DUP-001)', () => {
    const install = step(1, 'npm ci', 0, 60);
    const jobs = [
      job(1, 'Build', 0, 120, [install, step(2, 'Build', 60, 60)]),
      job(2, 'Test', 0, 120, [install, step(2, 'Test', 60, 60)]),
    ];
    const ids = ruleIds(context(jobs));
    expect(ids).toContain('GCI-DUP-001');
    expect(ids).toContain('GCI-CACHE-001');
  });

  it('flags an expensive matrix fan-out (GCI-MATRIX-001)', () => {
    const jobs = [
      job(1, 'Test (18)', 0, 200),
      job(2, 'Test (20)', 0, 200),
      job(3, 'Test (22)', 0, 200),
      job(4, 'Build', 0, 30),
    ];
    expect(ruleIds(context(jobs))).toContain('GCI-MATRIX-001');
  });

  it('does not flag a small matrix', () => {
    const jobs = [job(1, 'Test (18)', 0, 60), job(2, 'Test (20)', 0, 60)];
    expect(ruleIds(context(jobs))).not.toContain('GCI-MATRIX-001');
  });

  it('flags a late failure (GCI-ORDER-001)', () => {
    const jobs = [
      job(1, 'Lint', 0, 10),
      job(2, 'Integration', 0, 300, [step(1, 'Run', 0, 300, 'failure')], {
        conclusion: 'failure',
      }),
    ];
    const analysis = context(jobs);
    expect(analysis.failures.firstFailureWallClockPercent).toBe(100);
    expect(ruleIds(analysis)).toContain('GCI-ORDER-001');
  });

  it('flags a critical-path bottleneck (GCI-CRITICAL-001)', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: {
        build: { name: 'Build' },
        test: { name: 'Test', needs: 'build' },
      },
    });
    if (definition === undefined) {
      return;
    }
    const jobs = [job(1, 'Build', 0, 20), job(2, 'Test', 20, 300)];
    const dag = buildWorkflowDag(definition, jobs);
    const criticalPath = analyzeCriticalPath(dag, 320);
    const analysis = context(jobs, { criticalPath });
    const recommendation = evaluateRecommendations(analysis, {
      enabled: true,
      minimumConfidence: 0,
      maxCount: 5,
    }).recommendations.find((entry) => entry.ruleId === 'GCI-CRITICAL-001');
    expect(recommendation?.confidence).toBe(0.85);
    expect(
      recommendation?.evidence.find(
        (entry) => entry.metric === 'critical-path-job',
      )?.observed,
    ).toBe('Test');
  });

  it('flags a statistical regression and high variability', () => {
    const jobs = [job(1, 'Build', 0, 400)];
    const baseline = compareWithBaseline({
      workflowPath: 'ci.yml',
      currentRunId: 1,
      currentJobs: jobs,
      samples: [80, 150, 90, 160, 100, 170].map((seconds, index) => ({
        runId: index + 1,
        runAttempt: 1,
        headSha: `sha-${index}`,
        jobs: [job(1, 'Build', 0, seconds)],
      })),
      branch: 'main',
      requestedRuns: 7,
      minimumSamples: 3,
      shapeThreshold: 0.8,
      regressionPercent: 15,
      modifiedZScoreThreshold: 3.5,
      available: true,
    });
    const ids = ruleIds(context(jobs, { baseline }));
    expect(ids).toContain('GCI-REGRESSION-001');
    expect(ids).toContain('GCI-FLAKY-001');
  });

  it('flags runner queue pressure (GCI-QUEUE-001)', () => {
    const jobs = [
      job(1, 'Build', 120, 60, [], {
        createdAt: new Date(epoch).toISOString(),
        queueSeconds: 120,
      }),
    ];
    expect(ruleIds(context(jobs))).toContain('GCI-QUEUE-001');
  });

  it('suppresses a recommendation below the confidence threshold', () => {
    const jobs = [
      job(1, 'Build', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Build', 150, 50),
      ]),
    ];
    const result = evaluateRecommendations(context(jobs), {
      enabled: true,
      minimumConfidence: 0.95,
      maxCount: 5,
    });
    expect(result.recommendations).toEqual([]);
    expect(result.suppressedByConfidence).toBeGreaterThan(0);
  });

  it('orders by severity then confidence and honours the count limit', () => {
    const jobs = [
      job(1, 'Build', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Build', 150, 50),
      ]),
      job(2, 'Test', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Test', 150, 50),
      ]),
    ];
    const result = evaluateRecommendations(context(jobs), {
      enabled: true,
      minimumConfidence: 0,
      maxCount: 1,
    });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.severity).toBe('warning');
  });

  it('isolates a rule that throws', () => {
    const result = evaluateRecommendations(context([job(1, 'Build', 0, 60)]), {
      enabled: true,
      minimumConfidence: 0,
      maxCount: 5,
      rules: [
        {
          id: 'GCI-BROKEN-001',
          version: 1,
          evaluate() {
            throw new Error('rule bug');
          },
        },
        ...BUILT_IN_RULES,
      ],
    });
    expect(result.failedRuleIds).toEqual(['GCI-BROKEN-001']);
  });

  it('gives every recommendation a rule id, evidence, and confidence', () => {
    const jobs = [
      job(1, 'Build', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Build', 150, 50),
      ]),
      job(2, 'Test', 0, 200, [
        step(1, 'npm ci', 0, 150),
        step(2, 'Test', 150, 50),
      ]),
    ];
    const result = evaluateRecommendations(context(jobs), {
      enabled: true,
      minimumConfidence: 0,
      maxCount: 20,
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const recommendation of result.recommendations) {
      expect(recommendation.ruleId).toMatch(/^GCI-[A-Z]+-\d{3}$/u);
      expect(recommendation.evidence.length).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
      expect(recommendation.explanation.length).toBeGreaterThan(20);
    }
  });

  it('implements at least the eight documented rules', () => {
    expect(BUILT_IN_RULES.map((rule) => rule.id).sort()).toEqual([
      'GCI-CACHE-001',
      'GCI-CRITICAL-001',
      'GCI-DUP-001',
      'GCI-FLAKY-001',
      'GCI-MATRIX-001',
      'GCI-ORDER-001',
      'GCI-QUEUE-001',
      'GCI-REGRESSION-001',
    ]);
  });
});
