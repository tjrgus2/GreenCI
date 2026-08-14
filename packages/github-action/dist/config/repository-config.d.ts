import type { AnalysisWarning } from '@greenci/core';
import { type FileReference } from '../adapters/content.js';
import type { GitHubDataSource } from '../adapters/github.js';
/** Hard limit on the configuration file GreenCI is willing to decode. */
export declare const MAX_CONFIG_BYTES = 65536;
/** Raw repository configuration plus any non-fatal collection warnings. */
export interface RepositoryConfigResult {
    readonly raw: unknown;
    readonly warnings: AnalysisWarning[];
}
/** Which configuration file to read, and at which immutable revision. */
export type RepositoryConfigReference = FileReference;
/**
 * Parse untrusted YAML with aliases disabled so no repository can use an
 * expansion payload as an amplification vector.
 */
export declare function parseSafeYaml(text: string): unknown;
/**
 * Read `.greenci.yml` through the API at the analyzed revision.
 *
 * The file is untrusted data: it is size-bounded, parsed with YAML aliases
 * disabled, and validated by the core configuration schema afterwards. It is
 * never executed and never interpolated into a command.
 */
export declare function loadRepositoryConfig(source: GitHubDataSource, reference: RepositoryConfigReference): Promise<RepositoryConfigResult>;
//# sourceMappingURL=repository-config.d.ts.map