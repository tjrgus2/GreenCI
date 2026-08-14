import type { NormalizedJob } from '../domain/schemas.js';
import { canonicalHash } from '../util/canonical.js';

/** A declared `needs` edge between two logical workflow jobs. */
export interface WorkflowEdge {
  readonly from: string;
  readonly to: string;
}

/** Structural description of one workflow run, free of timing or identity. */
export interface WorkflowShape {
  readonly workflowPath: string;
  readonly jobIds: readonly string[];
  readonly edges: readonly string[];
  readonly edgesAvailable: boolean;
  readonly stepKeys: readonly string[];
  readonly matrixKeys: readonly string[];
  readonly runnerClasses: readonly (readonly [string, string])[];
  readonly fingerprint: string;
}

/** Weights taken from the design contract for shape similarity. */
export const SHAPE_WEIGHTS = {
  jobIds: 0.35,
  edges: 0.25,
  stepKeys: 0.25,
  runnerClass: 0.15,
} as const;

function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replaceAll(/\s+/g, ' ');
}

/**
 * Split a GitHub job API name into its logical workflow job and its matrix
 * signature. GitHub renders matrix jobs as `name (value, value)`.
 */
export function deriveLogicalJobId(apiName: string): {
  logicalJobId: string;
  matrixSignature: string | undefined;
} {
  const match = /^(?<base>.*?)\s*\((?<matrix>[^()]*)\)\s*$/u.exec(apiName);
  const base = match?.groups?.['base'];
  const matrix = match?.groups?.['matrix'];
  if (base === undefined || matrix === undefined || base.length === 0) {
    return {
      logicalJobId: normalizeToken(apiName),
      matrixSignature: undefined,
    };
  }
  return {
    logicalJobId: normalizeToken(base),
    matrixSignature: normalizeToken(matrix),
  };
}

/** Attach derived logical job identity to a normalized job. */
export function withLogicalIdentity(job: NormalizedJob): NormalizedJob {
  const derived = deriveLogicalJobId(job.apiName);
  return {
    ...job,
    logicalJobId: derived.logicalJobId,
    ...(derived.matrixSignature === undefined
      ? {}
      : { matrixSignature: derived.matrixSignature }),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Build the structural fingerprint of a run. Timing, commit SHA, status, and
 * identifiers are deliberately excluded so that two structurally identical
 * runs share a fingerprint.
 */
export function buildWorkflowShape(input: {
  readonly workflowPath: string;
  readonly jobs: readonly NormalizedJob[];
  readonly edges?: readonly WorkflowEdge[] | undefined;
}): WorkflowShape {
  const identified = input.jobs.map(withLogicalIdentity);
  const jobIds = uniqueSorted(
    identified.map((job) => job.logicalJobId ?? normalizeToken(job.apiName)),
  );
  const stepKeys = uniqueSorted(
    identified.flatMap((job) =>
      job.steps
        .filter((step) => !step.isRunnerInternal)
        .map(
          (step) =>
            `${job.logicalJobId ?? ''}::${normalizeToken(step.normalizedName)}`,
        ),
    ),
  );
  const matrixKeys = uniqueSorted(
    identified
      .filter((job) => job.matrixSignature !== undefined)
      .map((job) => `${job.logicalJobId ?? ''}::${job.matrixSignature ?? ''}`),
  );
  const runnerMap = new Map<string, string>();
  for (const job of identified) {
    const key = job.logicalJobId ?? normalizeToken(job.apiName);
    if (!runnerMap.has(key)) {
      runnerMap.set(key, job.runnerClass);
    }
  }
  const runnerClasses = [...runnerMap.entries()].sort((left, right) =>
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
  );
  const edgeList = input.edges ?? [];
  const edges = uniqueSorted(
    edgeList.map(
      (edge) => `${normalizeToken(edge.from)}>${normalizeToken(edge.to)}`,
    ),
  );

  return {
    workflowPath: input.workflowPath,
    jobIds,
    edges,
    edgesAvailable: input.edges !== undefined,
    stepKeys,
    matrixKeys,
    runnerClasses,
    fingerprint: canonicalHash({
      workflowPath: input.workflowPath,
      jobIds,
      edges,
      stepKeys,
      matrixKeys,
      runnerClasses: runnerClasses.map(([job, runner]) => [job, runner]),
    }),
  };
}

/** Jaccard index treating two empty sets as identical. */
export function jaccard(
  left: readonly string[],
  right: readonly string[],
): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersection += 1;
    }
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function runnerClassMatch(left: WorkflowShape, right: WorkflowShape): number {
  const rightMap = new Map(
    right.runnerClasses.map(([job, runner]) => [job, runner]),
  );
  const shared = left.runnerClasses.filter(([job]) => rightMap.has(job));
  if (shared.length === 0) {
    return 1;
  }
  const matches = shared.filter(
    ([job, runner]) => rightMap.get(job) === runner,
  ).length;
  return matches / shared.length;
}

/** One weighted contribution to the overall shape similarity. */
export interface ShapeSimilarityComponent {
  readonly component: 'jobIds' | 'edges' | 'stepKeys' | 'runnerClass';
  readonly value: number;
  readonly weight: number;
  readonly available: boolean;
}

/** Weighted shape similarity plus the components that produced it. */
export interface ShapeSimilarity {
  readonly similarity: number;
  readonly exactMatch: boolean;
  readonly components: readonly ShapeSimilarityComponent[];
}

/**
 * Weighted similarity between two workflow shapes. Components that are not
 * observable on both sides are dropped and the remaining weights are
 * renormalized, so missing DAG data never fabricates a structural difference.
 */
export function compareWorkflowShapes(
  current: WorkflowShape,
  baseline: WorkflowShape,
): ShapeSimilarity {
  const edgesAvailable = current.edgesAvailable && baseline.edgesAvailable;
  const components: ShapeSimilarityComponent[] = [
    {
      component: 'jobIds',
      value: jaccard(current.jobIds, baseline.jobIds),
      weight: SHAPE_WEIGHTS.jobIds,
      available: true,
    },
    {
      component: 'edges',
      value: edgesAvailable ? jaccard(current.edges, baseline.edges) : 0,
      weight: SHAPE_WEIGHTS.edges,
      available: edgesAvailable,
    },
    {
      component: 'stepKeys',
      value: jaccard(current.stepKeys, baseline.stepKeys),
      weight: SHAPE_WEIGHTS.stepKeys,
      available: true,
    },
    {
      component: 'runnerClass',
      value: runnerClassMatch(current, baseline),
      weight: SHAPE_WEIGHTS.runnerClass,
      available: true,
    },
  ];

  const availableWeight = components
    .filter((entry) => entry.available)
    .reduce((total, entry) => total + entry.weight, 0);
  const weighted = components
    .filter((entry) => entry.available)
    .reduce((total, entry) => total + entry.weight * entry.value, 0);
  const similarity = availableWeight === 0 ? 0 : weighted / availableWeight;

  return {
    similarity: Math.min(1, Math.max(0, similarity)),
    exactMatch: current.fingerprint === baseline.fingerprint,
    components,
  };
}
