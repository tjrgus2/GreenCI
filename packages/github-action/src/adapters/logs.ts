import {
  DiagnosticsReportSchema,
  parseFailureLog,
  selectAnnotations,
  type AnalysisWarning,
  type Diagnostic,
  type FailureSummary,
} from '@greenci/core';
import type { z } from 'zod';
import { describeError } from './errors.js';
import { mapWithConcurrency, type GitHubDataSource } from './github.js';

/** Diagnostics plus the annotations that met the confidence threshold. */
export interface DiagnosticsCollection {
  readonly report: z.infer<typeof DiagnosticsReportSchema>;
  readonly annotations: readonly (Diagnostic & { readonly jobName: string })[];
  readonly warnings: AnalysisWarning[];
}

/** Opt-in failed-log parsing configuration for one run. */
export interface DiagnosticsRequest {
  readonly owner: string;
  readonly repository: string;
  readonly enabled: boolean;
  readonly maxBytesPerJob: number;
  readonly maxJobs: number;
  readonly tailLines: number;
  readonly annotations: {
    readonly enabled: boolean;
    readonly maxCount: number;
    readonly minConfidence: number;
  };
}

function disabled(): DiagnosticsCollection {
  return {
    report: DiagnosticsReportSchema.parse({
      enabled: false,
      jobsParsed: 0,
      annotationsEmitted: 0,
      diagnostics: [],
    }),
    annotations: [],
    warnings: [],
  };
}

/**
 * Parse a bounded tail of each failed job log, in memory only.
 *
 * Log parsing is opt-in. When enabled, only failed jobs are read, the number of
 * jobs and bytes is capped, nothing is persisted, and only sanitized,
 * credential-redacted diagnostics leave this function.
 */
export async function collectDiagnostics(
  source: GitHubDataSource,
  failures: FailureSummary,
  request: DiagnosticsRequest,
): Promise<DiagnosticsCollection> {
  if (!request.enabled || failures.failedJobCount === 0) {
    return disabled();
  }

  const warnings: AnalysisWarning[] = [];
  const targets = failures.failures.slice(0, request.maxJobs);
  const collected = await mapWithConcurrency(targets, 2, async (failure) => {
    let raw: string;
    try {
      raw = await source.downloadJobLogs({
        owner: request.owner,
        repository: request.repository,
        jobId: failure.jobId,
      });
    } catch (error: unknown) {
      return {
        jobName: failure.jobName,
        diagnostics: [] as Diagnostic[],
        error: describeError(error),
        truncated: false,
      };
    }
    const parsed = parseFailureLog(
      raw,
      {
        jobName: failure.jobName,
        stepName: failure.failedStepName,
      },
      {
        maxBytes: request.maxBytesPerJob,
        maxLines: request.tailLines,
        maxDiagnostics: 20,
      },
    );
    return {
      jobName: failure.jobName,
      diagnostics: parsed.diagnostics as Diagnostic[],
      error: undefined,
      truncated: parsed.truncatedBytes || parsed.truncatedLines,
    };
  });

  const failed = collected.filter((entry) => entry.error !== undefined);
  if (failed.length > 0) {
    warnings.push({
      code: 'FAILURE_LOG_UNAVAILABLE',
      source: 'github-api',
      message: `Logs for ${failed.length} failed job(s) could not be downloaded; the original GitHub logs remain available.`,
    });
  }
  if (collected.some((entry) => entry.truncated)) {
    warnings.push({
      code: 'FAILURE_LOG_TRUNCATED',
      source: 'action',
      message:
        'Failed-job logs were truncated to the configured byte and line limits before parsing.',
    });
  }

  const diagnostics = collected.flatMap((entry) =>
    entry.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      jobName: entry.jobName,
    })),
  );
  const annotations = request.annotations.enabled
    ? selectAnnotations(diagnostics, {
        minConfidence: request.annotations.minConfidence,
        maxCount: request.annotations.maxCount,
      })
    : [];

  return {
    report: DiagnosticsReportSchema.parse({
      enabled: true,
      jobsParsed: collected.filter((entry) => entry.error === undefined).length,
      annotationsEmitted: annotations.length,
      diagnostics,
    }),
    annotations: annotations as (Diagnostic & { jobName: string })[],
    warnings,
  };
}
