import { isAbsolute, normalize, sep } from 'node:path';
import { z } from 'zod';

const BooleanInputSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const RepositoryRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const normalized = normalize(value);
    return (
      !isAbsolute(value) &&
      normalized !== '..' &&
      !normalized.startsWith(`..${sep}`)
    );
  }, 'Expected a repository-relative path without parent traversal');

const ActionInputsSchema = z
  .object({
    githubToken: z.string().min(1),
    configPath: RepositoryRelativePathSchema,
    locale: z.enum(['en', 'ko']),
    baselineRuns: z.coerce.number().int().min(3).max(20),
    parseFailureLogs: BooleanInputSchema,
    uploadReportArtifact: BooleanInputSchema,
  })
  .strict();

export type ActionInputs = z.infer<typeof ActionInputsSchema>;

/** Read and validate all declared Action inputs without exposing token values. */
export function parseActionInputs(
  getInput: (name: string) => string,
): ActionInputs {
  return ActionInputsSchema.parse({
    githubToken: getInput('github-token'),
    configPath: getInput('config-path') || '.greenci.yml',
    locale: getInput('locale') || 'en',
    baselineRuns: getInput('baseline-runs') || '7',
    parseFailureLogs: getInput('parse-failure-logs') || 'false',
    uploadReportArtifact: getInput('upload-report-artifact') || 'true',
  });
}
