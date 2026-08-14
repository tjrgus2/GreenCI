import type { BaselineComparison } from '../analysis/baseline.js';
import type { CriticalPathAnalysis } from '../analysis/critical-path.js';
import type { FailureSummary } from '../analysis/failures.js';
import type { RuntimeAnalysis } from '../analysis/runtime.js';
import type { NormalizedJob } from '../domain/schemas.js';
import type { CarbonEstimate } from '../estimation/carbon.js';
import type { CostEstimate } from '../estimation/cost.js';

/** One observation that supports a recommendation. */
export interface Evidence {
  readonly metric: string;
  readonly observed: number | string;
  readonly baseline?: number | string;
  readonly source: string;
}

/** An upper-bound estimate of what acting on a recommendation could save. */
export interface EstimatedImpact {
  readonly runnerSeconds?: number;
  readonly costUsd?: number;
  readonly carbonGrams?: number;
  readonly upperBound: true;
}

/** A deterministic, evidence-backed suggestion. No model is consulted. */
export interface Recommendation {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly title: string;
  readonly explanation: string;
  readonly confidence: number;
  readonly evidence: readonly Evidence[];
  readonly estimatedImpact?: EstimatedImpact;
}

/** Everything a rule may inspect. Rules must not reach outside this object. */
export interface AnalysisContext {
  readonly jobs: readonly NormalizedJob[];
  readonly runtime: RuntimeAnalysis;
  readonly baseline: BaselineComparison;
  readonly criticalPath: CriticalPathAnalysis;
  readonly failures: FailureSummary;
  readonly cost: CostEstimate | undefined;
  readonly carbon: CarbonEstimate | undefined;
}

/** A deterministic rule. It returns at most one recommendation per run. */
export interface RecommendationRule {
  readonly id: string;
  readonly version: number;
  evaluate(context: AnalysisContext): Recommendation | undefined;
}
