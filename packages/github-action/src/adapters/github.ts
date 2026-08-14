import { getOctokit } from '@actions/github';
import { z } from 'zod';
import {
  ConclusionSchema,
  NormalizedJobSchema,
  WorkflowRunIdentitySchema,
  type AnalysisWarning,
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
    pull_requests: z.array(PullRequestSchema).default([]),
  })
  .passthrough();

const RepositoryMetadataSchema = z
  .object({
    visibility: z.unknown().optional(),
    private: z.boolean().optional(),
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

/** Minimal injected GitHub API boundary used by every collection routine. */
export interface GitHubDataSource {
  getRepository(parameters: {
    owner: string;
    repository: string;
  }): Promise<unknown>;
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
  listSuccessfulRuns(parameters: {
    owner: string;
    repository: string;
    workflowId: number;
    branch: string;
    perPage: number;
  }): Promise<unknown>;
  getFileContent(parameters: {
    owner: string;
    repository: string;
    path: string;
    ref: string;
  }): Promise<unknown>;
  listIssueComments(parameters: {
    owner: string;
    repository: string;
    issueNumber: number;
  }): Promise<unknown>;
  createIssueComment(parameters: {
    owner: string;
    repository: string;
    issueNumber: number;
    body: string;
  }): Promise<unknown>;
  updateIssueComment(parameters: {
    owner: string;
    repository: string;
    commentId: number;
    body: string;
  }): Promise<unknown>;
  getAuthenticatedLogin(): Promise<string | undefined>;
}

/** Input identifying the current workflow run in GitHub. */
export interface CurrentRunReference {
  readonly owner: string;
  readonly repository: string;
  readonly runId: number;
  readonly runAttempt: number;
}

/** Canonical repository visibility plus non-fatal collection warnings. */
export interface RepositoryMetadataResult {
  readonly visibility: WorkflowRunIdentity['repositoryVisibility'];
  readonly warnings: AnalysisWarning[];
}

const visibilityWarning: AnalysisWarning = {
  code: 'REPOSITORY_VISIBILITY_UNKNOWN',
  source: 'github-api',
  message:
    'GitHub repository metadata did not contain a recognized visibility value; visibility is unknown.',
};

const metadataUnavailableWarning: AnalysisWarning = {
  code: 'REPOSITORY_METADATA_UNAVAILABLE',
  source: 'github-api',
  message:
    'GitHub repository metadata could not be retrieved; visibility is unknown.',
};

/** Normalize only canonical REST visibility; never infer it from `private`. */
export function normalizeRepositoryMetadata(
  rawRepository: unknown,
): RepositoryMetadataResult {
  const parsed = RepositoryMetadataSchema.safeParse(rawRepository);
  if (!parsed.success || typeof parsed.data.visibility !== 'string') {
    return { visibility: 'unknown', warnings: [visibilityWarning] };
  }
  const visibility = parsed.data.visibility.trim().toLocaleLowerCase('en-US');
  if (
    visibility === 'public' ||
    visibility === 'private' ||
    visibility === 'internal'
  ) {
    return { visibility, warnings: [] };
  }
  return { visibility: 'unknown', warnings: [visibilityWarning] };
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

/** Validate an unknown jobs payload and convert it into core domain values. */
export function normalizeJobs(rawJobs: unknown): NormalizedJob[] {
  return JobsSchema.parse(rawJobs).map((job) =>
    NormalizedJobSchema.parse(normalizeJob(job)),
  );
}

/** Validate unknown GitHub responses and convert them into core domain values. */
export function normalizeCurrentRun(
  rawRun: unknown,
  rawJobs: unknown,
  reference: CurrentRunReference,
  repositoryVisibility: WorkflowRunIdentity['repositoryVisibility'],
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
    repositoryVisibility,
  });
  return {
    identity,
    jobs: jobs.map((job) => NormalizedJobSchema.parse(normalizeJob(job))),
  };
}

/** Run tasks with a bounded concurrency so history collection stays polite. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (index >= items.length || item === undefined) {
          return;
        }
        results[index] = await task(item);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** Collect and normalize only the current run attempt. */
export async function collectCurrentRun(
  source: GitHubDataSource,
  reference: CurrentRunReference,
): Promise<{
  identity: WorkflowRunIdentity;
  jobs: NormalizedJob[];
  warnings: AnalysisWarning[];
}> {
  const repositoryMetadata = source
    .getRepository(reference)
    .then(normalizeRepositoryMetadata)
    .catch((): RepositoryMetadataResult => ({
      visibility: 'unknown',
      warnings: [metadataUnavailableWarning],
    }));
  const [run, jobs, repository] = await Promise.all([
    source.getWorkflowRun(reference),
    source.listJobsForRunAttempt(reference),
    repositoryMetadata,
  ]);
  return {
    ...normalizeCurrentRun(run, jobs, reference, repository.visibility),
    warnings: repository.warnings,
  };
}

/** Create the production Octokit-backed data source. */
export function createGitHubDataSource(token: string): GitHubDataSource {
  const octokit = getOctokit(token);
  return {
    async getRepository(parameters) {
      const response = await octokit.rest.repos.get({
        owner: parameters.owner,
        repo: parameters.repository,
      });
      return response.data;
    },
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
    async listSuccessfulRuns(parameters) {
      const response = await octokit.rest.actions.listWorkflowRuns({
        owner: parameters.owner,
        repo: parameters.repository,
        workflow_id: parameters.workflowId,
        branch: parameters.branch,
        status: 'success',
        exclude_pull_requests: true,
        per_page: parameters.perPage,
      });
      return response.data.workflow_runs;
    },
    async getFileContent(parameters) {
      const response = await octokit.rest.repos.getContent({
        owner: parameters.owner,
        repo: parameters.repository,
        path: parameters.path,
        ref: parameters.ref,
      });
      return response.data;
    },
    async listIssueComments(parameters) {
      return octokit.paginate(octokit.rest.issues.listComments, {
        owner: parameters.owner,
        repo: parameters.repository,
        issue_number: parameters.issueNumber,
        per_page: 100,
      });
    },
    async createIssueComment(parameters) {
      const response = await octokit.rest.issues.createComment({
        owner: parameters.owner,
        repo: parameters.repository,
        issue_number: parameters.issueNumber,
        body: parameters.body,
      });
      return response.data;
    },
    async updateIssueComment(parameters) {
      const response = await octokit.rest.issues.updateComment({
        owner: parameters.owner,
        repo: parameters.repository,
        comment_id: parameters.commentId,
        body: parameters.body,
      });
      return response.data;
    },
    async getAuthenticatedLogin() {
      try {
        const response = await octokit.rest.users.getAuthenticated();
        return response.data.login;
      } catch {
        return undefined;
      }
    },
  };
}
