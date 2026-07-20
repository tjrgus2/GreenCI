import type { NormalizedJob, NormalizedStep } from '../domain/schemas.js';

interface Event {
  readonly atMs: number;
  readonly delta: 1 | -1;
}

/** Runtime and parallelism values calculated from normalized jobs. */
export interface RuntimeAnalysis {
  readonly wallClockSeconds: number;
  readonly activeSeconds: number;
  readonly runnerSeconds: number;
  readonly peakConcurrency: number;
  readonly averageConcurrency: number;
  readonly runnerTimeToWallClockRatio: number;
  readonly idleSeconds: number;
  readonly timeline: Array<{
    readonly at: string;
    readonly concurrency: number;
  }>;
}

/** Return the non-negative duration between two ISO timestamps. */
export function calculateDurationSeconds(
  startedAt: string | undefined,
  completedAt: string | undefined,
): number | undefined {
  if (startedAt === undefined || completedAt === undefined) {
    return undefined;
  }

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return undefined;
  }

  return Math.max(0, (endMs - startMs) / 1000);
}

function withStepDuration(step: NormalizedStep): NormalizedStep {
  const calculated = calculateDurationSeconds(step.startedAt, step.completedAt);
  if (calculated === undefined) {
    return step;
  }
  return { ...step, durationSeconds: calculated };
}

/** Recalculate available job and step durations from their timestamps. */
export function withCalculatedDurations(job: NormalizedJob): NormalizedJob {
  const durationSeconds = calculateDurationSeconds(
    job.startedAt,
    job.completedAt,
  );
  const next = { ...job, steps: job.steps.map(withStepDuration) };
  return durationSeconds === undefined ? next : { ...next, durationSeconds };
}

function validInterval(job: NormalizedJob): [number, number] | undefined {
  if (job.startedAt === undefined || job.completedAt === undefined) {
    return undefined;
  }
  const start = Date.parse(job.startedAt);
  const end = Date.parse(job.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return undefined;
  }
  return [start, end];
}

/**
 * Calculate wall-clock, runner-time, and sweep-line concurrency metrics.
 * Wall-clock follows the design contract: latest completion minus earliest start.
 */
export function analyzeRuntime(
  jobs: readonly NormalizedJob[],
): RuntimeAnalysis {
  const runnerSeconds = jobs.reduce(
    (total, job) => total + (job.durationSeconds ?? 0),
    0,
  );
  const intervals = jobs
    .map(validInterval)
    .filter((interval): interval is [number, number] => interval !== undefined);

  if (intervals.length === 0) {
    return {
      wallClockSeconds: 0,
      activeSeconds: 0,
      runnerSeconds,
      peakConcurrency: 0,
      averageConcurrency: 0,
      runnerTimeToWallClockRatio: 0,
      idleSeconds: 0,
      timeline: [],
    };
  }

  const events: Event[] = intervals.flatMap(([start, end]) => [
    { atMs: start, delta: 1 },
    { atMs: end, delta: -1 },
  ]);
  events.sort((left, right) => left.atMs - right.atMs);

  const firstMs = intervals.reduce(
    (minimum, [start]) => Math.min(minimum, start),
    Number.POSITIVE_INFINITY,
  );
  const lastMs = intervals.reduce(
    (maximum, [, end]) => Math.max(maximum, end),
    Number.NEGATIVE_INFINITY,
  );

  let concurrency = 0;
  let peakConcurrency = 0;
  let activeMs = 0;
  let idleMs = 0;
  let previousMs = firstMs;
  const timeline: RuntimeAnalysis['timeline'] = [];

  for (let index = 0; index < events.length;) {
    const event = events[index];
    if (event === undefined) {
      break;
    }
    const segmentMs = event.atMs - previousMs;
    if (concurrency > 0) {
      activeMs += segmentMs;
    } else {
      idleMs += segmentMs;
    }

    let delta = 0;
    let cursor = index;
    while (cursor < events.length && events[cursor]?.atMs === event.atMs) {
      delta += events[cursor]?.delta ?? 0;
      cursor += 1;
    }
    concurrency = Math.max(0, concurrency + delta);
    peakConcurrency = Math.max(peakConcurrency, concurrency);
    timeline.push({
      at: new Date(event.atMs).toISOString(),
      concurrency,
    });
    previousMs = event.atMs;
    index = cursor;
  }

  const wallClockSeconds = Math.max(0, (lastMs - firstMs) / 1000);
  const averageConcurrency =
    wallClockSeconds === 0 ? 0 : runnerSeconds / wallClockSeconds;

  return {
    wallClockSeconds,
    activeSeconds: activeMs / 1000,
    runnerSeconds,
    peakConcurrency,
    averageConcurrency,
    runnerTimeToWallClockRatio: averageConcurrency,
    idleSeconds: idleMs / 1000,
    timeline,
  };
}
