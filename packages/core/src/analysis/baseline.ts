import { analyzeRuntime, withCalculatedDurations } from './runtime.js';
import {
  buildWorkflowShape,
  compareWorkflowShapes,
  withLogicalIdentity,
  type WorkflowEdge,
  type WorkflowShape,
} from './shape.js';
import {
  compareToDistribution,
  evaluateRegression,
  median,
  summarize,
  type ComparisonConfidence,
  type RegressionThresholds,
  type RegressionVerdict,
  type ScaleMethod,
} from './statistics.js';
import type { NormalizedJob } from '../domain/schemas.js';

/** One historical successful run supplied by the collection adapter. */
export interface BaselineRunSample {
  readonly runId: number;
  readonly runAttempt: number;
  readonly headSha: string;
  readonly createdAt?: string | undefined;
  readonly jobs: readonly NormalizedJob[];
}

/** How one historical run was treated during comparison. */
export interface BaselineRunSummary {
  readonly runId: number;
  readonly runAttempt: number;
  readonly headSha: string;
  readonly shapeSimilarity: number;
  readonly exactShapeMatch: boolean;
  readonly included: boolean;
  readonly wallClockSeconds: number;
  readonly runnerSeconds: number;
}

/** A single metric compared with its robust baseline distribution. */
export interface MetricComparison {
  readonly metric: string;
  readonly current: number;
  readonly baselineMedian: number;
  readonly baselineMad: number;
  readonly baselineMin: number;
  readonly baselineMax: number;
  readonly sampleCount: number;
  readonly percentChange: number | undefined;
  readonly modifiedZScore: number;
  readonly scaleMethod: ScaleMethod;
  readonly verdict: RegressionVerdict;
  readonly confidence: ComparisonConfidence;
  readonly reasons: readonly string[];
}

/** A job- or step-level comparison keyed by a stable structural identity. */
export interface NodeComparison extends MetricComparison {
  readonly kind: 'job' | 'step';
  readonly key: string;
  readonly label: string;
}

/** Result of comparing the current run with its historical baseline. */
export interface BaselineComparison {
  readonly status:
    'ready' | 'insufficient-samples' | 'unavailable' | 'shape-changed';
  readonly branch: string | undefined;
  readonly requestedRuns: number;
  readonly consideredRuns: number;
  readonly sampleCount: number;
  readonly excludedForShape: number;
  readonly exactShapeMatches: number;
  readonly shapeSimilarity: number;
  readonly shapeThreshold: number;
  readonly minimumSamples: number;
  readonly currentFingerprint: string;
  readonly runs: readonly BaselineRunSummary[];
  readonly metrics: readonly MetricComparison[];
  readonly jobComparisons: readonly NodeComparison[];
  readonly stepComparisons: readonly NodeComparison[];
  readonly unmatchedJobs: readonly string[];
}

/**
 * An extra derived metric compared across runs. The callback receives the
 * analyzed jobs and the owning run id so seeded estimation models stay
 * deterministic per run.
 */
export interface DerivedMetric {
  readonly metric: string;
  readonly compute: (jobs: readonly NormalizedJob[], runId: number) => number;
}

/** Everything the pure baseline comparison needs. */
export interface BaselineComparisonInput {
  readonly workflowPath: string;
  readonly currentRunId: number;
  readonly currentJobs: readonly NormalizedJob[];
  readonly samples: readonly BaselineRunSample[];
  readonly branch: string | undefined;
  readonly requestedRuns: number;
  readonly minimumSamples: number;
  readonly shapeThreshold: number;
  readonly regressionPercent: number;
  readonly modifiedZScoreThreshold: number;
  readonly available: boolean;
  readonly edges?: readonly WorkflowEdge[] | undefined;
  readonly derivedMetrics?: readonly DerivedMetric[] | undefined;
  /**
   * Logical job ids removed from the current run — normally the GreenCI
   * analyzer itself. Historical runs contain a *completed* analyzer job, so it
   * must be removed from them too or every baseline would look structurally
   * different from the run being analyzed.
   */
  readonly excludedLogicalJobIds?: readonly string[] | undefined;
}

/** Stable comparison key for a job across runs. */
export function jobComparisonKey(job: NormalizedJob): string {
  const identified = withLogicalIdentity(job);
  return [
    identified.logicalJobId ?? identified.apiName,
    identified.matrixSignature ?? '',
    identified.runnerClass,
  ].join('|');
}

function stepComparisonKeys(job: NormalizedJob): Map<string, number> {
  const durations = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const jobKey = jobComparisonKey(job);
  for (const step of job.steps) {
    if (step.isRunnerInternal || step.durationSeconds === undefined) {
      continue;
    }
    const base = `${jobKey}::${step.normalizedName}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const key = `${base}#${occurrence}`;
    durations.set(key, (durations.get(key) ?? 0) + step.durationSeconds);
  }
  return durations;
}

