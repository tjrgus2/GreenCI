import { BUILT_IN_RULES } from './rules.js';
import type {
  AnalysisContext,
  Recommendation,
  RecommendationRule,
} from './types.js';

export { BUILT_IN_RULES } from './rules.js';
export type {
  AnalysisContext,
  EstimatedImpact,
  Evidence,
  Recommendation,
  RecommendationRule,
} from './types.js';

const SEVERITY_RANK: Readonly<Record<Recommendation['severity'], number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** How the recommendation engine was configured for one run. */
export interface RecommendationOptions {
  readonly enabled: boolean;
  readonly minimumConfidence: number;
  readonly maxCount: number;
  readonly rules?: readonly RecommendationRule[] | undefined;
}

/** Recommendations plus the rules that failed, so nothing fails silently. */
export interface RecommendationResult {
  readonly recommendations: readonly Recommendation[];
  readonly evaluatedRules: number;
  readonly suppressedByConfidence: number;
  readonly failedRuleIds: readonly string[];
}

/**
 * Evaluate every rule deterministically.
 *
 * A rule that throws is isolated: it is reported by id and never prevents the
 * remaining rules, or the rest of the report, from being produced.
 */
export function evaluateRecommendations(
  context: AnalysisContext,
  options: RecommendationOptions,
): RecommendationResult {
  if (!options.enabled) {
    return {
      recommendations: [],
      evaluatedRules: 0,
      suppressedByConfidence: 0,
      failedRuleIds: [],
    };
  }

  const rules = options.rules ?? BUILT_IN_RULES;
  const produced: Recommendation[] = [];
  const failedRuleIds: string[] = [];
  let suppressedByConfidence = 0;

  for (const rule of rules) {
    let result: Recommendation | undefined;
    try {
      result = rule.evaluate(context);
    } catch {
      failedRuleIds.push(rule.id);
      continue;
    }
    if (result === undefined) {
      continue;
    }
    if (result.confidence < options.minimumConfidence) {
      suppressedByConfidence += 1;
      continue;
    }
    produced.push(result);
  }

  const ordered = [...produced].sort((left, right) => {
    const bySeverity =
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    return bySeverity !== 0
      ? bySeverity
      : right.confidence - left.confidence ||
          (left.ruleId < right.ruleId ? -1 : 1);
  });

  return {
    recommendations: ordered.slice(0, Math.max(0, options.maxCount)),
    evaluatedRules: rules.length,
    suppressedByConfidence,
    failedRuleIds,
  };
}
