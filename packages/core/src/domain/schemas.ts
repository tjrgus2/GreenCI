import { z } from 'zod';

/** Conclusions normalized from GitHub's open-ended API values. */
export const ConclusionSchema = z.enum([
  'success',
  'failure',
  'cancelled',
  'skipped',
  'timed_out',
  'neutral',
  'action_required',
  'unknown',
]);

/** Stable workflow-run identity used throughout the core engine. */
export const WorkflowRunIdentitySchema = z
  .object({
    owner: z.string().min(1),
    repository: z.string().min(1),
    workflowId: z.number().int().nonnegative(),
    workflowPath: z.string().min(1),
    runId: z.number().int().nonnegative(),
    runAttempt: z.number().int().positive(),
    headSha: z.string().min(1),
    headBranch: z.string(),
    baseBranch: z.string().optional(),
    event: z.string().min(1),
    pullRequestNumber: z.number().int().positive().optional(),
    repositoryVisibility: z.enum(['public', 'private', 'internal', 'unknown']),
  })
  .strict();

/** A sanitized, API-independent workflow step. */
export const NormalizedStepSchema = z
  .object({
    index: z.number().int().nonnegative(),
    name: z.string(),
    normalizedName: z.string(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    durationSeconds: z.number().nonnegative().optional(),
    conclusion: ConclusionSchema,
    isRunnerInternal: z.boolean(),
  })
  .strict();

/** A sanitized, API-independent workflow job. */
export const NormalizedJobSchema = z
  .object({
    id: z.number().int().nonnegative(),
    apiName: z.string(),
    logicalJobId: z.string().optional(),
    matrixSignature: z.string().optional(),
    runnerLabels: z.array(z.string()),
    runnerClass: z.string(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    durationSeconds: z.number().nonnegative().optional(),
    conclusion: ConclusionSchema,
    steps: z.array(NormalizedStepSchema),
  })
  .strict();

/** A machine-readable non-fatal problem preserved in reports. */
export const AnalysisWarningSchema = z
  .object({
    code: z.enum([
      'ANALYZER_EXCLUSION_HEURISTIC',
      'ANALYZER_NOT_IDENTIFIED',
      'JOB_TIMESTAMPS_INCOMPLETE',
      'STEP_TIMESTAMPS_INCOMPLETE',
      'REPOSITORY_VISIBILITY_UNKNOWN',
      'REPOSITORY_METADATA_UNAVAILABLE',
      'LOCALE_FALLBACK',
      'FAILURE_LOG_PARSING_DISABLED',
      'SUMMARY_PUBLISH_FAILED',
      'ARTIFACT_UPLOAD_FAILED',
    ]),
    source: z.enum(['core', 'github-api', 'action']),
    message: z.string().min(1),
  })
  .strict();

/** Validated input accepted by the deterministic analysis orchestrator. */
export const AnalyzeWorkflowInputSchema = z
  .object({
    identity: WorkflowRunIdentitySchema,
    jobs: z.array(NormalizedJobSchema),
    currentJobName: z.string().min(1).optional(),
    generatedAt: z.string().datetime({ offset: true }),
    warnings: z.array(AnalysisWarningSchema).default([]),
  })
  .strict();

const TimelinePointSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    concurrency: z.number().int().nonnegative(),
  })
  .strict();

const CurrentMetricsSchema = z
  .object({
    wallClockSeconds: z.number().nonnegative(),
    activeSeconds: z.number().nonnegative(),
    runnerSeconds: z.number().nonnegative(),
    jobsAnalyzed: z.number().int().nonnegative(),
    stepsAnalyzed: z.number().int().nonnegative(),
  })
  .strict();

const ParallelismSchema = z
  .object({
    peakConcurrency: z.number().int().nonnegative(),
    averageConcurrency: z.number().nonnegative(),
    runnerTimeToWallClockRatio: z.number().nonnegative(),
    idleSeconds: z.number().nonnegative(),
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

/** Week 1 JSON report schema. Later schema versions may add optional fields. */
export const AnalysisReportSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    generatedAt: z.string().datetime({ offset: true }),
    greenciVersion: z.string(),
    identity: WorkflowRunIdentitySchema,
    current: CurrentMetricsSchema,
    jobs: z.array(NormalizedJobSchema),
    parallelism: ParallelismSchema,
    analyzerExclusion: ExclusionSchema,
    warnings: z.array(AnalysisWarningSchema),
  })
  .strict();

export type Conclusion = z.infer<typeof ConclusionSchema>;
export type WorkflowRunIdentity = z.infer<typeof WorkflowRunIdentitySchema>;
export type NormalizedStep = z.infer<typeof NormalizedStepSchema>;
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;
export type AnalyzeWorkflowInput = z.infer<typeof AnalyzeWorkflowInputSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>;
