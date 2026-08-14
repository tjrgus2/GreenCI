import {
  analyzeCriticalPath,
  type CriticalPathAnalysis,
} from './critical-path.js';
import { buildWorkflowDag, type WorkflowDefinition } from './dag.js';
import { deriveLogicalJobId } from './shape.js';
import type { NormalizedJob } from '../domain/schemas.js';
import type { CarbonEstimate } from '../estimation/carbon.js';
import type { CostEstimate } from '../estimation/cost.js';

/**
 * Deterministic counterfactual analysis.
 *
 * Every figure here is a *counterfactual estimate*, not a promise. GreenCI
 * recomputes its own models over hypothetically shortened jobs; it cannot know
 * whether the change is achievable or what second-order effects it would have.
 */

/** A single hypothetical change. */
export interface WhatIfScenario {
  readonly scenarioId: string;
  /** Logical job id when the DAG is available, otherwise the API job name. */
  readonly targetId: string;
  readonly targetLabel: string;
  readonly speedupPercent: number;
  readonly onCriticalPath: boolean;
}

/** One before/after pair. */
export interface WhatIfDelta {
  readonly before: number;
  readonly after: number;
  readonly changePercent: number;
}

/** The estimated effect of one scenario. */
export interface WhatIfResult {
  readonly scenarioId: string;
  readonly targetLabel: string;
  readonly speedupPercent: number;
  readonly onCriticalPath: boolean;
  readonly method: 'dag' | 'runner-only';
  readonly criticalPathSeconds: WhatIfDelta | undefined;
  readonly runnerSeconds: WhatIfDelta;
  readonly listPriceUsd: WhatIfDelta | undefined;
  readonly carbonP50Grams: WhatIfDelta | undefined;
}

/** Counterfactual results plus the disclaimer that must travel with them. */
export interface WhatIfAnalysis {
  readonly available: boolean;
  readonly method: 'dag' | 'runner-only' | 'unavailable';
  readonly results: readonly WhatIfResult[];
  readonly disclaimer: string;
}

const DISCLAIMER =
  'Counterfactual estimates recomputed from GreenCI models over hypothetically shortened jobs. They are not measured savings and not a guarantee that the change is achievable.';

/** Everything the counterfactual engine needs, all of it already computed. */
export interface WhatIfInput {
  readonly jobs: readonly NormalizedJob[];
  readonly definition: WorkflowDefinition | undefined;
  readonly criticalPath: CriticalPathAnalysis;
  readonly speedupPercent: number;
  readonly maxScenarios: number;
  readonly estimateCost: (jobs: readonly NormalizedJob[]) => CostEstimate;
  readonly estimateCarbon: (jobs: readonly NormalizedJob[]) => CarbonEstimate;
}

function delta(before: number, after: number): WhatIfDelta {
  const changePercent = before > 0 ? ((after - before) / before) * 100 : 0;
  return {
    before,
    after,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
  };
}

function runnerSecondsOf(jobs: readonly NormalizedJob[]): number {
  return jobs.reduce((total, job) => total + (job.durationSeconds ?? 0), 0);
}

function scaleStep(
  step: NormalizedJob['steps'][number],
  factor: number,
): NormalizedJob['steps'][number] {
  return step.durationSeconds === undefined
    ? step
    : { ...step, durationSeconds: step.durationSeconds * factor };
}

/**
 * Shorten every API job that belongs to one target.
 *
 * Timestamps are deliberately left untouched: a counterfactual has no real
 * schedule, so only durations are scaled and the affected metrics are the ones
 * derived from durations.
 */
function applyScenario(
  jobs: readonly NormalizedJob[],
  matches: (job: NormalizedJob) => boolean,
  factor: number,
): NormalizedJob[] {
  return jobs.map((job) =>
    matches(job)
      ? {
          ...job,
          ...(job.durationSeconds === undefined
            ? {}
            : { durationSeconds: job.durationSeconds * factor }),
          steps: job.steps.map((step) => scaleStep(step, factor)),
        }
      : job,
  );
}

