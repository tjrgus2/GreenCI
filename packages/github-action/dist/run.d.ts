import { type AnalysisReport } from '@greenci/core';
import { type GitHubDataSource } from './adapters/github.js';
/** Side effects supplied by the GitHub Actions entrypoint. */
export interface ActionIO {
    getInput(name: string): string;
    info(message: string): void;
    warning(message: string): void;
    setOutput(name: string, value: string | number): void;
    writeSummary(markdown: string): Promise<void>;
    uploadArtifact(name: string, files: readonly string[], rootDirectory: string): Promise<void>;
}
/** Environment values used to identify a GitHub Actions run. */
export interface ActionEnvironment {
    readonly GITHUB_REPOSITORY?: string;
    readonly GITHUB_RUN_ID?: string;
    readonly GITHUB_RUN_ATTEMPT?: string;
    readonly GITHUB_JOB?: string;
    readonly RUNNER_TEMP?: string;
}
/** Injected dependencies used to keep action orchestration testable. */
export interface ActionDependencies {
    readonly createSource: (token: string) => GitHubDataSource;
    readonly now: () => Date;
    readonly workingDirectory: string;
}
/** Execute the Week 1 current-run Action workflow. */
export declare function executeAction(io: ActionIO, environment: ActionEnvironment, dependencies: ActionDependencies): Promise<AnalysisReport>;
