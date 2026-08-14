import { parse } from 'yaml';
import type { AnalysisWarning } from '@greenci/core';
import {
  fetchRepositoryFile,
  type FileReference,
} from '../adapters/content.js';
import type { GitHubDataSource } from '../adapters/github.js';

/** Hard limit on the configuration file GreenCI is willing to decode. */
export const MAX_CONFIG_BYTES = 65_536;

/** Raw repository configuration plus any non-fatal collection warnings. */
export interface RepositoryConfigResult {
  readonly raw: unknown;
  readonly warnings: AnalysisWarning[];
}

/** Which configuration file to read, and at which immutable revision. */
export type RepositoryConfigReference = FileReference;

function unavailable(message: string): RepositoryConfigResult {
  return {
    raw: undefined,
    warnings: [{ code: 'CONFIG_UNAVAILABLE', source: 'github-api', message }],
  };
}

/**
 * Parse untrusted YAML with aliases disabled so no repository can use an
 * expansion payload as an amplification vector.
 */
export function parseSafeYaml(text: string): unknown {
  return parse(text, { maxAliasCount: 0, merge: false });
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
  const file = await fetchRepositoryFile(source, reference, MAX_CONFIG_BYTES);
  if (file.problem === 'not-found') {
    return { raw: undefined, warnings: [] };
  }
  if (file.problem === 'unreadable') {
    return unavailable(
      `The GreenCI configuration file could not be read (${file.detail ?? 'unknown error'}); bundled defaults are used.`,
    );
  }
  if (file.problem === 'not-a-file') {
    return unavailable(
      'The configuration path did not resolve to a regular file; bundled defaults are used.',
    );
  }
  if (file.problem === 'too-large') {
    return unavailable(
      `The GreenCI configuration file exceeds the ${MAX_CONFIG_BYTES}-byte limit; bundled defaults are used.`,
    );
  }
  if (file.problem === 'unsupported-encoding' || file.text === undefined) {
    return unavailable(
      'The GreenCI configuration file used an unsupported content encoding; bundled defaults are used.',
    );
  }

  try {
    const document: unknown = parseSafeYaml(file.text);
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
  } catch {
    return {
      raw: undefined,
      warnings: [
        {
          code: 'CONFIG_INVALID',
          source: 'action',
          message:
            'The GreenCI configuration file is not valid YAML; bundled defaults are used.',
        },
      ],
    };
  }
}
