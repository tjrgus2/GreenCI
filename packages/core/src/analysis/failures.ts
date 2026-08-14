import type { Conclusion, NormalizedJob } from '../domain/schemas.js';

/** Conclusions that mean the pipeline did not succeed. */
const FAILING: readonly Conclusion[] = ['failure', 'timed_out', 'cancelled'];

/** One failed job with the step that failed and the time spent before it. */
export interface JobFailure {
  readonly jobId: number;
  readonly jobName: string;
  readonly conclusion: Conclusion;
  readonly durationSeconds: number | undefined;
  readonly failedStepName: string | undefined;
  readonly failedStepIndex: number | undefined;
  readonly secondsBeforeFailure: number | undefined;
}

/** Failure picture for one run. */
export interface FailureSummary {
  readonly failedJobCount: number;
  readonly failures: readonly JobFailure[];
  /**
   * How far into the run's wall-clock window the first failure landed. A late
   * failure means developers waited before learning the pipeline was broken.
   */
  readonly firstFailureWallClockPercent: number | undefined;
}

function firstFailedStep(
  job: NormalizedJob,
):
  { name: string; index: number; completedAt: string | undefined } | undefined {
  const step = job.steps.find((entry) => FAILING.includes(entry.conclusion));
  return step === undefined
    ? undefined
    : { name: step.name, index: step.index, completedAt: step.completedAt };
}

/** Identify failed jobs, their failed steps, and how late the failure landed. */
export function analyzeFailures(
  jobs: readonly NormalizedJob[],
): FailureSummary {
  const failedJobs = jobs.filter((job) => FAILING.includes(job.conclusion));
  const starts = jobs
    .map((job) =>
      job.startedAt === undefined ? NaN : Date.parse(job.startedAt),
    )
    .filter((value) => Number.isFinite(value));
  const ends = jobs
    .map((job) =>
      job.completedAt === undefined ? NaN : Date.parse(job.completedAt),
    )
    .filter((value) => Number.isFinite(value));
  const runStart = starts.length > 0 ? Math.min(...starts) : undefined;
  const runEnd = ends.length > 0 ? Math.max(...ends) : undefined;

  const failures: JobFailure[] = failedJobs.map((job) => {
    const step = firstFailedStep(job);
    const failedAt = step?.completedAt ?? job.completedAt;
    const failedAtMs = failedAt === undefined ? NaN : Date.parse(failedAt);
    const startedMs =
      job.startedAt === undefined ? NaN : Date.parse(job.startedAt);
    const secondsBeforeFailure =
      Number.isFinite(failedAtMs) && Number.isFinite(startedMs)
        ? Math.max(0, (failedAtMs - startedMs) / 1000)
        : undefined;
    return {
      jobId: job.id,
      jobName: job.apiName,
      conclusion: job.conclusion,
      durationSeconds: job.durationSeconds,
      failedStepName: step?.name,
      failedStepIndex: step?.index,
      secondsBeforeFailure,
    };
  });

  const failureTimes = failedJobs
    .map((job) => {
      const step = firstFailedStep(job);
      const at = step?.completedAt ?? job.completedAt;
      return at === undefined ? NaN : Date.parse(at);
    })
    .filter((value) => Number.isFinite(value));

  let firstFailureWallClockPercent: number | undefined;
  if (
    failureTimes.length > 0 &&
    runStart !== undefined &&
    runEnd !== undefined &&
    runEnd > runStart
  ) {
    const first = Math.min(...failureTimes);
    firstFailureWallClockPercent = Math.min(
      100,
      Math.max(0, ((first - runStart) / (runEnd - runStart)) * 100),
    );
  }

  return {
    failedJobCount: failedJobs.length,
    failures,
    firstFailureWallClockPercent,
  };
}
