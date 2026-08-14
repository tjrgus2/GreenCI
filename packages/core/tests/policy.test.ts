import { describe, expect, it } from 'vitest';
import type {
  BaselineComparison,
  MetricComparison,
} from '../src/analysis/baseline.js';
import type { FailureSummary } from '../src/analysis/failures.js';
import type { CarbonEstimate } from '../src/estimation/carbon.js';
import {
  evaluatePolicies,
  type PolicyContext,
  type PolicyRule,
} from '../src/policy/index.js';

function metric(
  name: string,
  overrides: Partial<MetricComparison> = {},
): MetricComparison {
  return {
    metric: name,
    current: 120,
    baselineMedian: 100,
    baselineMad: 2,
    baselineMin: 98,
    baselineMax: 104,
    sampleCount: 7,
    percentChange: 20,
    modifiedZScore: 6.7,
    scaleMethod: 'mad',
    verdict: 'regression',
    confidence: 'high',
    reasons: [],
    ...overrides,
  };
}

function baseline(
  metrics: readonly MetricComparison[],
  overrides: Partial<BaselineComparison> = {},
): BaselineComparison {
  return {
    status: 'ready',
    branch: 'main',
    requestedRuns: 7,
    consideredRuns: 7,
    sampleCount: 7,
    excludedForShape: 0,
    exactShapeMatches: 7,
    shapeSimilarity: 1,
    shapeThreshold: 0.8,
    minimumSamples: 3,
    currentFingerprint: 'a'.repeat(64),
    runs: [],
    metrics,
    jobComparisons: [],
    stepComparisons: [],
    unmatchedJobs: [],
    ...overrides,
  };
}

const noFailures: FailureSummary = {
  failedJobCount: 0,
  failures: [],
  firstFailureWallClockPercent: undefined,
};

function carbon(p95: number, grade: 'high' | 'medium' | 'low'): CarbonEstimate {
  return {
    modelVersion: 'operational-v1',
    model: 'operational-v1',
    region: 'KR',
    regionResolved: true,
    simulationSamples: 2000,
    seedHash: 'b'.repeat(64),
    energyKwh: { p05: 0, p50: 0, p95: 0, unit: 'kWh', modelVersion: 'x' },
    operationalCarbonGrams: {
      p05: 0,
      p50: p95 / 2,
      p95,
      unit: 'gCO2eq',
      modelVersion: 'x',
    },
    modeledJobs: 1,
    unmodeledJobs: 0,
    unknownRunnerClasses: [],
    quality: { score: 0.9, grade, reasons: [] },
    assumptions: [],
    measurementDisclaimer: 'modeled',
  };
}

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    baseline: baseline([metric('runner-seconds')]),
    failures: noFailures,
    carbon: undefined,
    ...overrides,
  };
}

const failRule: PolicyRule = {
  metric: 'runner-time-regression-percent',
  operator: 'greater-than',
  value: 15,
  mode: 'fail',
  minimumConfidence: 'medium',
};

