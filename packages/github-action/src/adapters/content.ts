import { z } from 'zod';
import { describeError, isNotFoundError } from './errors.js';
import type { GitHubDataSource } from './github.js';

const FileContentSchema = z
  .object({
    type: z.literal('file'),
    encoding: z.string(),
    size: z.number().int().nonnegative(),
    content: z.string(),
  })
  .passthrough();

/** Why a repository file could not be turned into text. */
export type FileProblem =
  | 'not-found'
  | 'unreadable'
  | 'not-a-file'
  | 'too-large'
  | 'unsupported-encoding';

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

function failure(problem: FileProblem, detail?: string): FileFetchResult {
  return { text: undefined, problem, detail };
}

/**
 * Read a repository file as UTF-8 text.
 *
 * The response is untrusted: the declared size, the encoding, and the decoded
 * byte length are all bounded before any string is produced.
 */
export async function fetchRepositoryFile(
  source: GitHubDataSource,
  reference: FileReference,
  maxBytes: number,
): Promise<FileFetchResult> {
  let raw: unknown;
  try {
    raw = await source.getFileContent(reference);
  } catch (error: unknown) {
    return isNotFoundError(error)
      ? failure('not-found')
      : failure('unreadable', describeError(error));
  }

  const parsed = FileContentSchema.safeParse(raw);
  if (!parsed.success) {
    return failure('not-a-file');
  }
  if (parsed.data.size > maxBytes) {
    return failure('too-large');
  }
  if (parsed.data.encoding !== 'base64') {
    return failure('unsupported-encoding');
  }
  const decoded = Buffer.from(parsed.data.content, 'base64');
  if (decoded.byteLength > maxBytes) {
    return failure('too-large');
  }
  return {
    text: decoded.toString('utf8'),
    problem: undefined,
    detail: undefined,
  };
}
