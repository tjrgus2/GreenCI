import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replayFixture } from '../src/replay.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.length = 0;
});

describe('fixture replay', () => {
  it('reproduces the parallel acceptance scenario offline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-cli-test-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'report.json');
    const result = await replayFixture(
      resolve('fixtures/workflow-runs/parallel.json'),
      outputPath,
    );
    expect(result.report.current.wallClockSeconds).toBe(480);
    expect(result.report.current.runnerSeconds).toBe(900);
    expect(result.report.parallelism.peakConcurrency).toBe(3);
    expect(result.report.parallelism.averageConcurrency).toBe(1.875);
    expect(result.report.jobs).toHaveLength(3);
    expect(await readFile(outputPath, 'utf8')).toContain(
      '"schemaVersion": "1.0.0"',
    );
  });
});
