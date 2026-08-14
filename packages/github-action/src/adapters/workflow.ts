import type { AnalysisWarning } from '@greenci/core';
import { fetchRepositoryFile } from './content.js';
import type { GitHubDataSource } from './github.js';
import { parseSafeYaml } from '../config/repository-config.js';

/** Hard limit on the workflow definition GreenCI is willing to decode. */
export const MAX_WORKFLOW_BYTES = 262_144;

/** The workflow definition as untrusted data, plus any collection warnings. */
export interface WorkflowDefinitionResult {
  readonly raw: unknown;
  readonly warnings: AnalysisWarning[];
}

function unavailable(message: string): WorkflowDefinitionResult {
  return {
    raw: undefined,
    warnings: [
      { code: 'WORKFLOW_DAG_UNAVAILABLE', source: 'github-api', message },
    ],
  };
}

/**
 * Read the exact workflow definition used by the analyzed run.
 *
 * The document is data only: it is size-bounded, parsed with YAML aliases
 * disabled, and converted into a `needs` graph by the pure core. Nothing in it
 * is ever executed or interpolated into a command.
 */
export async function loadWorkflowDefinition(
  source: GitHubDataSource,
  reference: {
    readonly owner: string;
    readonly repository: string;
    readonly path: string;
    readonly ref: string;
  },
): Promise<WorkflowDefinitionResult> {
  const file = await fetchRepositoryFile(source, reference, MAX_WORKFLOW_BYTES);
  if (file.text === undefined) {
    return unavailable(
      `The workflow definition could not be read (${file.problem ?? 'unknown reason'}); critical-path analysis falls back to interval overlap.`,
    );
  }
  try {
    const document: unknown = parseSafeYaml(file.text);
    if (
      typeof document !== 'object' ||
      document === null ||
      Array.isArray(document)
    ) {
      return unavailable(
        'The workflow definition was not a YAML mapping; critical-path analysis falls back to interval overlap.',
      );
    }
    return { raw: document, warnings: [] };
  } catch {
    return unavailable(
      'The workflow definition is not valid YAML; critical-path analysis falls back to interval overlap.',
    );
  }
}
