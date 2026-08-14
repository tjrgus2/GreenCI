import type { BaselineComparison } from '../analysis/baseline.js';
import type { FailureSummary } from '../analysis/failures.js';
import type { ComparisonConfidence } from '../analysis/statistics.js';
import type { CarbonEstimate } from '../estimation/carbon.js';

/** What a violated policy does to the GreenCI job. */
export type PolicyMode = 'report' | 'warn' | 'fail';

/** Comparison operators supported by a policy rule. */
export type PolicyOperator =
  'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal';

/** Metrics a policy may be written against. */
export type PolicyMetric =
  | 'wall-clock-regression-percent'
  | 'runner-time-regression-percent'
  | 'list-price-regression-percent'
  | 'carbon-p50-regression-percent'
  | 'carbon-p95-grams'
  | 'failed-jobs'
  | 'workflow-shape-match'
  | 'critical-path-regression-percent';

/** One configured budget rule. */
export interface PolicyRule {
  readonly metric: PolicyMetric;
  readonly operator: PolicyOperator;
  readonly value: number;
  readonly mode: PolicyMode;
  readonly minimumConfidence: ComparisonConfidence;
}

/** The outcome of one rule, including why it was or was not enforced. */
export interface PolicyEvaluation {
  readonly ruleId: string;
  readonly metric: PolicyMetric;
  readonly actual: number | undefined;
  readonly operator: PolicyOperator;
  readonly threshold: number;
  readonly requestedMode: PolicyMode;
  readonly mode: PolicyMode;
  readonly passed: boolean;
  readonly evaluated: boolean;
  readonly confidence: ComparisonConfidence;
  readonly explanation: string;
}

/** The overall policy conclusion for the run. */
export interface PolicyResult {
  readonly conclusion: 'pass' | 'warn' | 'fail' | 'skipped';
  readonly evaluations: readonly PolicyEvaluation[];
}

/** Everything a policy may read. */
export interface PolicyContext {
  readonly baseline: BaselineComparison;
  readonly failures: FailureSummary;
  readonly carbon: CarbonEstimate | undefined;
}

const CONFIDENCE_RANK: Readonly<Record<ComparisonConfidence, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const REGRESSION_METRIC_KEYS: Partial<Record<PolicyMetric, string>> = {
  'wall-clock-regression-percent': 'wall-clock-seconds',
  'runner-time-regression-percent': 'runner-seconds',
  'list-price-regression-percent': 'list-price-usd',
  'carbon-p50-regression-percent': 'carbon-p50-grams',
  'critical-path-regression-percent': 'critical-path-seconds',
};

interface Resolved {
  readonly actual: number | undefined;
  readonly confidence: ComparisonConfidence;
  readonly reason: string | undefined;
}

function resolveMetric(metric: PolicyMetric, context: PolicyContext): Resolved {
  const regressionKey = REGRESSION_METRIC_KEYS[metric];
  if (regressionKey !== undefined) {
    const comparison = context.baseline.metrics.find(
      (entry) => entry.metric === regressionKey,
    );
    if (comparison === undefined) {
      return {
        actual: undefined,
        confidence: 'low',
        reason: 'the metric was not compared against a baseline',
      };
    }
    if (comparison.percentChange === undefined) {
      return {
        actual: undefined,
        confidence: comparison.confidence,
        reason: 'no percentage change could be computed',
      };
    }
    return {
      actual: comparison.percentChange,
      confidence: comparison.confidence,
      reason: undefined,
    };
  }

  if (metric === 'carbon-p95-grams') {
    return context.carbon === undefined
      ? {
          actual: undefined,
          confidence: 'low',
          reason: 'carbon estimation is disabled',
        }
      : {
          actual: context.carbon.operationalCarbonGrams.p95,
          confidence: context.carbon.quality.grade,
          reason: undefined,
        };
  }
  if (metric === 'failed-jobs') {
    return {
      actual: context.failures.failedJobCount,
      confidence: 'high',
      reason: undefined,
    };
  }
  return {
    actual: context.baseline.shapeSimilarity,
    confidence: context.baseline.status === 'ready' ? 'high' : 'low',
    reason:
      context.baseline.status === 'ready'
        ? undefined
        : 'no comparable baseline was available',
  };
}

function violates(
  actual: number,
  operator: PolicyOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case 'greater-than':
      return actual > threshold;
    case 'greater-than-or-equal':
      return actual >= threshold;
    case 'less-than':
      return actual < threshold;
    case 'less-than-or-equal':
      return actual <= threshold;
  }
}

/**
 * Evaluate the configured CI budget.
 *
 * A rule can only fail the job when the underlying measurement is at least as
 * confident as the rule requires. Insufficient confidence downgrades `fail` to
 * `warn` and says so, because a default installation must never block a pull
 * request on an uncertain number.
 */
export function evaluatePolicies(
  rules: readonly PolicyRule[],
  context: PolicyContext,
): PolicyResult {
  if (rules.length === 0) {
    return { conclusion: 'skipped', evaluations: [] };
  }

  const evaluations: PolicyEvaluation[] = rules.map((rule, index) => {
    const ruleId = `${rule.metric}#${index + 1}`;
    const resolved = resolveMetric(rule.metric, context);
    if (resolved.actual === undefined) {
      return {
        ruleId,
        metric: rule.metric,
        actual: undefined,
        operator: rule.operator,
        threshold: rule.value,
        requestedMode: rule.mode,
        mode: 'report',
        passed: true,
        evaluated: false,
        confidence: resolved.confidence,
        explanation: `Not evaluated because ${resolved.reason ?? 'the metric was unavailable'}.`,
      };
    }

    const violated = violates(resolved.actual, rule.operator, rule.value);
    const confidentEnough =
      CONFIDENCE_RANK[resolved.confidence] >=
      CONFIDENCE_RANK[rule.minimumConfidence];
    const mode: PolicyMode =
      rule.mode === 'fail' && !confidentEnough ? 'warn' : rule.mode;
    const downgraded = mode !== rule.mode;

    return {
      ruleId,
      metric: rule.metric,
      actual: resolved.actual,
      operator: rule.operator,
      threshold: rule.value,
      requestedMode: rule.mode,
      mode,
      passed: !violated,
      evaluated: true,
      confidence: resolved.confidence,
      explanation: violated
        ? downgraded
          ? `Threshold exceeded, but confidence is ${resolved.confidence} and the rule requires ${rule.minimumConfidence}; reported as a warning instead of a failure.`
          : `Threshold exceeded.`
        : 'Within budget.',
    };
  });

  const violatedModes = evaluations
    .filter((evaluation) => !evaluation.passed)
    .map((evaluation) => evaluation.mode);

  const conclusion = violatedModes.includes('fail')
    ? 'fail'
    : violatedModes.includes('warn')
      ? 'warn'
      : 'pass';

  return { conclusion, evaluations };
}
