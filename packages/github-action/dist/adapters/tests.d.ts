import { z } from 'zod';
import { TestReportSchema, type AnalysisWarning } from '@greenci/core';
import type { GitHubDataSource } from './github.js';
/** Hard limit on the compressed artifact GreenCI is willing to download. */
export declare const MAX_ARTIFACT_BYTES: number;
/** Parsed test results plus any non-fatal collection warnings. */
export interface TestReportCollection {
    readonly report: z.infer<typeof TestReportSchema> | undefined;
    readonly warnings: AnalysisWarning[];
}
/** Which artifact to analyze and under which limits. */
export interface TestReportRequest {
    readonly owner: string;
    readonly repository: string;
    readonly runId: number;
    readonly artifact: string;
    readonly maxUncompressedBytes: number;
    readonly maxFiles: number;
}
/**
 * Download and analyze one JUnit artifact.
 *
 * The archive is attacker-controlled in a fork pull request, so it is read
 * entirely in memory by the hardened ZIP reader and is never written to disk.
 * Every failure degrades to a warning instead of failing the GreenCI job.
 */
export declare function collectTestReport(source: GitHubDataSource, request: TestReportRequest): Promise<TestReportCollection>;
//# sourceMappingURL=tests.d.ts.map