/**
 * Keep every published version number equal to `GREENCI_VERSION`.
 *
 * A report embeds the GreenCI version so a reader can reproduce it, so the
 * version cannot be allowed to differ between the engine and the manifests.
 *
 *   tsx scripts/versions.ts verify
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GREENCI_VERSION } from '@greenci/core';

const workspaceRoot = resolve(import.meta.dirname, '..');

const manifests = [
  'package.json',
  'packages/core/package.json',
  'packages/github-action/package.json',
  'packages/cli/package.json',
];

function manifestVersion(relativePath: string): string {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(workspaceRoot, relativePath), 'utf8'),
  );
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== 'string') {
    throw new Error(`${relativePath} has no string version field.`);
  }
  return version;
}

const mode = process.argv[2];
if (mode !== 'verify') {
  throw new Error('Usage: tsx scripts/versions.ts verify');
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(GREENCI_VERSION)) {
  throw new Error(`GREENCI_VERSION "${GREENCI_VERSION}" is not semantic.`);
}

const mismatched = manifests
  .map((path) => ({ path, version: manifestVersion(path) }))
  .filter((entry) => entry.version !== GREENCI_VERSION);

if (mismatched.length > 0) {
  throw new Error(
    `Version mismatch against GREENCI_VERSION ${GREENCI_VERSION}: ${mismatched
      .map((entry) => `${entry.path}=${entry.version}`)
      .join(', ')}`,
  );
}

process.stdout.write(
  `All manifests agree with GREENCI_VERSION ${GREENCI_VERSION}.\n`,
);
