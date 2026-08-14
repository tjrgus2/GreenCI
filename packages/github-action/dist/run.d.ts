import { type AnalysisReport, type ResolvedConfig, type WorkflowRunIdentity } from '@greenci/core';
import { type GitHubDataSource } from './adapters/github.js';
/** Side effects supplied by the GitHub Actions entrypoint. */
export interface ActionIO {
    getInput(name: string): string;
    info(message: string): void;
    warning(message: string): void;
    setOutput(name: string, value: string | number): void;
    setFailed(message: string): void;
    annotate(annotation: {
        readonly severity: 'error' | 'warning' | 'notice';
        readonly message: string;
        readonly file: string;
        readonly line: number;
        readonly column?: number | undefined;
    }): void;
    writeSummary(markdown: string): Promise<void>;
    uploadArtifact(name: string, files: readonly string[], rootDirectory: string): Promise<void>;
}
/** Environment values used to identify a GitHub Actions run. */
export interface ActionEnvironment {
    readonly GITHUB_REPOSITORY?: string;
    readonly GITHUB_RUN_ID?: string;
    readonly GITHUB_RUN_ATTEMPT?: string;
    readonly GITHUB_JOB?: string;
    readonly GITHUB_REF?: string;
    readonly GITHUB_BASE_REF?: string;
    readonly RUNNER_TEMP?: string;
}
/** Injected dependencies used to keep action orchestration testable. */
export interface ActionDependencies {
    readonly createSource: (token: string) => GitHubDataSource;
    readonly now: () => Date;
    readonly workingDirectory: string;
}
/**
 * Fill pull-request identity from the runner environment when the workflow-run
 * payload does not carry it, which happens for several pull-request triggers.
 */
export declare function withEventIdentity(identity: WorkflowRunIdentity, environment: ActionEnvironment): WorkflowRunIdentity;
/** Choose the branch whose successful runs form the baseline. */
export declare function resolveBaselineBranch(identity: WorkflowRunIdentity, config: ResolvedConfig): string | undefined;
/** Execute the GreenCI Action end to end. */
export declare function executeAction(io: ActionIO, environment: ActionEnvironment, dependencies: ActionDependencies): Promise<AnalysisReport>;
