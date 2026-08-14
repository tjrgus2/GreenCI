import { parse } from 'yaml';
import { z } from 'zod';
import type { AnalysisWarning } from '@greenci/core';
import { describeError, isNotFoundError } from '../adapters/errors.js';
import type { GitHubDataSource } from '../adapters/github.js';

/** Hard limit on the configuration file GreenCI is willing to decode. */
export const MAX_CONFIG_BYTES = 65_536;

const FileContentSchema = z
  .object({
    type: z.literal('file'),
    encoding: z.string(),
    size: z.number().int().nonnegative(),
    content: z.string(),
  })
  .passthrough();

/** Raw repository configuration plus any non-fatal collection warnings. */
export interface RepositoryConfigResult {
  readonly raw: unknown;
  readonly warnings: AnalysisWarning[];
}

/** Which configuration file to read, and at which immutable revision. */
export interface RepositoryConfigReference {
  readonly owner: string;
  readonly repository: string;
  readonly path: string;
  readonly ref: string;
}

function unavailable(message: string): RepositoryConfigResult {
  return {
    raw: undefined,
    warnings: [{ code: 'CONFIG_UNAVAILABLE', source: 'github-api', message }],
  };
}

/**
 * Read `.greenci.yml` through the API at the analyzed revision.
 *
 * The file is untrusted data: it is size-bounded, parsed with YAML aliases
 * disabled, and validated by the core configuration schema afterwards. It is
 * never executed and never interpolated into a command.
 */
export async function loadRepositoryConfig(
  source: GitHubDataSource,
  reference: RepositoryConfigReference,
): Promise<RepositoryConfigResult> {
  let raw: unknown;
  try {
    raw = await source.getFileContent(reference);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return { raw: undefined, warnings: [] };
    }
    return unavailable(
      `The GreenCI configuration file could not be read (${describeError(error)}); bundled defaults are used.`,
    );
  }

  const parsed = FileContentSchema.safeParse(raw);
  if (!parsed.success) {
    return unavailable(
      'The configuration path did not resolve to a regular file; bundled defaults are used.',
    );
  }
  if (parsed.data.size > MAX_CONFIG_BYTES) {
    return unavailable(
      `The GreenCI configuration file exceeds the ${MAX_CONFIG_BYTES}-byte limit; bundled defaults are used.`,
    );
  }
  if (parsed.data.encoding !== 'base64') {
    return unavailable(
      'The GreenCI configuration file used an unsupported content encoding; bundled defaults are used.',
    );
  }

  const decoded = Buffer.from(parsed.data.content, 'base64');
  if (decoded.byteLength > MAX_CONFIG_BYTES) {
    return unavailable(
      `The decoded GreenCI configuration exceeds the ${MAX_CONFIG_BYTES}-byte limit; bundled defaults are used.`,
    );
  }

  try {
    const document: unknown = parse(decoded.toString('utf8'), {
      maxAliasCount: 0,
      merge: false,
    });
    if (document === null || document === undefined) {
      return { raw: undefined, warnings: [] };
    }
    if (typeof document !== 'object' || Array.isArray(document)) {
      return {
        raw: undefined,
        warnings: [
          {
            code: 'CONFIG_INVALID',
            source: 'action',
            message:
              'The GreenCI configuration file did not contain a YAML mapping; bundled defaults are used.',
          },
        ],
      };
    }
    return { raw: document, warnings: [] };
  } catch (error: unknown) {
    return {
      raw: undefined,
      warnings: [
        {
          code: 'CONFIG_INVALID',
          source: 'action',
          message: `The GreenCI configuration file is not valid YAML (${describeError(error)}); bundled defaults are used.`,
        },
      ],
    };
  }
}
