import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const actionRoot = resolve(workspaceRoot, 'packages/github-action');
const distributionDirectory = resolve(actionRoot, 'dist');
if (
  !distributionDirectory.startsWith(`${actionRoot}\\`) &&
  !distributionDirectory.startsWith(`${actionRoot}/`)
) {
  throw new Error('Refusing to replace an unexpected distribution directory.');
}

rmSync(distributionDirectory, { recursive: true, force: true });
const nccCli = resolve(actionRoot, 'node_modules/@vercel/ncc/dist/ncc/cli.js');
execFileSync(
  process.execPath,
  [
    nccCli,
    'build',
    'src/entrypoint.ts',
    '-o',
    distributionDirectory,
    '--minify',
  ],
  { cwd: actionRoot, stdio: 'inherit' },
);