interface Candidate {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly onCriticalPath: boolean;
  readonly matches: (job: NormalizedJob) => boolean;
}

/**
 * Pick the two contrasting candidates that make the distinction visible: the
 * job that dominates the critical path, and the job that dominates runner
 * consumption without being on it.
 */
function selectCandidates(input: WhatIfInput): Candidate[] {
  const candidates: Candidate[] = [];
  const criticalPath = input.criticalPath;

  const topCritical = [...criticalPath.path].sort(
    (left, right) => right.durationSeconds - left.durationSeconds,
  )[0];
  const topHotspot = [...criticalPath.nonCriticalHotspots].sort(
    (left, right) => right.runnerSeconds - left.runnerSeconds,
  )[0];

  const matcherFor = (id: string): ((job: NormalizedJob) => boolean) => {
    if (input.definition === undefined) {
      return (job) => String(job.id) === id;
    }
    const declared = input.definition.jobs.find((entry) => entry.id === id);
    const displayName = declared?.displayName ?? id;
    const logical = deriveLogicalJobId(displayName).logicalJobId;
    return (job) => deriveLogicalJobId(job.apiName).logicalJobId === logical;
  };

  if (topCritical !== undefined) {
    candidates.push({
      targetId: topCritical.id,
      targetLabel: topCritical.label,
      onCriticalPath: true,
      matches: matcherFor(topCritical.id),
    });
  }
  if (topHotspot !== undefined) {
    candidates.push({
      targetId: topHotspot.id,
      targetLabel: topHotspot.label,
      onCriticalPath: false,
      matches: matcherFor(topHotspot.id),
    });
  }
  return candidates.slice(0, Math.max(0, input.maxScenarios));
}

/**
 * Estimate what a hypothetical speed-up of the dominant critical-path job and
 * the dominant parallel hotspot would do to wait time, runner consumption,
 * cost, and carbon.
 */
export function analyzeWhatIf(input: WhatIfInput): WhatIfAnalysis {
  const speedupPercent = Math.min(95, Math.max(1, input.speedupPercent));
  const factor = 1 - speedupPercent / 100;
  const candidates = selectCandidates(input);
  if (candidates.length === 0) {
    return {
      available: false,
      method: 'unavailable',
      results: [],
      disclaimer: DISCLAIMER,
    };
  }

  const definition = input.definition;
  const method: 'dag' | 'runner-only' =
    definition !== undefined && input.criticalPath.method === 'dag'
      ? 'dag'
      : 'runner-only';

  const beforeRunner = runnerSecondsOf(input.jobs);
  const beforeCost = input.estimateCost(input.jobs);
  const beforeCarbon = input.estimateCarbon(input.jobs);
  const beforeCriticalPath = input.criticalPath.totalSeconds;

  const results = candidates.map((candidate): WhatIfResult => {
    const jobs = applyScenario(input.jobs, candidate.matches, factor);
    const afterCost = input.estimateCost(jobs);
    const afterCarbon = input.estimateCarbon(jobs);
    const afterCriticalPath =
      method === 'dag' && definition !== undefined
        ? analyzeCriticalPath(buildWorkflowDag(definition, jobs), 0)
            .totalSeconds
        : undefined;

    return {
      scenarioId: `${candidate.onCriticalPath ? 'critical' : 'hotspot'}:${candidate.targetId}`,
      targetLabel: candidate.targetLabel,
      speedupPercent,
      onCriticalPath: candidate.onCriticalPath,
      method,
      criticalPathSeconds:
        afterCriticalPath === undefined
          ? undefined
          : delta(beforeCriticalPath, afterCriticalPath),
      runnerSeconds: delta(beforeRunner, runnerSecondsOf(jobs)),
      listPriceUsd: delta(
        beforeCost.grossListPriceUsd,
        afterCost.grossListPriceUsd,
      ),
      carbonP50Grams: delta(
        beforeCarbon.operationalCarbonGrams.p50,
        afterCarbon.operationalCarbonGrams.p50,
      ),
    };
  });

  return { available: true, method, results, disclaimer: DISCLAIMER };
}
