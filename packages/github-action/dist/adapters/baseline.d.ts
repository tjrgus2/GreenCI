import { z } from 'zod';
import { BaselineRunSampleSchema, type AnalysisWarning } from '@greenci/core';
import { type GitHubDataSource } from './github.js';
/** Historical run collection may fail without failing the whole analysis. */
export interface BaselineCollection {
    readonly available: boolean;
    readonly branch: string | undefined;
    readonly samples: z.infer<typeof BaselineRunSampleSchema>[];
    readonly warnings: AnalysisWarning[];
}
/** Bounded concurrency for historical job requests, per the design contract. */
export declare const BASELINE_CONCURRENCY = 3;
/** Where the historical baseline should be collected from. */
export interface BaselineReference {
    readonly owner: string;
    readonly repository: string;
    readonly workflowId: number;
    readonly branch: string | undefined;
    readonly currentRunId: number;
    readonly maxRuns: number;
}
/**
 * Collect successful historical runs of the same workflow on the baseline
 * branch. Every failure degrades to an unavailable baseline with a structured
 * warning instead of failing the GreenCI job.
 */
export declare function collectBaseline(source: GitHubDataSource, reference: BaselineReference): Promise<BaselineCollection>;
//# sourceMappingURL=baseline.d.ts.map