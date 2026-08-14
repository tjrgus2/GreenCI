/**
 * Keep the canonical datasets in `data/`, the versioned provenance manifest,
 * and the embedded copy compiled into `@greenci/core` in lockstep.
 *
 *   tsx scripts/datasets.ts write    regenerate the manifest and embedded copy
 *   tsx scripts/datasets.ts verify   fail when either output is stale
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const workspaceRoot = resolve(import.meta.dirname, '..');

interface DatasetSource {
  readonly id: string;
  readonly file: string;
  readonly uncertainty: string;
}

const datasetSources: readonly DatasetSource[] = [
  {
    id: 'github-pricing',
    file: 'data/github-pricing.json',
    uncertainty:
      'List prices are exact as published, but actual invoices depend on included minutes, discounts, and organization billing agreements that GreenCI cannot observe.',
  },
  {
    id: 'runner-models',
    file: 'data/runner-models.json',
    uncertainty:
      'Idle power, peak power, and memory power are triangular ranges rather than point values because GitHub does not publish host hardware or utilization.',
  },
  {
    id: 'carbon-intensity',
    file: 'data/carbon-intensity.json',
    uncertainty:
      'Annual average grid intensity expressed as a triangular range; the marginal intensity at execution time and the exact data-center region are unknown.',
  },
];

const manifestPath = resolve(workspaceRoot, 'data/manifest.json');
const embeddedPath = resolve(
  workspaceRoot,
  'packages/core/src/datasets/generated.ts',
);

function readJson(relativePath: string): {
  readonly text: string;
  readonly value: unknown;
  readonly sha256: string;
} {
  const text = readFileSync(resolve(workspaceRoot, relativePath), 'utf8');
  return {
    text,
    value: JSON.parse(text) as unknown,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

function requireString(value: unknown, key: string): string {
  const record = value as Record<string, unknown>;
  const field = record[key];
  if (typeof field !== 'string') {
    throw new Error(`Dataset field ${key} must be a string.`);
  }
  return field;
}

function buildManifest(): unknown {
  return {
    schemaVersion: 1,
    datasets: datasetSources.map((source) => {
      const dataset = readJson(source.file);
      return {
        id: source.id,
        version: requireString(dataset.value, 'version'),
        path: source.file,
        source: requireString(dataset.value, 'source'),
        unit: requireString(dataset.value, 'unit'),
        uncertainty: source.uncertainty,
        effectiveDate: requireString(dataset.value, 'effectiveDate'),
        retrievedAt: requireString(dataset.value, 'retrievedAt'),
        licenseNote: requireString(dataset.value, 'licenseNote'),
        sha256: dataset.sha256,
      };
    }),
  };
}

function buildEmbeddedSource(manifest: unknown): string {
  const pricing = readJson('data/github-pricing.json').value;
  const runnerModels = readJson('data/runner-models.json').value;
  const carbonIntensity = readJson('data/carbon-intensity.json').value;
  return [
    '// GENERATED FILE. Do not edit by hand.',
    '// Source of truth: data/*.json. Regenerate with `pnpm data:write`.',
    '',
    `export const rawPricingDataset: unknown = ${JSON.stringify(pricing)};`,
    '',
    `export const rawRunnerModelDataset: unknown = ${JSON.stringify(runnerModels)};`,
    '',
    `export const rawCarbonIntensityDataset: unknown = ${JSON.stringify(carbonIntensity)};`,
    '',
    `export const rawDataManifest: unknown = ${JSON.stringify(manifest)};`,
    '',
  ].join('\n');
}

async function render(): Promise<{ manifest: string; embedded: string }> {
  const manifest = buildManifest();
  const manifestConfig = await resolveConfig(manifestPath);
  const embeddedConfig = await resolveConfig(embeddedPath);
  return {
    manifest: await format(JSON.stringify(manifest), {
      ...manifestConfig,
      parser: 'json',
    }),
    embedded: await format(buildEmbeddedSource(manifest), {
      ...embeddedConfig,
      parser: 'typescript',
    }),
  };
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

const mode = process.argv[2];
const rendered = await render();

if (mode === 'write') {
  writeFileSync(manifestPath, rendered.manifest, 'utf8');
  writeFileSync(embeddedPath, rendered.embedded, 'utf8');
  process.stdout.write('Dataset manifest and embedded copy regenerated.\n');
} else if (mode === 'verify') {
  const problems: string[] = [];
  if (readIfPresent(manifestPath) !== rendered.manifest) {
    problems.push('data/manifest.json is stale');
  }
  if (readIfPresent(embeddedPath) !== rendered.embedded) {
    problems.push('packages/core/src/datasets/generated.ts is stale');
  }
  if (problems.length > 0) {
    throw new Error(`${problems.join('; ')}. Run \`pnpm data:write\`.`);
  }
  process.stdout.write(
    'Dataset manifest and embedded copy match data/*.json.\n',
  );
} else {
  throw new Error('Usage: tsx scripts/datasets.ts <write|verify>');
}