describe('policy engine', () => {
  it('skips when no rule is configured, so a default install never blocks', () => {
    const result = evaluatePolicies([], context());
    expect(result.conclusion).toBe('skipped');
    expect(result.evaluations).toEqual([]);
  });

  it('passes when the metric is within budget', () => {
    const result = evaluatePolicies([{ ...failRule, value: 50 }], context());
    expect(result.conclusion).toBe('pass');
    expect(result.evaluations[0]?.passed).toBe(true);
    expect(result.evaluations[0]?.explanation).toBe('Within budget.');
  });

  it('fails a confident regression above the threshold', () => {
    const result = evaluatePolicies([failRule], context());
    expect(result.conclusion).toBe('fail');
    expect(result.evaluations[0]?.mode).toBe('fail');
    expect(result.evaluations[0]?.actual).toBe(20);
  });

  it('warns instead of failing when confidence is insufficient', () => {
    const result = evaluatePolicies(
      [failRule],
      context({
        baseline: baseline([metric('runner-seconds', { confidence: 'low' })]),
      }),
    );
    expect(result.conclusion).toBe('warn');
    expect(result.evaluations[0]?.requestedMode).toBe('fail');
    expect(result.evaluations[0]?.mode).toBe('warn');
    expect(result.evaluations[0]?.explanation).toContain('confidence is low');
  });

  it('reports a violated report-mode rule without changing the conclusion', () => {
    const result = evaluatePolicies(
      [{ ...failRule, mode: 'report' }],
      context(),
    );
    expect(result.conclusion).toBe('pass');
    expect(result.evaluations[0]?.passed).toBe(false);
  });

  it('does not evaluate a metric that was never compared', () => {
    const result = evaluatePolicies(
      [
        {
          metric: 'critical-path-regression-percent',
          operator: 'greater-than',
          value: 10,
          mode: 'fail',
          minimumConfidence: 'medium',
        },
      ],
      context(),
    );
    expect(result.conclusion).toBe('pass');
    expect(result.evaluations[0]?.evaluated).toBe(false);
    expect(result.evaluations[0]?.mode).toBe('report');
    expect(result.evaluations[0]?.explanation).toContain('Not evaluated');
  });

  it('does not evaluate a percentage that could not be computed', () => {
    const result = evaluatePolicies(
      [failRule],
      context({
        baseline: baseline([
          metric('runner-seconds', { percentChange: undefined }),
        ]),
      }),
    );
    expect(result.evaluations[0]?.evaluated).toBe(false);
    expect(result.evaluations[0]?.explanation).toContain(
      'no percentage change',
    );
  });

  it('evaluates absolute carbon and failed-job budgets', () => {
    const overBudget = evaluatePolicies(
      [
        {
          metric: 'carbon-p95-grams',
          operator: 'greater-than',
          value: 5,
          mode: 'warn',
          minimumConfidence: 'low',
        },
        {
          metric: 'failed-jobs',
          operator: 'greater-than',
          value: 0,
          mode: 'fail',
          minimumConfidence: 'high',
        },
      ],
      context({
        carbon: carbon(10, 'high'),
        failures: {
          failedJobCount: 1,
          failures: [
            {
              jobId: 1,
              jobName: 'Test',
              conclusion: 'failure',
              durationSeconds: 10,
              failedStepName: undefined,
              failedStepIndex: undefined,
              secondsBeforeFailure: 10,
            },
          ],
          firstFailureWallClockPercent: 80,
        },
      }),
    );
    expect(overBudget.conclusion).toBe('fail');
    expect(overBudget.evaluations[0]?.passed).toBe(false);
    expect(overBudget.evaluations[1]?.passed).toBe(false);
  });

  it('skips a carbon budget when carbon estimation is disabled', () => {
    const result = evaluatePolicies(
      [
        {
          metric: 'carbon-p95-grams',
          operator: 'greater-than',
          value: 1,
          mode: 'fail',
          minimumConfidence: 'low',
        },
      ],
      context(),
    );
    expect(result.evaluations[0]?.evaluated).toBe(false);
    expect(result.evaluations[0]?.explanation).toContain('disabled');
  });

  it('treats a low workflow-shape match as low confidence', () => {
    const result = evaluatePolicies(
      [
        {
          metric: 'workflow-shape-match',
          operator: 'less-than',
          value: 0.9,
          mode: 'fail',
          minimumConfidence: 'high',
        },
      ],
      context({
        baseline: baseline([], {
          status: 'shape-changed',
          shapeSimilarity: 0.4,
        }),
      }),
    );
    expect(result.conclusion).toBe('warn');
    expect(result.evaluations[0]?.confidence).toBe('low');
  });

  it('supports every documented operator', () => {
    const rules: PolicyRule[] = (
      [
        'greater-than',
        'greater-than-or-equal',
        'less-than',
        'less-than-or-equal',
      ] as const
    ).map((operator) => ({
      metric: 'runner-time-regression-percent' as const,
      operator,
      value: 20,
      mode: 'report' as const,
      minimumConfidence: 'low' as const,
    }));
    const result = evaluatePolicies(rules, context());
    expect(result.evaluations.map((entry) => entry.passed)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
