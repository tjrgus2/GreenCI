/**
 * Generate a CycloneDX software bill of materials for the released Action.
 *
 * The subject is what actually ships: the production dependency closure of
 * `@greenci/github-action`, which is exactly what `ncc` bundles into
 * `packages/github-action/dist/index.js`.
 *
 * The document is deterministic — no timestamp and no random serial number
 * unless one is supplied — so the same commit always produces the same SBOM and
 * a reviewer can regenerate and diff it.
 *
 *   pnpm sbom:generate                          write to stdout
 *   pnpm sbom:generate --out <file>             write to a file
 *   pnpm sbom:generate --timestamp <iso8601>    include a build timestamp
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const workspaceRoot = resolve(import.meta.dirname, '..');

const ManifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    license: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
  })
  .loose();

interface Component {
  readonly name: string;
  readonly version: string;
  readonly license: string | undefined;
}

/**
 * Locate an installed package manifest by walking `node_modules` upwards from
 * the dependent, which matches how Node resolves at runtime and therefore what
 * the bundler actually inlines.
 */
function findManifest(
  name: string,
  fromDirectory: string,
): { path: string; directory: string } | undefined {
  let directory = fromDirectory;
  for (;;) {
    const candidate = resolve(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) {
      // pnpm links direct dependencies into `node_modules`, so the real path is
      // needed for the walk to continue into that package's own dependencies.
      const real = realpathSync(candidate);
      return { path: real, directory: dirname(real) };
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function readManifest(path: string): z.infer<typeof ManifestSchema> {
  return ManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Walk the production dependency closure of one package.
 *
 * Workspace packages are traversed but not recorded as components: they are not
 * third-party supply chain, they are this repository.
 */
function collectFrom(
  packageDirectory: string,
  into: Map<string, Component>,
  workspaceNames: ReadonlySet<string>,
  seen: Set<string>,
): void {
  const manifest = readManifest(resolve(packageDirectory, 'package.json'));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const found = findManifest(name, packageDirectory);
    if (found === undefined) {
      continue;
    }
    const dependency = readManifest(found.path);
    const key = `${dependency.name}@${dependency.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (!workspaceNames.has(dependency.name)) {
      into.set(key, {
        name: dependency.name,
        version: dependency.version,
        license: dependency.license,
      });
    }
    collectFrom(found.directory, into, workspaceNames, seen);
  }
}

function purlOf(component: {
  readonly name: string;
  readonly version: string;
}): string {
  const [scope, unscoped] = component.name.startsWith('@')
    ? component.name.split('/')
    : [undefined, component.name];
  const path =
    scope === undefined
      ? encodeURIComponent(unscoped ?? component.name)
      : `${encodeURIComponent(scope)}/${encodeURIComponent(unscoped ?? '')}`;
  return `pkg:npm/${path}@${component.version}`;
}

function rootManifest(): { name: string; version: string; license: string } {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
  );
  const manifest = parsed as {
    name?: unknown;
    version?: unknown;
    license?: unknown;
  };
  if (
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string' ||
    typeof manifest.license !== 'string'
  ) {
    throw new Error('Root package.json is missing name, version, or license.');
  }
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license,
  };
}

function productionComponents(): Component[] {
  const workspaceNames = new Set(
    ['packages/core', 'packages/github-action', 'packages/cli'].map(
      (path) => readManifest(resolve(workspaceRoot, path, 'package.json')).name,
    ),
  );
  const components = new Map<string, Component>();
  collectFrom(
    resolve(workspaceRoot, 'packages/github-action'),
    components,
    workspaceNames,
    new Set(),
  );
  return [...components.values()].sort((left, right) =>
    `${left.name}@${left.version}` < `${right.name}@${right.version}` ? -1 : 1,
  );
}

const root = rootManifest();
const components = productionComponents();

const timestampIndex = process.argv.indexOf('--timestamp');
const timestamp =
  timestampIndex === -1 ? undefined : process.argv[timestampIndex + 1];

// A deterministic serial number: the same dependency closure always yields the
// same document, so an SBOM can be regenerated and compared.
const serialNumber = `urn:uuid:${createHash('sha256')
  .update(
    `${root.name}@${root.version}|${components
      .map((component) => `${component.name}@${component.version}`)
      .join(',')}`,
  )
  .digest('hex')
  .slice(0, 32)
  .replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/u,
    (_match, a: string, b: string, c: string, d: string, e: string) =>
      `${a}-${b}-${c}-${d}-${e}`,
  )}`;

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber,
  version: 1,
  metadata: {
    ...(timestamp === undefined ? {} : { timestamp }),
    tools: [
      { vendor: 'GreenCI', name: 'scripts/sbom.ts', version: root.version },
    ],
    component: {
      type: 'application',
      'bom-ref': purlOf({ name: root.name, version: root.version }),
      name: root.name,
      version: root.version,
      description:
        'GreenCI GitHub Action distribution bundle (packages/github-action/dist/index.js)',
      licenses: [{ license: { id: root.license } }],
      purl: purlOf({ name: root.name, version: root.version }),
    },
  },
  components: components.map((component) => ({
    type: 'library',
    'bom-ref': purlOf(component),
    name: component.name,
    version: component.version,
    purl: purlOf(component),
    scope: 'required',
    ...(component.license === undefined
      ? {}
      : { licenses: [{ license: { id: component.license } }] }),
  })),
};

const document = `${JSON.stringify(bom, null, 2)}\n`;
const outIndex = process.argv.indexOf('--out');
if (outIndex === -1) {
  process.stdout.write(document);
} else {
  const target = process.argv[outIndex + 1];
  if (target === undefined) {
    throw new Error('--out requires a file path');
  }
  writeFileSync(resolve(target), document, 'utf8');
  process.stdout.write(
    `Wrote ${components.length} components to ${resolve(target)}\n`,
  );
}
