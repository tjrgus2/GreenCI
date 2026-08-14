import type { DagConfidence, WorkflowDag } from './dag.js';
import type { NormalizedJob } from '../domain/schemas.js';

/** One node on the longest weighted path through the workflow. */
export interface CriticalPathNode {
  readonly id: string;
  readonly label: string;
  readonly durationSeconds: number;
  readonly contributionPercent: number;
}

/**
 * A job that does not delay the developer but still consumes a large share of
 * runner time, cost, and carbon.
 */
export interface ParallelHotspot {
  readonly id: string;
  readonly label: string;
  readonly runnerSeconds: number;
  readonly runnerSharePercent: number;
}

/** Critical-path result, always labelled with how it was obtained. */
export interface CriticalPathAnalysis {
  readonly method: 'dag' | 'interval-fallback' | 'unavailable';
  readonly confidence: DagConfidence;
  readonly totalSeconds: number;
  readonly wallClockSharePercent: number;
  readonly path: readonly CriticalPathNode[];
  readonly nonCriticalHotspots: readonly ParallelHotspot[];
  readonly reasons: readonly string[];
}

function share(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
}

function hotspots(
  entries: readonly { id: string; label: string; runnerSeconds: number }[],
  criticalIds: ReadonlySet<string>,
  totalRunnerSeconds: number,
  limit: number,
): ParallelHotspot[] {
  return entries
    .filter((entry) => !criticalIds.has(entry.id) && entry.runnerSeconds > 0)
    .sort((left, right) => right.runnerSeconds - left.runnerSeconds)
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      runnerSeconds: entry.runnerSeconds,
      runnerSharePercent: share(entry.runnerSeconds, totalRunnerSeconds),
    }));
}

/**
 * Longest weighted path through the reconstructed `needs` graph.
 *
 * The result answers "what made the developer wait", which is a different
 * question from "what consumed the most runner time" — the second is reported
 * separately as non-critical hotspots.
 */
export function analyzeCriticalPath(
  dag: WorkflowDag,
  wallClockSeconds: number,
  limit = 5,
): CriticalPathAnalysis {
  const totalRunnerSeconds = dag.nodes.reduce(
    (total, node) => total + node.runnerSeconds,
    0,
  );
  if (dag.nodes.length === 0 || !dag.acyclic) {
    return {
      method: 'unavailable',
      confidence: 'low',
      totalSeconds: 0,
      wallClockSharePercent: 0,
      path: [],
      nonCriticalHotspots: hotspots(
        dag.nodes,
        new Set(),
        totalRunnerSeconds,
        limit,
      ),
      reasons: [...dag.reasons, 'critical-path-unavailable'],
    };
  }

  const byId = new Map(dag.nodes.map((node) => [node.id, node]));
  const finishAt = new Map<string, number>();
  const predecessor = new Map<string, string | undefined>();

  const resolve = (id: string, guard: ReadonlySet<string>): number => {
    const cached = finishAt.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const node = byId.get(id);
    if (node === undefined || guard.has(id)) {
      return 0;
    }
    const nextGuard = new Set([...guard, id]);
    let bestStart = 0;
    let bestPredecessor: string | undefined;
    for (const dependency of node.needs) {
      const finish = resolve(dependency, nextGuard);
      if (finish > bestStart) {
        bestStart = finish;
        bestPredecessor = dependency;
      }
    }
    const finish = bestStart + node.durationSeconds;
    finishAt.set(id, finish);
    predecessor.set(id, bestPredecessor);
    return finish;
  };

  let endId: string | undefined;
  let totalSeconds = 0;
  for (const node of dag.nodes) {
    const finish = resolve(node.id, new Set());
    if (finish > totalSeconds) {
      totalSeconds = finish;
      endId = node.id;
    }
  }

  const sequence: string[] = [];
  let cursor = endId;
  while (cursor !== undefined && !sequence.includes(cursor)) {
    sequence.unshift(cursor);
    cursor = predecessor.get(cursor);
  }

  const path = sequence.map((id) => {
    const node = byId.get(id);
    return {
      id,
      label: node?.label ?? id,
      durationSeconds: node?.durationSeconds ?? 0,
      contributionPercent: share(node?.durationSeconds ?? 0, totalSeconds),
    };
  });

  return {
    method: 'dag',
    confidence: dag.confidence,
    totalSeconds,
    wallClockSharePercent: share(totalSeconds, wallClockSeconds),
    path,
    nonCriticalHotspots: hotspots(
      dag.nodes,
      new Set(sequence),
      totalRunnerSeconds,
      limit,
    ),
    reasons: dag.reasons,
  };
}

