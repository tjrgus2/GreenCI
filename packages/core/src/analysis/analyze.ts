import { excludeAnalyzerJob } from './exclusion.js';
import { analyzeRuntime, withCalculatedDurations } from './runtime.js';
import {
  AnalysisReportSchema,
  AnalyzeWorkflowInputSchema,
  type AnalysisReport,
} from '../domain/schemas.js';

export const GREENCI_VERSION = '0.1.0';

/** Analyze one sanitized current workflow run without network or file access. */
export function analyzeWorkflow(input: unknown): AnalysisReport {
  const validated = AnalyzeWorkflowInputSchema.parse(input);
  const jobsWithDurations = validated.jobs.map(withCalculatedDurations);
  const exclusion = excludeAnalyzerJob(
    jobsWithDurations,
    validated.currentJobName,
  );
  const runtime = analyzeRuntime(exclusion.jobs);
  const warnings = [...validated.warnings];

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

  return AnalysisReportSchema.parse({
    schemaVersion: '1.0.0',
    generatedAt: validated.generatedAt,
    greenciVersion: GREENCI_VERSION,
    identity: validated.identity,
    current: {
      wallClockSeconds: runtime.wallClockSeconds,
      activeSeconds: runtime.activeSeconds,
      runnerSeconds: runtime.runnerSeconds,
      jobsAnalyzed: exclusion.jobs.length,
      stepsAnalyzed: exclusion.jobs.reduce(
        (total, job) => total + job.steps.length,
        0,
      ),
    },
    jobs: exclusion.jobs,
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
    warnings,
  });
}
