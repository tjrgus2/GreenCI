import { type NormalizedJob, type WorkflowRunIdentity } from '@greenci/core';
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
/** Validate unknown GitHub responses and convert them into core domain values. */
export declare function normalizeCurrentRun(rawRun: unknown, rawJobs: unknown, reference: CurrentRunReference): {
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
};
/** Collect and normalize only the current run attempt. */
export declare function collectCurrentRun(source: GitHubDataSource, reference: CurrentRunReference): Promise<{
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
}>;
/** Create the production Octokit-backed data source. */
export declare function createGitHubDataSource(token: string): GitHubDataSource;
//# sourceMappingURL=github.d.ts.map