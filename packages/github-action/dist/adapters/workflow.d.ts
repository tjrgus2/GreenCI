import type { AnalysisWarning } from '@greenci/core';
import type { GitHubDataSource } from './github.js';
/** Hard limit on the workflow definition GreenCI is willing to decode. */
export declare const MAX_WORKFLOW_BYTES = 262144;
/** The workflow definition as untrusted data, plus any collection warnings. */
export interface WorkflowDefinitionResult {
    readonly raw: unknown;
    readonly warnings: AnalysisWarning[];
}
/**
 * Read the exact workflow definition used by the analyzed run.
 *
 * The document is data only: it is size-bounded, parsed with YAML aliases
 * disabled, and converted into a `needs` graph by the pure core. Nothing in it
 * is ever executed or interpolated into a command.
 */
export declare function loadWorkflowDefinition(source: GitHubDataSource, reference: {
    readonly owner: string;
    readonly repository: string;
    readonly path: string;
    readonly ref: string;
}): Promise<WorkflowDefinitionResult>;
//# sourceMappingURL=workflow.d.ts.map