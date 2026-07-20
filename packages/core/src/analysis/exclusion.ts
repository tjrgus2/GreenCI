import type { NormalizedJob } from '../domain/schemas.js';

/** How GreenCI identified and removed its currently running analyzer job. */
export interface AnalyzerExclusion {
  readonly jobs: NormalizedJob[];
  readonly excludedJobIds: number[];
  readonly method: 'name' | 'in-progress' | 'none';
  readonly heuristic: boolean;
}

function comparableName(value: string): string {
  return value.toLocaleLowerCase('en-US').replaceAll(/[^a-z0-9]/g, '');
}

function isInProgress(job: NormalizedJob): boolean {
  return (
    job.startedAt !== undefined &&
    job.completedAt === undefined &&
    job.conclusion === 'unknown'
  );
}

/**
 * Exclude the analyzer itself, preferring the GitHub job key/name and falling
 * back only when exactly one running job is visible.
 */
export function excludeAnalyzerJob(
  jobs: readonly NormalizedJob[],
  currentJobName: string | undefined,
): AnalyzerExclusion {
  if (currentJobName !== undefined) {
    const expected = comparableName(currentJobName);
    const nameMatches = jobs.filter(
      (job) => comparableName(job.apiName) === expected,
    );
    if (nameMatches.length === 1) {
      const excluded = nameMatches[0];
      if (excluded !== undefined) {
        return {
          jobs: jobs.filter((job) => job.id !== excluded.id),
          excludedJobIds: [excluded.id],
          method: 'name',
          heuristic: false,
        };
      }
    }
  }

  const running = jobs.filter(isInProgress);
  if (running.length === 1) {
    const excluded = running[0];
    if (excluded !== undefined) {
      return {
        jobs: jobs.filter((job) => job.id !== excluded.id),
        excludedJobIds: [excluded.id],
        method: 'in-progress',
        heuristic: true,
      };
    }
  }

  return {
    jobs: [...jobs],
    excludedJobIds: [],
    method: 'none',
    heuristic: false,
  };
}
