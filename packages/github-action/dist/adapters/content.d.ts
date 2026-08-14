import type { GitHubDataSource } from './github.js';
/** Why a repository file could not be turned into text. */
export type FileProblem = 'not-found' | 'unreadable' | 'not-a-file' | 'too-large' | 'unsupported-encoding';
/** A repository file read through the API at an immutable revision. */
export interface FileFetchResult {
    readonly text: string | undefined;
    readonly problem: FileProblem | undefined;
    readonly detail: string | undefined;
}
/** Where to read a repository file from. */
export interface FileReference {
    readonly owner: string;
    readonly repository: string;
    readonly path: string;
    readonly ref: string;
}
/**
 * Read a repository file as UTF-8 text.
 *
 * The response is untrusted: the declared size, the encoding, and the decoded
 * byte length are all bounded before any string is produced.
 */
export declare function fetchRepositoryFile(source: GitHubDataSource, reference: FileReference, maxBytes: number): Promise<FileFetchResult>;
//# sourceMappingURL=content.d.ts.map