function jobDurations(jobs: readonly NormalizedJob[]): Map<string, number> {
  const durations = new Map<string, number>();
  for (const job of jobs) {
    if (job.durationSeconds === undefined) {
      continue;
    }
    const key = jobComparisonKey(job);
    durations.set(key, (durations.get(key) ?? 0) + job.durationSeconds);
  }
  return durations;
}

function stepDurations(jobs: readonly NormalizedJob[]): Map<string, number> {
  const durations = new Map<string, number>();
  for (const job of jobs) {
    for (const [key, value] of stepComparisonKeys(job)) {
      durations.set(key, (durations.get(key) ?? 0) + value);
    }
  }
  return durations;
}

interface ComparisonContext {
  readonly sampleCount: number;
  readonly shapeSimilarity: number;
  readonly thresholds: RegressionThresholds;
}

function compareMetric(
  metric: string,
  current: number,
  baselineValues: readonly number[],
  context: ComparisonContext,
): MetricComparison {
  const distribution = summarize(baselineValues);
  if (distribution === undefined) {
    return {
      metric,
      current,
      baselineMedian: 0,
      baselineMad: 0,
      baselineMin: 0,
      baselineMax: 0,
      sampleCount: 0,
      percentChange: undefined,
      modifiedZScore: 0,
      scaleMethod: 'unavailable',
      verdict: 'inconclusive',
      confidence: 'low',
      reasons: ['no-baseline-samples'],
    };
  }
  const comparison = compareToDistribution(current, distribution);
  const decision = evaluateRegression(
    comparison,
    {
      sampleCount: distribution.sampleCount,
      shapeSimilarity: context.shapeSimilarity,
    },
    context.thresholds,
  );
  return {
    metric,
    current,
    baselineMedian: distribution.median,
    baselineMad: distribution.mad,
    baselineMin: distribution.min,
    baselineMax: distribution.max,
    sampleCount: distribution.sampleCount,
    percentChange: comparison.percentChange,
    modifiedZScore: comparison.modifiedZScore,
    scaleMethod: comparison.scaleMethod,
    verdict: decision.verdict,
    confidence: decision.confidence,
    reasons: decision.reasons,
  };
}

function compareNodes(
  kind: 'job' | 'step',
  currentDurations: Map<string, number>,
  baselineDurations: readonly Map<string, number>[],
  labels: Map<string, string>,
  context: ComparisonContext,
): { comparisons: NodeComparison[]; unmatched: string[] } {
  const comparisons: NodeComparison[] = [];
  const unmatched: string[] = [];
  for (const [key, current] of [...currentDurations].sort((left, right) =>
    left[0] < right[0] ? -1 : 1,
  )) {
    const values = baselineDurations
      .map((durations) => durations.get(key))
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) {
      unmatched.push(labels.get(key) ?? key);
      continue;
    }
    const metric = compareMetric(kind, current, values, context);
    comparisons.push({
      ...metric,
      kind,
      key,
      label: labels.get(key) ?? key,
    });
  }
  return { comparisons, unmatched };
}

function severityRank(verdict: RegressionVerdict): number {
  switch (verdict) {
    case 'regression':
      return 0;
    case 'stable':
      return 1;
    case 'improvement':
      return 2;
    default:
      return 3;
  }
}

function sortBySeverity(comparisons: NodeComparison[]): NodeComparison[] {
  return [...comparisons].sort((left, right) => {
    const rank = severityRank(left.verdict) - severityRank(right.verdict);
    if (rank !== 0) {
      return rank;
    }
    return (right.percentChange ?? 0) - (left.percentChange ?? 0);
  });
}

function jobLabels(jobs: readonly NormalizedJob[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const job of jobs) {
    labels.set(jobComparisonKey(job), job.apiName);
  }
  return labels;
}

function stepLabels(jobs: readonly NormalizedJob[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const job of jobs) {
    const occurrences = new Map<string, number>();
    const jobKey = jobComparisonKey(job);
    for (const step of job.steps) {
      if (step.isRunnerInternal || step.durationSeconds === undefined) {
        continue;
      }
      const base = `${jobKey}::${step.normalizedName}`;
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      labels.set(`${base}#${occurrence}`, `${job.apiName} / ${step.name}`);
    }
  }
  return labels;
}

function emptyComparison(
  input: BaselineComparisonInput,
  shape: WorkflowShape,
  status: BaselineComparison['status'],
  runs: readonly BaselineRunSummary[],
  consideredRuns: number,
  excludedForShape: number,
): BaselineComparison {
  return {
    status,
    branch: input.branch,
    requestedRuns: input.requestedRuns,
    consideredRuns,
    sampleCount: 0,
    excludedForShape,
    exactShapeMatches: 0,
    shapeSimilarity: 0,
    shapeThreshold: input.shapeThreshold,
    minimumSamples: input.minimumSamples,
    currentFingerprint: shape.fingerprint,
    runs,
    metrics: [],
    jobComparisons: [],
    stepComparisons: [],
    unmatchedJobs: [],
  };
}

/**
 * Compare the current run with historical successful runs.
 *
 * Structurally incompatible runs are excluded before any statistic is
 * calculated, and an insufficient sample never produces a regression claim.
 */
