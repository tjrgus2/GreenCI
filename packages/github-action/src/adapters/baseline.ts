import { z } from 'zod';
import { BaselineRunSampleSchema, type AnalysisWarning } from '@greenci/core';
import { describeError } from './errors.js';
import {
  mapWithConcurrency,
  normalizeJobs,
  type GitHubDataSource,
} from './github.js';

/** Historical run collection may fail without failing the whole analysis. */
export interface BaselineCollection {
  readonly available: boolean;
  readonly branch: string | undefined;
  readonly samples: z.infer<typeof BaselineRunSampleSchema>[];
  readonly warnings: AnalysisWarning[];
}

const RunSummarySchema = z
  .object({
    id: z.number().int().nonnegative(),
    run_attempt: z.number().int().positive().default(1),
    head_sha: z.string().min(1),
    head_branch: z.string().nullable(),
    created_at: z.string().nullable().optional(),
    conclusion: z.string().nullable(),
  })
  .passthrough();

const RunSummaryListSchema = z.array(RunSummarySchema);

/** Bounded concurrency for historical job requests, per the design contract. */
export const BASELINE_CONCURRENCY = 3;

/** Where the historical baseline should be collected from. */
export interface BaselineReference {
  readonly owner: string;
  readonly repository: string;
  readonly workflowId: number;
  readonly branch: string | undefined;
  readonly currentRunId: number;
  readonly maxRuns: number;
}

/**
 * Collect successful historical runs of the same workflow on the baseline
 * branch. Every failure degrades to an unavailable baseline with a structured
 * warning instead of failing the GreenCI job.
 */
export async function collectBaseline(
  source: GitHubDataSource,
  reference: BaselineReference,
): Promise<BaselineCollection> {
  if (reference.branch === undefined || reference.branch.length === 0) {
    return {
      available: false,
      branch: undefined,
      samples: [],
      warnings: [
        {
          code: 'BASELINE_UNAVAILABLE',
          source: 'action',
          message:
            'No baseline branch could be determined for this event, so no historical comparison was attempted.',
        },
      ],
    };
  }

  let rawRuns: unknown;
  try {
    rawRuns = await source.listSuccessfulRuns({
      owner: reference.owner,
      repository: reference.repository,
      workflowId: reference.workflowId,
      branch: reference.branch,
      perPage: Math.min(100, reference.maxRuns + 5),
    });
  } catch (error: unknown) {
    return {
      available: false,
      branch: reference.branch,
      samples: [],
      warnings: [
        {
          code: 'BASELINE_UNAVAILABLE',
          source: 'github-api',
          message: `Historical workflow runs could not be listed (${describeError(error)}); GreenCI reports the current run only.`,
        },
      ],
    };
  }

  const parsed = RunSummaryListSchema.safeParse(rawRuns);
  if (!parsed.success) {
    return {
      available: false,
      branch: reference.branch,
      samples: [],
      warnings: [
        {
          code: 'BASELINE_UNAVAILABLE',
          source: 'github-api',
          message:
            'The historical workflow-run response did not match the expected shape.',
        },
      ],
    };
  }

  const seen = new Set<number>();
  const candidates = parsed.data
    .filter(
      (run) =>
        run.conclusion === 'success' && run.id !== reference.currentRunId,
    )
    .filter((run) => {
      if (seen.has(run.id)) {
        return false;
      }
      seen.add(run.id);
      return true;
    })
    .slice(0, reference.maxRuns);

  const warnings: AnalysisWarning[] = [];
  const collected = await mapWithConcurrency(
    candidates,
    BASELINE_CONCURRENCY,
    async (run) => {
      try {
        const rawJobs = await source.listJobsForRunAttempt({
          owner: reference.owner,
          repository: reference.repository,
          runId: run.id,
          runAttempt: run.run_attempt,
        });
        return BaselineRunSampleSchema.parse({
          runId: run.id,
          runAttempt: run.run_attempt,
          headSha: run.head_sha,
          ...(run.created_at === null || run.created_at === undefined
            ? {}
            : { createdAt: new Date(run.created_at).toISOString() }),
          jobs: normalizeJobs(rawJobs),
        });
      } catch {
        return undefined;
      }
    },
  );

  const samples = collected.filter(
    (sample): sample is z.infer<typeof BaselineRunSampleSchema> =>
      sample !== undefined,
  );
  if (samples.length < candidates.length) {
    warnings.push({
      code: 'BASELINE_UNAVAILABLE',
      source: 'github-api',
      message: `Jobs could not be collected for ${candidates.length - samples.length} of ${candidates.length} historical runs; those runs were skipped.`,
    });
  }

  return {
    available: true,
    branch: reference.branch,
    samples,
    warnings,
  };
}
