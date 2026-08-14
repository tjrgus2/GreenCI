import type { GitHubDataSource } from '../src/adapters/github.js';

/** Overridable stub of the GitHub boundary used across adapter tests. */
export function fakeSource(
  overrides: Partial<GitHubDataSource> = {},
): GitHubDataSource {
  return {
    async getRepository() {
      return { visibility: 'public' };
    },
    async getWorkflowRun() {
      return {
        id: 100,
        workflow_id: 200,
        run_attempt: 1,
        path: '.github/workflows/ci.yml',
        head_sha: 'abcdef',
        head_branch: 'feature',
        event: 'push',
        pull_requests: [],
      };
    },
    async listJobsForRunAttempt() {
      return [];
    },
    async listSuccessfulRuns() {
      return [];
    },
    async getFileContent() {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    },
    async listIssueComments() {
      return [];
    },
    async createIssueComment() {
      return { id: 1 };
    },
    async updateIssueComment() {
      return { id: 1 };
    },
    async getAuthenticatedLogin() {
      return undefined;
    },
    async listArtifacts() {
      return [];
    },
    async downloadArtifact() {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    },
    async downloadJobLogs() {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    },
    ...overrides,
  };
}

/** Build an HTTP-like error carrying a status, as Octokit does. */
export function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}
