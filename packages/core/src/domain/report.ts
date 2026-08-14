import { z } from 'zod';
import {
  AnalysisWarningSchema,
  NormalizedJobSchema,
  WorkflowRunIdentitySchema,
} from './schemas.js';

/** Current schema version of `greenci-report.json`. */
export const REPORT_SCHEMA_VERSION = '1.1.0';

const finite = z.number().finite();
const nonNegative = z.number().finite().nonnegative();

const TimelinePointSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    concurrency: z.number().int().nonnegative(),
  })
  .strict();

const CurrentMetricsSchema = z
  .object({
    wallClockSeconds: nonNegative,
    activeSeconds: nonNegative,
    runnerSeconds: nonNegative,
    jobsAnalyzed: z.number().int().nonnegative(),
    stepsAnalyzed: z.number().int().nonnegative(),
  })
  .strict();

const ParallelismSchema = z
  .object({
    peakConcurrency: z.number().int().nonnegative(),
    averageConcurrency: nonNegative,
    runnerTimeToWallClockRatio: nonNegative,
    idleSeconds: nonNegative,
    timeline: z.array(TimelinePointSchema),
  })
  .strict();

const ExclusionSchema = z
  .object({
    excludedJobIds: z.array(z.number().int().nonnegative()),
    method: z.enum(['name', 'in-progress', 'none']),
    heuristic: z.boolean(),
  })
  .strict();

const ShapeSchema = z
  .object({
    fingerprint: z.string().min(1),
    jobIds: z.array(z.string()),
    stepKeyCount: z.number().int().nonnegative(),
    matrixKeyCount: z.number().int().nonnegative(),
    edgesAvailable: z.boolean(),
    edgeCount: z.number().int().nonnegative(),
  })
  .strict();

const VerdictSchema = z.enum([
  'regression',
  'improvement',
  'stable',
  'inconclusive',
]);
const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
const ScaleMethodSchema = z.enum(['mad', 'iqr', 'unavailable']);

const MetricComparisonSchema = z
  .object({
    metric: z.string().min(1),
    current: finite,
    baselineMedian: finite,
    baselineMad: nonNegative,
    baselineMin: finite,
    baselineMax: finite,
    sampleCount: z.number().int().nonnegative(),
    percentChange: finite.optional(),
    modifiedZScore: finite,
    scaleMethod: ScaleMethodSchema,
    verdict: VerdictSchema,
    confidence: ConfidenceSchema,
    reasons: z.array(z.string()),
  })
  .strict();

const NodeComparisonSchema = MetricComparisonSchema.extend({
  kind: z.enum(['job', 'step']),
  key: z.string().min(1),
  label: z.string(),
}).strict();

const BaselineRunSummarySchema = z
  .object({
    runId: z.number().int().nonnegative(),
    runAttempt: z.number().int().positive(),
    headSha: z.string().min(1),
    shapeSimilarity: nonNegative,
    exactShapeMatch: z.boolean(),
    included: z.boolean(),
    wallClockSeconds: nonNegative,
    runnerSeconds: nonNegative,
  })
  .strict();

const BaselineSchema = z
  .object({
    status: z.enum([
      'ready',
      'insufficient-samples',
      'unavailable',
      'shape-changed',
    ]),
    branch: z.string().optional(),
    requestedRuns: z.number().int().nonnegative(),
    consideredRuns: z.number().int().nonnegative(),
    sampleCount: z.number().int().nonnegative(),
    excludedForShape: z.number().int().nonnegative(),
    exactShapeMatches: z.number().int().nonnegative(),
    shapeSimilarity: nonNegative,
    shapeThreshold: nonNegative,
    minimumSamples: z.number().int().nonnegative(),
    currentFingerprint: z.string().min(1),
    runs: z.array(BaselineRunSummarySchema),
    metrics: z.array(MetricComparisonSchema),
    jobComparisons: z.array(NodeComparisonSchema),
    stepComparisons: z.array(NodeComparisonSchema),
    unmatchedJobs: z.array(z.string()),
  })
  .strict();

const JobCostSchema = z
  .object({
    jobId: z.number().int().nonnegative(),
    jobName: z.string(),
    runnerClass: z.string(),
    durationSeconds: nonNegative,
    billableMinutes: z.number().int().nonnegative(),
    usdPerMinute: nonNegative.optional(),
    grossListPriceUsd: nonNegative.optional(),
    priced: z.boolean(),
  })
  .strict();

const CostSchema = z
  .object({
    modelVersion: z.string().min(1),
    currency: z.literal('USD'),
    billableMinutes: z.number().int().nonnegative(),
    grossListPriceUsd: nonNegative,
    estimatedBillableUsd: nonNegative,
    billingBasis: z.enum(['standard-public-free', 'list-price']),
    actualInvoiceAvailable: z.literal(false),
    pricedJobs: z.number().int().nonnegative(),
    unpricedJobs: z.number().int().nonnegative(),
    unknownRunnerClasses: z.array(z.string()),
    jobs: z.array(JobCostSchema),
  })
  .strict();

const EstimateIntervalSchema = z
  .object({
    p05: nonNegative,
    p50: nonNegative,
    p95: nonNegative,
    unit: z.string().min(1),
    modelVersion: z.string().min(1),
  })
  .strict()
  .refine(
    (value) => value.p05 <= value.p50 && value.p50 <= value.p95,
    'Expected p05 <= p50 <= p95',
  );

const CarbonSchema = z
  .object({
    modelVersion: z.string().min(1),
    model: z.literal('operational-v1'),
    region: z.string().min(1),
    regionResolved: z.boolean(),
    simulationSamples: z.number().int().positive(),
    seedHash: z.string().regex(/^[0-9a-f]{64}$/u),
    energyKwh: EstimateIntervalSchema,
    operationalCarbonGrams: EstimateIntervalSchema,
    modeledJobs: z.number().int().nonnegative(),
    unmodeledJobs: z.number().int().nonnegative(),
    unknownRunnerClasses: z.array(z.string()),
    quality: z
      .object({
        score: nonNegative,
        grade: ConfidenceSchema,
        reasons: z.array(z.string()),
      })
      .strict(),
    assumptions: z.array(
      z
        .object({
          key: z.string().min(1),
          value: z.string(),
          source: z.string().min(1),
        })
        .strict(),
    ),
    measurementDisclaimer: z.string().min(1),
  })
  .strict();

const DataManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    path: z.string().min(1),
    source: z.string().min(1),
    unit: z.string().min(1),
    uncertainty: z.string().min(1),
    effectiveDate: z.string().min(1),
    retrievedAt: z.string().min(1),
    licenseNote: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

/**
 * Versioned GreenCI JSON report. Consumers must ignore unknown optional
 * fields; minor versions only add fields and enum values.
 */
export const AnalysisReportSchema = z
  .object({
    schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    greenciVersion: z.string(),
    locale: z.enum(['en', 'ko']),
    configHash: z.string().regex(/^[0-9a-f]{64}$/u),
    identity: WorkflowRunIdentitySchema,
    current: CurrentMetricsSchema,
    jobs: z.array(NormalizedJobSchema),
    parallelism: ParallelismSchema,
    analyzerExclusion: ExclusionSchema,
    shape: ShapeSchema,
    baseline: BaselineSchema,
    cost: CostSchema.optional(),
    carbon: CarbonSchema.optional(),
    dataManifest: z.array(DataManifestEntrySchema),
    warnings: z.array(AnalysisWarningSchema),
  })
  .strict();

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
