import {
  compareWithBaseline,
  type BaselineComparison,
  type DerivedMetric,
} from './baseline.js';
import { excludeAnalyzerJob, type AnalyzerExclusion } from './exclusion.js';
import { analyzeRuntime, withCalculatedDurations } from './runtime.js';
import { buildWorkflowShape, withLogicalIdentity } from './shape.js';
import { dataManifest } from '../datasets/index.js';
import { resolveConfig, type ResolvedConfig } from '../domain/config.js';
import {
  AnalysisReportSchema,
  REPORT_SCHEMA_VERSION,
  type AnalysisReport,
} from '../domain/report.js';
import {
  AnalyzeWorkflowInputSchema,
  type AnalysisWarning,
  type NormalizedJob,
  type WorkflowRunIdentity,
} from '../domain/schemas.js';
import { estimateCarbon, type CarbonEstimate } from '../estimation/carbon.js';
import { estimateCost, type CostEstimate } from '../estimation/cost.js';

/** Published GreenCI version recorded in every report. */
export const GREENCI_VERSION = '0.2.0';

function referenceYear(generatedAt: string): number {
  const parsed = Date.parse(generatedAt);
  return Number.isFinite(parsed) ? new Date(parsed).getUTCFullYear() : 2026;
}

function carbonFor(
  jobs: readonly NormalizedJob[],
  runId: number,
  config: ResolvedConfig,
  configHash: string,
  year: number,
): CarbonEstimate {
  return estimateCarbon({
    jobs,
    runId,
    configHash,
    region: config.carbon.region,
    simulationSamples: config.carbon.simulationSamples,
    pue: config.carbon.pue,
    utilization: config.carbon.utilization,
    referenceYear: year,
  });
}

function collectWarnings(
  exclusion: AnalyzerExclusion,
  baseline: BaselineComparison,
  cost: CostEstimate | undefined,
  carbon: CarbonEstimate | undefined,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  if (exclusion.heuristic) {
    warnings.push({
      code: 'ANALYZER_EXCLUSION_HEURISTIC',
      source: 'core',
      message:
        'The current analyzer job was excluded heuristically because its API name did not match GITHUB_JOB.',
    });
  }
  if (exclusion.excludedJobIds.length === 0) {
    warnings.push({
      code: 'ANALYZER_NOT_IDENTIFIED',
      source: 'core',
      message:
        'The current analyzer job could not be identified; incomplete jobs do not contribute duration metrics.',
    });
  }
  if (exclusion.jobs.some((job) => job.durationSeconds === undefined)) {
    warnings.push({
      code: 'JOB_TIMESTAMPS_INCOMPLETE',
      source: 'core',
      message:
        'One or more jobs had incomplete timestamps and were excluded from runner-time totals.',
    });
  }
  if (
    exclusion.jobs.some((job) =>
      job.steps.some((step) => step.durationSeconds === undefined),
    )
  ) {
    warnings.push({
      code: 'STEP_TIMESTAMPS_INCOMPLETE',
      source: 'core',
      message:
        'One or more steps had incomplete timestamps and show an unavailable duration.',
    });
  }

  if (baseline.status === 'unavailable') {
    warnings.push({
      code: 'BASELINE_UNAVAILABLE',
      source: 'core',
      message:
        'No comparable historical run was available; GreenCI reports the current run without regression claims.',
    });
  }
  if (baseline.status === 'insufficient-samples') {
    warnings.push({
      code: 'BASELINE_INSUFFICIENT_SAMPLES',
      source: 'core',
      message: `Only ${baseline.sampleCount} comparable baseline runs were available; ${baseline.minimumSamples} are required before a regression is claimed.`,
    });
  }
  if (baseline.status === 'shape-changed' || baseline.excludedForShape > 0) {
    warnings.push({
      code: 'WORKFLOW_SHAPE_CHANGED',
      source: 'core',
      message: `${baseline.excludedForShape} historical run(s) were excluded because the workflow structure differed by more than the configured shape threshold.`,
    });
  }

  if (cost !== undefined && cost.unknownRunnerClasses.length > 0) {
    warnings.push({
      code: 'RUNNER_PRICE_UNKNOWN',
      source: 'core',
      message: `No price is applied to unknown runner classes: ${cost.unknownRunnerClasses.join(', ')}.`,
    });
  }
  if (carbon !== undefined && carbon.unknownRunnerClasses.length > 0) {
    warnings.push({
      code: 'RUNNER_MODEL_UNKNOWN',
      source: 'core',
      message: `No power model is applied to unknown runner classes: ${carbon.unknownRunnerClasses.join(', ')}.`,
    });
  }
  if (carbon !== undefined && !carbon.regionResolved) {
    warnings.push({
      code: 'CARBON_REGION_UNKNOWN',
      source: 'core',
      message: `The configured carbon region is not in the bundled dataset; GreenCI used ${carbon.region} and lowered the data-quality score.`,
    });
  }

  return warnings;
}

