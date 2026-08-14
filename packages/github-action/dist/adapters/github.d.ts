import { type AnalysisWarning, type NormalizedJob, type WorkflowRunIdentity } from '@greenci/core';
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
    listArtifacts(parameters: {
        owner: string;
        repository: string;
        runId: number;
    }): Promise<unknown>;
    downloadArtifact(parameters: {
        owner: string;
        repository: string;
        artifactId: number;
    }): Promise<ArrayBuffer>;
    downloadJobLogs(parameters: {
        owner: string;
        repository: string;
        jobId: number;
    }): Promise<string>;
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
/** Validate an unknown jobs payload and convert it into core domain values. */
export declare function normalizeJobs(rawJobs: unknown): NormalizedJob[];
/** Validate unknown GitHub responses and convert them into core domain values. */
export declare function normalizeCurrentRun(rawRun: unknown, rawJobs: unknown, reference: CurrentRunReference, repositoryVisibility: WorkflowRunIdentity['repositoryVisibility']): {
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
};
/** Run tasks with a bounded concurrency so history collection stays polite. */
export declare function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]>;
/** Collect and normalize only the current run attempt. */
export declare function collectCurrentRun(source: GitHubDataSource, reference: CurrentRunReference): Promise<{
    identity: WorkflowRunIdentity;
    jobs: NormalizedJob[];
    warnings: AnalysisWarning[];
}>;
/** Create the production Octokit-backed data source. */
export declare function createGitHubDataSource(token: string): GitHubDataSource;
//# sourceMappingURL=github.d.ts.map