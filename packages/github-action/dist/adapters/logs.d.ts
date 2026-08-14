import { DiagnosticsReportSchema, type AnalysisWarning, type Diagnostic, type FailureSummary } from '@greenci/core';
import type { z } from 'zod';
import { type GitHubDataSource } from './github.js';
/** Diagnostics plus the annotations that met the confidence threshold. */
export interface DiagnosticsCollection {
    readonly report: z.infer<typeof DiagnosticsReportSchema>;
    readonly annotations: readonly (Diagnostic & {
        readonly jobName: string;
    })[];
    readonly warnings: AnalysisWarning[];
}
/** Opt-in failed-log parsing configuration for one run. */
export interface DiagnosticsRequest {
    readonly owner: string;
    readonly repository: string;
    readonly enabled: boolean;
    readonly maxBytesPerJob: number;
    readonly maxJobs: number;
    readonly tailLines: number;
    readonly annotations: {
        readonly enabled: boolean;
        readonly maxCount: number;
        readonly minConfidence: number;
    };
}
/**
 * Parse a bounded tail of each failed job log, in memory only.
 *
 * Log parsing is opt-in. When enabled, only failed jobs are read, the number of
 * jobs and bytes is capped, nothing is persisted, and only sanitized,
 * credential-redacted diagnostics leave this function.
 */
export declare function collectDiagnostics(source: GitHubDataSource, failures: FailureSummary, request: DiagnosticsRequest): Promise<DiagnosticsCollection>;
//# sourceMappingURL=logs.d.ts.map