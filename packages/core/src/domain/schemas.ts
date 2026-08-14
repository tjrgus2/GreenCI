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
    createdAt: z.string().datetime({ offset: true }).optional(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    durationSeconds: z.number().nonnegative().optional(),
    queueSeconds: z.number().nonnegative().optional(),
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
      'CONFIG_INVALID',
      'CONFIG_UNAVAILABLE',
      'BASELINE_UNAVAILABLE',
      'BASELINE_INSUFFICIENT_SAMPLES',
      'WORKFLOW_SHAPE_CHANGED',
      'RUNNER_MODEL_UNKNOWN',
      'RUNNER_PRICE_UNKNOWN',
      'CARBON_REGION_UNKNOWN',
      'PR_COMMENT_UNAVAILABLE',
      'PR_COMMENT_FAILED',
      'WORKFLOW_DAG_UNAVAILABLE',
      'CRITICAL_PATH_DEGRADED',
      'RECOMMENDATION_RULE_FAILED',
      'TEST_ARTIFACT_UNAVAILABLE',
      'TEST_ARTIFACT_UNSAFE',
      'FAILURE_LOG_UNAVAILABLE',
      'FAILURE_LOG_TRUNCATED',
    ]),
    source: z.enum(['core', 'github-api', 'action']),
    message: z.string().min(1),
  })
  .strict();

/** A declared `needs` edge reconstructed from the workflow definition. */
export const WorkflowEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();

/** One historical successful run used as a baseline sample. */
export const BaselineRunSampleSchema = z
  .object({
    runId: z.number().int().nonnegative(),
    runAttempt: z.number().int().positive(),
    headSha: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }).optional(),
    jobs: z.array(NormalizedJobSchema),
  })
  .strict();

/** Historical baseline collection result handed to the pure analyzer. */
export const BaselineInputSchema = z
  .object({
    available: z.boolean(),
    branch: z.string().min(1).optional(),
    samples: z.array(BaselineRunSampleSchema).default([]),
  })
  .strict();

const TestCaseSchema = z
  .object({
    suite: z.string(),
    name: z.string(),
    durationSeconds: z.number().finite().nonnegative(),
    status: z.enum(['passed', 'failed', 'error', 'skipped']),
    message: z.string().optional(),
  })
  .strict();

/** Aggregated JUnit results parsed from a hardened artifact reader. */
export const TestReportSchema = z
  .object({
    artifact: z.string().min(1),
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    errored: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    durationSeconds: z.number().finite().nonnegative(),
    parsedFiles: z.number().int().nonnegative(),
    truncated: z.boolean(),
    slowestSuites: z.array(
      z
        .object({
          name: z.string(),
          total: z.number().int().nonnegative(),
          failed: z.number().int().nonnegative(),
          durationSeconds: z.number().finite().nonnegative(),
        })
        .strict(),
    ),
    slowestCases: z.array(TestCaseSchema),
    failedCases: z.array(TestCaseSchema),
    rejections: z.array(
      z.object({ path: z.string(), reason: z.string() }).strict(),
    ),
  })
  .strict();

/** Sanitized diagnostics extracted from opt-in failed-job log parsing. */
export const DiagnosticsReportSchema = z
  .object({
    enabled: z.boolean(),
    jobsParsed: z.number().int().nonnegative(),
    annotationsEmitted: z.number().int().nonnegative(),
    diagnostics: z.array(
      z
        .object({
          parserId: z.string().min(1),
          severity: z.enum(['error', 'warning', 'notice']),
          message: z.string(),
          file: z.string().optional(),
          line: z.number().int().positive().optional(),
          column: z.number().int().positive().optional(),
          confidence: z.number().min(0).max(1),
          fingerprint: z.string().min(1),
          jobName: z.string(),
        })
        .strict(),
    ),
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
    config: z.unknown().optional(),
    locale: z.enum(['en', 'ko']).optional(),
    baselineRuns: z.number().int().min(1).max(20).optional(),
    baseline: BaselineInputSchema.optional(),
    edges: z.array(WorkflowEdgeSchema).optional(),
    workflowDefinition: z.unknown().optional(),
    tests: TestReportSchema.optional(),
    diagnostics: DiagnosticsReportSchema.optional(),
  })
  .strict();

export type Conclusion = z.infer<typeof ConclusionSchema>;
export type WorkflowRunIdentity = z.infer<typeof WorkflowRunIdentitySchema>;
export type NormalizedStep = z.infer<typeof NormalizedStepSchema>;
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;
export type AnalyzeWorkflowInput = z.infer<typeof AnalyzeWorkflowInputSchema>;
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>;