function baselineBranch(
  identity: WorkflowRunIdentity,
  config: ResolvedConfig,
  provided: string | undefined,
): string | undefined {
  return provided ?? config.baseline.branch ?? identity.baseBranch;
}

/**
 * Analyze one sanitized workflow run without network, file, clock, or random
 * access. Every estimate is deterministic for identical inputs.
 */
export function analyzeWorkflow(input: unknown): AnalysisReport {
  const validated = AnalyzeWorkflowInputSchema.parse(input);
  const resolution = resolveConfig(validated.config, {
    locale: validated.locale,
    baselineRuns: validated.baselineRuns,
  });
  const config = resolution.config;
  const year = referenceYear(validated.generatedAt);

  const jobsWithDurations = validated.jobs
    .map(withCalculatedDurations)
    .map(withLogicalIdentity);
  const exclusion = config.analysis.excludeCurrentJob
    ? excludeAnalyzerJob(jobsWithDurations, validated.currentJobName)
    : {
        jobs: jobsWithDurations,
        excludedJobIds: [],
        method: 'none' as const,
        heuristic: false,
      };
  const jobs = exclusion.jobs;
  const excludedJobIds = new Set(exclusion.excludedJobIds);
  const excludedLogicalJobIds = jobsWithDurations
    .filter((job) => excludedJobIds.has(job.id))
    .map((job) => job.logicalJobId ?? job.apiName);
  const runtime = analyzeRuntime(jobs);
  const shape = buildWorkflowShape({
    workflowPath: validated.identity.workflowPath,
    jobs,
    edges: validated.edges,
  });

  const cost = config.cost.enabled
    ? estimateCost(jobs, validated.identity)
    : undefined;
  const carbon = config.carbon.enabled
    ? carbonFor(
        jobs,
        validated.identity.runId,
        config,
        resolution.configHash,
        year,
      )
    : undefined;

  const derivedMetrics: DerivedMetric[] = [];
  if (config.cost.enabled) {
    derivedMetrics.push({
      metric: 'list-price-usd',
      compute: (baselineJobs) =>
        estimateCost(baselineJobs, validated.identity).grossListPriceUsd,
    });
  }
  if (config.carbon.enabled) {
    derivedMetrics.push({
      metric: 'carbon-p50-grams',
      compute: (baselineJobs, runId) =>
        carbonFor(baselineJobs, runId, config, resolution.configHash, year)
          .operationalCarbonGrams.p50,
    });
  }

  const baseline = compareWithBaseline({
    workflowPath: validated.identity.workflowPath,
    currentRunId: validated.identity.runId,
    currentJobs: jobs,
    samples: validated.baseline?.samples ?? [],
    branch: baselineBranch(
      validated.identity,
      config,
      validated.baseline?.branch,
    ),
    requestedRuns: config.baseline.successfulRuns,
    minimumSamples: config.baseline.minimumSamples,
    shapeThreshold: config.baseline.workflowShapeThreshold,
    regressionPercent: config.baseline.statistics.regressionPercent,
    modifiedZScoreThreshold: config.baseline.statistics.modifiedZScore,
    available: validated.baseline?.available ?? false,
    edges: validated.edges,
    derivedMetrics,
    excludedLogicalJobIds,
  });

  const warnings = [
    ...validated.warnings,
    ...resolution.warnings,
    ...collectWarnings(exclusion, baseline, cost, carbon),
  ];

  return AnalysisReportSchema.parse({
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: validated.generatedAt,
    greenciVersion: GREENCI_VERSION,
    locale: config.locale,
    configHash: resolution.configHash,
    identity: validated.identity,
    current: {
      wallClockSeconds: runtime.wallClockSeconds,
      activeSeconds: runtime.activeSeconds,
      runnerSeconds: runtime.runnerSeconds,
      jobsAnalyzed: jobs.length,
      stepsAnalyzed: jobs.reduce((total, job) => total + job.steps.length, 0),
    },
    jobs,
    parallelism: {
      peakConcurrency: runtime.peakConcurrency,
      averageConcurrency: runtime.averageConcurrency,
      runnerTimeToWallClockRatio: runtime.runnerTimeToWallClockRatio,
      idleSeconds: runtime.idleSeconds,
      timeline: runtime.timeline,
    },
    analyzerExclusion: {
      excludedJobIds: exclusion.excludedJobIds,
      method: exclusion.method,
      heuristic: exclusion.heuristic,
    },
    shape: {
      fingerprint: shape.fingerprint,
      jobIds: shape.jobIds,
      stepKeyCount: shape.stepKeys.length,
      matrixKeyCount: shape.matrixKeys.length,
      edgesAvailable: shape.edgesAvailable,
      edgeCount: shape.edges.length,
    },
    baseline,
    ...(cost === undefined ? {} : { cost }),
    ...(carbon === undefined ? {} : { carbon }),
    dataManifest: dataManifest.datasets,
    warnings,
  });
}

/** The resolved configuration used for a report, exposed for adapters. */
export { resolveConfig } from '../domain/config.js';
