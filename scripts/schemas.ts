/**
 * Generate the published JSON Schemas from the Zod contracts so that the
 * documented schema can never drift from the code that produces the report.
 *
 *   tsx scripts/schemas.ts write    regenerate schemas/*.json
 *   tsx scripts/schemas.ts verify   fail when a committed schema is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
  AnalysisReportSchema,
  GreenCIConfigFileSchema,
  REPORT_SCHEMA_VERSION,
} from '@greenci/core';

const workspaceRoot = resolve(import.meta.dirname, '..');

interface SchemaTarget {
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly schema: z.ZodType;
  /** `output` describes what GreenCI writes; `input` what a user may author. */
  readonly io: 'input' | 'output';
}

const targets: readonly SchemaTarget[] = [
  {
    path: 'schemas/report-v1.schema.json',
    id: 'https://greenci.dev/schemas/report-v1.schema.json',
    title: `GreenCI Report ${REPORT_SCHEMA_VERSION}`,
    schema: AnalysisReportSchema,
    io: 'output',
  },
  {
    path: 'schemas/config.schema.json',
    id: 'https://greenci.dev/schemas/config.schema.json',
    title: 'GreenCI Repository Configuration',
    schema: GreenCIConfigFileSchema,
    io: 'input',
  },
];

async function render(target: SchemaTarget): Promise<string> {
  const generated = z.toJSONSchema(target.schema, {
    target: 'draft-2020-12',
    io: target.io,
    unrepresentable: 'any',
  });
  const document = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: target.id,
    title: target.title,
    ...generated,
  };
  const absolute = resolve(workspaceRoot, target.path);
  const prettierConfig = await resolveConfig(absolute);
  return format(JSON.stringify(document), {
    ...prettierConfig,
    parser: 'json',
  });
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

const mode = process.argv[2];
const rendered = await Promise.all(
  targets.map(async (target) => ({
    target,
    absolute: resolve(workspaceRoot, target.path),
    contents: await render(target),
  })),
);

if (mode === 'write') {
  for (const entry of rendered) {
    writeFileSync(entry.absolute, entry.contents, 'utf8');
  }
  process.stdout.write('JSON Schemas regenerated from the Zod contracts.\n');
} else if (mode === 'verify') {
  const stale = rendered
    .filter((entry) => readIfPresent(entry.absolute) !== entry.contents)
    .map((entry) => entry.target.path);
  if (stale.length > 0) {
    throw new Error(
      `Committed JSON Schemas are stale: ${stale.join(', ')}. Run \`pnpm schemas:write\`.`,
    );
  }
  process.stdout.write('JSON Schemas match the Zod contracts.\n');
} else {
  throw new Error('Usage: tsx scripts/schemas.ts <write|verify>');
}
