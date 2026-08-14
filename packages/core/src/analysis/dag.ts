import { deriveLogicalJobId, type WorkflowEdge } from './shape.js';
import { z } from 'zod';
import type { NormalizedJob } from '../domain/schemas.js';

/** One job declared in the workflow definition. */
export const WorkflowDefinitionJobSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    needs: z.array(z.string().min(1)),
    hasMatrix: z.boolean(),
  })
  .strict();

/** The `needs` graph reconstructed from the workflow definition. */
export const WorkflowDefinitionSchema = z
  .object({
    path: z.string().min(1),
    jobs: z.array(WorkflowDefinitionJobSchema),
  })
  .strict();

export type WorkflowDefinitionJob = z.infer<typeof WorkflowDefinitionJobSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

const RawNeedsSchema = z.union([z.string(), z.array(z.string())]);

const RawJobSchema = z
  .object({
    name: z.string().optional(),
    needs: RawNeedsSchema.optional(),
    strategy: z
      .object({ matrix: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RawWorkflowSchema = z
  .object({ jobs: z.record(z.string(), RawJobSchema) })
  .passthrough();

/**
 * Convert an already-parsed workflow document into a `needs` graph.
 *
 * The document is untrusted data: it is validated, never executed, and any
 * shape GreenCI does not understand yields `undefined` rather than a guess.
 */
export function parseWorkflowDefinition(
  path: string,
  raw: unknown,
): WorkflowDefinition | undefined {
  const parsed = RawWorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const declared = Object.keys(parsed.data.jobs);
  const jobs = declared.map((id) => {
    const job = parsed.data.jobs[id];
    const needs = job?.needs;
    return {
      id,
      displayName: job?.name ?? id,
      needs: (typeof needs === 'string' ? [needs] : (needs ?? [])).filter(
        (dependency) => declared.includes(dependency),
      ),
      hasMatrix: job?.strategy?.matrix !== undefined,
    };
  });
  return WorkflowDefinitionSchema.parse({ path, jobs });
}

/** Declared `needs` edges, for the workflow-shape fingerprint. */
export function definitionEdges(
  definition: WorkflowDefinition,
): WorkflowEdge[] {
  return definition.jobs.flatMap((job) =>
    job.needs.map((dependency) => ({ from: dependency, to: job.id })),
  );
}

/** How confident GreenCI is that API jobs were mapped onto declared jobs. */
export type DagConfidence = 'high' | 'medium' | 'low';

/** One declared job together with the API jobs that executed it. */
export interface DagNode {
  readonly id: string;
  readonly label: string;
  readonly needs: readonly string[];
  readonly apiJobIds: readonly number[];
  readonly durationSeconds: number;
  readonly runnerSeconds: number;
  readonly matrixVariants: number;
}

/** The reconstructed graph plus the caveats that apply to it. */
export interface WorkflowDag {
  readonly nodes: readonly DagNode[];
  readonly confidence: DagConfidence;
  readonly reasons: readonly string[];
  readonly unmappedJobNames: readonly string[];
  readonly acyclic: boolean;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replaceAll(/\s+/g, ' ');
}

function isAcyclic(nodes: readonly DagNode[]): boolean {
  const remaining = new Map(nodes.map((node) => [node.id, [...node.needs]]));
  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const [id, needs] of [...remaining]) {
      if (needs.every((dependency) => !remaining.has(dependency))) {
        remaining.delete(id);
        progressed = true;
      }
    }
  }
  return remaining.size === 0;
}

/**
 * Map executed API jobs onto declared workflow jobs.
 *
 * GitHub renders a matrix job as `name (values)`, so the logical job id derived
 * from the API name is compared with the declared display name. Ambiguity
 * lowers confidence instead of inventing a mapping.
 */
export function buildWorkflowDag(
  definition: WorkflowDefinition,
  jobs: readonly NormalizedJob[],
): WorkflowDag {
  const reasons: string[] = [];
  const byLogicalName = new Map<string, WorkflowDefinitionJob[]>();
  for (const declared of definition.jobs) {
    const key = normalize(declared.displayName);
    byLogicalName.set(key, [...(byLogicalName.get(key) ?? []), declared]);
  }

  const assigned = new Map<string, NormalizedJob[]>();
  const unmappedJobNames: string[] = [];
  for (const job of jobs) {
    const key = deriveLogicalJobId(job.apiName).logicalJobId;
    const candidates = byLogicalName.get(key) ?? [];
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (target === undefined) {
      unmappedJobNames.push(job.apiName);
      continue;
    }
    assigned.set(target.id, [...(assigned.get(target.id) ?? []), job]);
  }

  const nodes: DagNode[] = definition.jobs
    .filter((declared) => (assigned.get(declared.id) ?? []).length > 0)
    .map((declared) => {
      const mapped = assigned.get(declared.id) ?? [];
      return {
        id: declared.id,
        label: declared.displayName,
        needs: declared.needs,
        apiJobIds: mapped.map((job) => job.id),
        // Dependents wait for every matrix variant, so the node finishes with
        // its slowest variant while consuming the sum of all of them.
        durationSeconds: mapped.reduce(
          (slowest, job) => Math.max(slowest, job.durationSeconds ?? 0),
          0,
        ),
        runnerSeconds: mapped.reduce(
          (total, job) => total + (job.durationSeconds ?? 0),
          0,
        ),
        matrixVariants: mapped.length,
      };
    })
    .map((node) => ({
      ...node,
      needs: node.needs.filter((dependency) =>
        definition.jobs.some((declared) => declared.id === dependency),
      ),
    }));

  const mappedIds = new Set(nodes.map((node) => node.id));
  const prunedNodes = nodes.map((node) => ({
    ...node,
    needs: node.needs.filter((dependency) => mappedIds.has(dependency)),
  }));

  if (unmappedJobNames.length > 0) {
    reasons.push('unmapped-api-jobs');
  }
  if (prunedNodes.some((node) => node.matrixVariants > 1)) {
    reasons.push('matrix-jobs-aggregated');
  }
  if (prunedNodes.length < definition.jobs.length) {
    reasons.push('declared-jobs-did-not-run');
  }

  const acyclic = isAcyclic(prunedNodes);
  if (!acyclic) {
    reasons.push('cycle-detected');
  }

  const confidence: DagConfidence =
    !acyclic || prunedNodes.length === 0
      ? 'low'
      : unmappedJobNames.length > 0
        ? 'medium'
        : prunedNodes.some((node) => node.matrixVariants > 1)
          ? 'medium'
          : 'high';

  return {
    nodes: prunedNodes,
    confidence,
    reasons,
    unmappedJobNames,
    acyclic,
  };
}
