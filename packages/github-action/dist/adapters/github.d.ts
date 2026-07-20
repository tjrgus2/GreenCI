import { type AnalysisWarning, type NormalizedJob, type WorkflowRunIdentity } from '@greenci/core';
/** Minimal injected GitHub API boundary for current-run collection. */
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
/** Normalize only canonical REST visibility; never infer it from `private`. */
export declare function normalizeRepositoryMetadata(rawRepository: unknown): RepositoryMetadataResult;
/** Validate unknown GitHub responses and convert them into core domain values. */
export declare function normalizeCurrentRun(rawRun: unknown, rawJobs: unknown, reference: CurrentRunReference, repositoryVisibility: WorkflowRunIdentity['repositoryVisibility']): {
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
};
/** Collect and normalize only the current run attempt. */
export declare function collectCurrentRun(source: GitHubDataSource, reference: CurrentRunReference): Promise<{
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
    warnings: AnalysisWarning[];
}>;
/** Create the production Octokit-backed data source. */
export declare function createGitHubDataSource(token: string): GitHubDataSource;
//# sourceMappingURL=github.d.ts.map