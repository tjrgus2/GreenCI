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
      '"schemaVersion": "1.2.0"',
    );
  });

  it('reproduces a baseline regression offline and deterministically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-cli-test-'));
    temporaryDirectories.push(directory);
    const fixture = resolve('fixtures/workflow-runs/baseline-regression.json');
    const first = await replayFixture(fixture, join(directory, 'a.json'));
    const second = await replayFixture(fixture, join(directory, 'b.json'));
    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));

    expect(first.report.baseline.status).toBe('ready');
    expect(first.report.baseline.sampleCount).toBe(5);
    expect(first.report.baseline.shapeSimilarity).toBe(1);
    const runnerTime = first.report.baseline.metrics.find(
      (metric) => metric.metric === 'runner-seconds',
    );
    expect(runnerTime?.baselineMedian).toBe(160);
    expect(runnerTime?.verdict).toBe('regression');
    expect(first.report.baseline.jobComparisons[0]?.label).toBe('Test');
    const carbon = first.report.carbon;
    expect(carbon?.region).toBe('KR');
    expect(carbon?.operationalCarbonGrams.p05).toBeLessThanOrEqual(
      carbon?.operationalCarbonGrams.p50 ?? 0,
    );
    expect(first.markdown).toContain('Top regressions');
  });

  it('preserves unknown repository visibility and its structured warning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenci-cli-test-'));
    temporaryDirectories.push(directory);
    const result = await replayFixture(
      resolve('fixtures/workflow-runs/repository-visibility-unknown.json'),
      join(directory, 'report.json'),
    );
    expect(result.report.identity.repositoryVisibility).toBe('unknown');
    expect(result.report.warnings[0]?.code).toBe(
      'REPOSITORY_METADATA_UNAVAILABLE',
    );
    expect(result.report.current.runnerSeconds).toBe(60);
  });
});
