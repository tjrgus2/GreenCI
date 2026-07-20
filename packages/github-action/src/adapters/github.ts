import { getOctokit } from '@actions/github';
import { z } from 'zod';
import {
  ConclusionSchema,
  NormalizedJobSchema,
  WorkflowRunIdentitySchema,
  type Conclusion,
  type NormalizedJob,
  type NormalizedStep,
  type WorkflowRunIdentity,
} from '@greenci/core';

const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    base: z.object({ ref: z.string() }).passthrough(),
  })
  .passthrough();

const WorkflowRunSchema = z
  .object({
    id: z.number().int().nonnegative(),
    workflow_id: z.number().int().nonnegative(),
    run_attempt: z.number().int().positive().default(1),
    path: z.string().min(1),
    head_sha: z.string().min(1),
    head_branch: z.string().nullable(),
    event: z.string().min(1),
    repository: z
      .object({
        visibility: z.enum(['public', 'private', 'internal']),
      })
      .passthrough(),
    pull_requests: z.array(PullRequestSchema).default([]),
  })
  .passthrough();

const StepSchema = z
  .object({
    number: z.number().int().nonnegative(),
    name: z.string(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    conclusion: z.string().nullable(),
  })
  .passthrough();

const JobSchema = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string(),
    runner_name: z.string().nullable().optional(),
    labels: z.array(z.string()).default([]),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    conclusion: z.string().nullable(),
    steps: z.array(StepSchema).optional().default([]),
  })
  .passthrough();

const JobsSchema = z.array(JobSchema);

/** Minimal injected GitHub API boundary for current-run collection. */
export interface GitHubDataSource {
  getWorkflowRun(parameters: {
    owner: string;
    repository: string;
    runId: number;
  }): Promise<unknown>;
  listJobsForRunAttempt(parameters: {
    owner: string;
    repository: string;
    runId: number;
    runAttempt: number;
  }): Promise<unknown>;
}

/** Input identifying the current workflow run in GitHub. */
export interface CurrentRunReference {
  readonly owner: string;
  readonly repository: string;
  readonly runId: number;
  readonly runAttempt: number;
}

function normalizeConclusion(value: string | null): Conclusion {
  const parsed = ConclusionSchema.safeParse(value);
  return parsed.success ? parsed.data : 'unknown';
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replaceAll(/\s+/g, ' ');
}

function isRunnerInternal(name: string): boolean {
  const normalized = normalizeName(name);
  return (
    normalized === 'set up job' ||
    normalized === 'complete job' ||
    normalized.startsWith('post ')
  );
}

function classifyRunner(
  labels: readonly string[],
  runnerName: string | null,
): string {
  const haystack = [...labels, runnerName ?? '']
    .join(' ')
    .toLocaleLowerCase('en-US');
  if (haystack.includes('ubuntu') || haystack.includes('linux')) {
    return haystack.includes('arm64') ? 'linux-arm64' : 'linux-x64';
  }
  if (haystack.includes('windows')) {
    return haystack.includes('arm64') ? 'windows-arm64' : 'windows-x64';
  }
  if (haystack.includes('macos')) {
    return haystack.includes('arm64') ? 'macos-arm64' : 'macos-x64';
  }
  return 'unknown';
}

function normalizeStep(step: z.infer<typeof StepSchema>): NormalizedStep {
  return {
    index: step.number,
    name: step.name,
    normalizedName: normalizeName(step.name),
    ...(step.started_at === null ? {} : { startedAt: step.started_at }),
    ...(step.completed_at === null ? {} : { completedAt: step.completed_at }),
    conclusion: normalizeConclusion(step.conclusion),
    isRunnerInternal: isRunnerInternal(step.name),
  };
}

function normalizeJob(job: z.infer<typeof JobSchema>): NormalizedJob {
  return {
    id: job.id,
    apiName: job.name,
    runnerLabels: job.labels,
    runnerClass: classifyRunner(job.labels, job.runner_name ?? null),
    ...(job.started_at === null ? {} : { startedAt: job.started_at }),
    ...(job.completed_at === null ? {} : { completedAt: job.completed_at }),
    conclusion: normalizeConclusion(job.conclusion),
    steps: job.steps.map(normalizeStep),
  };
}

/** Validate unknown GitHub responses and convert them into core domain values. */
export function normalizeCurrentRun(
  rawRun: unknown,
  rawJobs: unknown,
  reference: CurrentRunReference,
): { identity: WorkflowRunIdentity; jobs: NormalizedJob[] } {
  const run = WorkflowRunSchema.parse(rawRun);
  const jobs = JobsSchema.parse(rawJobs);
  const pullRequest = run.pull_requests[0];

  const identity = WorkflowRunIdentitySchema.parse({
    owner: reference.owner,
    repository: reference.repository,
    workflowId: run.workflow_id,
    workflowPath: run.path,
    runId: run.id,
    runAttempt: run.run_attempt,
    headSha: run.head_sha,
    headBranch: run.head_branch ?? '',
    ...(pullRequest === undefined
      ? {}
      : {
          baseBranch: pullRequest.base.ref,
          pullRequestNumber: pullRequest.number,
        }),
    event: run.event,
    repositoryVisibility: run.repository.visibility,
  });
  return {
    identity,
    jobs: jobs.map((job) => NormalizedJobSchema.parse(normalizeJob(job))),
  };
}

/** Collect and normalize only the current run attempt. */
export async function collectCurrentRun(
  source: GitHubDataSource,
  reference: CurrentRunReference,
): Promise<{ identity: WorkflowRunIdentity; jobs: NormalizedJob[] }> {
  const [run, jobs] = await Promise.all([
    source.getWorkflowRun(reference),
    source.listJobsForRunAttempt(reference),
  ]);
  return normalizeCurrentRun(run, jobs, reference);
}

/** Create the production Octokit-backed data source. */
export function createGitHubDataSource(token: string): GitHubDataSource {
  const octokit = getOctokit(token);
  return {
    async getWorkflowRun(parameters) {
      const response = await octokit.rest.actions.getWorkflowRun({
        owner: parameters.owner,
        repo: parameters.repository,
        run_id: parameters.runId,
      });
      return response.data;
    },
    async listJobsForRunAttempt(parameters) {
      return octokit.paginate(
        octokit.rest.actions.listJobsForWorkflowRunAttempt,
        {
          owner: parameters.owner,
          repo: parameters.repository,
          run_id: parameters.runId,
          attempt_number: parameters.runAttempt,
          per_page: 100,
        },
      );
    },
  };
}
