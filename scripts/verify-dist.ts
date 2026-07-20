import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

function listFiles(directory: string, root = directory): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const absolute = join(directory, name);
      return statSync(absolute).isDirectory()
        ? listFiles(absolute, root)
        : [relative(root, absolute).split(sep).join('/')];
    })
    .sort();
}

function compareDirectories(expected: string, actual: string): void {
  const expectedFiles = listFiles(expected).filter(
    (file) => file !== '.tsbuildinfo',
  );
  const actualFiles = listFiles(actual).filter(
    (file) => file !== '.tsbuildinfo',
  );
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    throw new Error(
      `Distribution file list differs: expected ${expectedFiles.join(', ')}, regenerated ${actualFiles.join(', ')}`,
    );
  }
  for (const file of expectedFiles) {
    if (
      !readFileSync(join(expected, file)).equals(
        readFileSync(join(actual, file)),
      )
    ) {
      throw new Error(`Distribution bundle is stale: ${file}`);
    }
  }
}

const prefix = join(tmpdir(), 'greenci-dist-');
const temporaryDirectory = mkdtempSync(prefix);
if (!resolve(temporaryDirectory).startsWith(resolve(prefix))) {
  throw new Error('Refusing to use an unexpected temporary directory.');
}

try {
  const actionRoot = resolve('packages/github-action');
  const nccCli = resolve(
    actionRoot,
    'node_modules/@vercel/ncc/dist/ncc/cli.js',
  );
  execFileSync(
    process.execPath,
    [
      nccCli,
      'build',
      'src/entrypoint.ts',
      '-o',
      temporaryDirectory,
      '--minify',
    ],
    { cwd: actionRoot, stdio: 'inherit' },
  );
  compareDirectories(
    resolve('packages/github-action/dist'),
    temporaryDirectory,
  );
  process.stdout.write('Distribution bundle matches the committed files.\n');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