export function compareWithBaseline(
  input: BaselineComparisonInput,
): BaselineComparison {
  const currentShape = buildWorkflowShape({
    workflowPath: input.workflowPath,
    jobs: input.currentJobs,
    edges: input.edges,
  });

  if (!input.available) {
    return emptyComparison(input, currentShape, 'unavailable', [], 0, 0);
  }

  const excludedLogicalJobIds = new Set(input.excludedLogicalJobIds ?? []);
  const evaluated = input.samples.map((rawSample) => {
    // Historical jobs arrive straight from the API adapter, so their durations
    // must be recalculated exactly like the current run's before comparison,
    // and the analyzer job must be removed from them for the same reason it is
    // removed from the current run.
    const sample: BaselineRunSample = {
      ...rawSample,
      jobs: rawSample.jobs
        .map(withCalculatedDurations)
        .map(withLogicalIdentity)
        .filter(
          (job) => !excludedLogicalJobIds.has(job.logicalJobId ?? job.apiName),
        ),
    };
    const shape = buildWorkflowShape({
      workflowPath: input.workflowPath,
      jobs: sample.jobs,
      edges: input.edges,
    });
    const similarity = compareWorkflowShapes(currentShape, shape);
    const runtime = analyzeRuntime(sample.jobs);
    return {
      sample,
      similarity: similarity.similarity,
      exactShapeMatch: similarity.exactMatch,
      wallClockSeconds: runtime.wallClockSeconds,
      runnerSeconds: runtime.runnerSeconds,
    };
  });

  const compatible = evaluated
    .filter((entry) => entry.similarity >= input.shapeThreshold)
    .slice(0, input.requestedRuns);
  const includedIds = new Set(compatible.map((entry) => entry.sample.runId));
  const runs: BaselineRunSummary[] = evaluated.map((entry) => ({
    runId: entry.sample.runId,
    runAttempt: entry.sample.runAttempt,
    headSha: entry.sample.headSha,
    shapeSimilarity: entry.similarity,
    exactShapeMatch: entry.exactShapeMatch,
    included: includedIds.has(entry.sample.runId),
    wallClockSeconds: entry.wallClockSeconds,
    runnerSeconds: entry.runnerSeconds,
  }));
  const excludedForShape = evaluated.length - compatible.length;

  if (compatible.length === 0) {
    return emptyComparison(
      input,
      currentShape,
      evaluated.length === 0 ? 'unavailable' : 'shape-changed',
      runs,
      evaluated.length,
      excludedForShape,
    );
  }

  const shapeSimilarity = median(compatible.map((entry) => entry.similarity));
  const context: ComparisonContext = {
    sampleCount: compatible.length,
    shapeSimilarity,
    thresholds: {
      regressionPercent: input.regressionPercent,
      modifiedZScore: input.modifiedZScoreThreshold,
      minimumSamples: input.minimumSamples,
      shapeSimilarityThreshold: input.shapeThreshold,
    },
  };

  const currentRuntime = analyzeRuntime(input.currentJobs);
  const metrics: MetricComparison[] = [
    compareMetric(
      'wall-clock-seconds',
      currentRuntime.wallClockSeconds,
      compatible.map((entry) => entry.wallClockSeconds),
      context,
    ),
    compareMetric(
      'runner-seconds',
      currentRuntime.runnerSeconds,
      compatible.map((entry) => entry.runnerSeconds),
      context,
    ),
    ...(input.derivedMetrics ?? []).map((derived) =>
      compareMetric(
        derived.metric,
        derived.compute(input.currentJobs, input.currentRunId),
        compatible.map((entry) =>
          derived.compute(entry.sample.jobs, entry.sample.runId),
        ),
        context,
      ),
    ),
  ];

  const baselineJobDurations = compatible.map((entry) =>
    jobDurations(entry.sample.jobs),
  );
  const baselineStepDurations = compatible.map((entry) =>
    stepDurations(entry.sample.jobs),
  );
  const jobs = compareNodes(
    'job',
    jobDurations(input.currentJobs),
    baselineJobDurations,
    jobLabels(input.currentJobs),
    context,
  );
  const steps = compareNodes(
    'step',
    stepDurations(input.currentJobs),
    baselineStepDurations,
    stepLabels(input.currentJobs),
    context,
  );

  return {
    status:
      compatible.length >= input.minimumSamples
        ? 'ready'
        : 'insufficient-samples',
    branch: input.branch,
    requestedRuns: input.requestedRuns,
    consideredRuns: evaluated.length,
    sampleCount: compatible.length,
    excludedForShape,
    exactShapeMatches: compatible.filter((entry) => entry.exactShapeMatch)
      .length,
    shapeSimilarity,
    shapeThreshold: input.shapeThreshold,
    minimumSamples: input.minimumSamples,
    currentFingerprint: currentShape.fingerprint,
    runs,
    metrics,
    jobComparisons: sortBySeverity(jobs.comparisons),
    stepComparisons: sortBySeverity(steps.comparisons),
    unmatchedJobs: jobs.unmatched,
  };
}