function intervalOf(job: NormalizedJob): [number, number] | undefined {
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
 * Fallback used when the workflow definition is unavailable.
 *
 * It measures how much wall-clock time each job occupied alone, which is a
 * useful ranking but is explicitly *not* a DAG critical path, and the result
 * says so.
 */
export function analyzeIntervalCriticality(
  jobs: readonly NormalizedJob[],
  wallClockSeconds: number,
  limit = 5,
): CriticalPathAnalysis {
  const intervals = jobs
    .map((job) => ({ job, interval: intervalOf(job) }))
    .filter(
      (entry): entry is { job: NormalizedJob; interval: [number, number] } =>
        entry.interval !== undefined,
    );
  const totalRunnerSeconds = jobs.reduce(
    (total, job) => total + (job.durationSeconds ?? 0),
    0,
  );
  if (intervals.length === 0) {
    return {
      method: 'unavailable',
      confidence: 'low',
      totalSeconds: 0,
      wallClockSharePercent: 0,
      path: [],
      nonCriticalHotspots: [],
      reasons: ['workflow-definition-unavailable', 'no-job-intervals'],
    };
  }

  const exclusive = intervals.map(({ job, interval }) => {
    const others = intervals.filter((entry) => entry.job.id !== job.id);
    let exclusiveMs = 0;
    let cursor = interval[0];
    const overlaps = others
      .map((entry) => entry.interval)
      .filter(([start, end]) => end > interval[0] && start < interval[1])
      .sort((left, right) => left[0] - right[0]);
    for (const [start, end] of overlaps) {
      if (start > cursor) {
        exclusiveMs += start - cursor;
      }
      cursor = Math.max(cursor, end);
      if (cursor >= interval[1]) {
        break;
      }
    }
    if (cursor < interval[1]) {
      exclusiveMs += interval[1] - cursor;
    }
    return {
      id: String(job.id),
      label: job.apiName,
      durationSeconds: job.durationSeconds ?? 0,
      runnerSeconds: job.durationSeconds ?? 0,
      exclusiveSeconds: exclusiveMs / 1000,
    };
  });

  const ranked = [...exclusive]
    .filter((entry) => entry.exclusiveSeconds > 0)
    .sort((left, right) => right.exclusiveSeconds - left.exclusiveSeconds);
  const totalSeconds = ranked.reduce(
    (total, entry) => total + entry.exclusiveSeconds,
    0,
  );
  const criticalIds = new Set(ranked.slice(0, limit).map((entry) => entry.id));

  return {
    method: 'interval-fallback',
    confidence: 'low',
    totalSeconds,
    wallClockSharePercent: share(totalSeconds, wallClockSeconds),
    path: ranked.slice(0, limit).map((entry) => ({
      id: entry.id,
      label: entry.label,
      durationSeconds: entry.exclusiveSeconds,
      contributionPercent: share(entry.exclusiveSeconds, totalSeconds),
    })),
    nonCriticalHotspots: hotspots(
      exclusive,
      criticalIds,
      totalRunnerSeconds,
      limit,
    ),
    reasons: ['workflow-definition-unavailable', 'interval-based-estimate'],
  };
}
