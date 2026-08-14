import { mkdtemp, rm } from 'node:fs/promises';
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

async function replay(name: string) {
  const directory = await mkdtemp(join(tmpdir(), 'greenci-demo-test-'));
  temporaryDirectories.push(directory);
  return replayFixture(
    resolve(`fixtures/demo/${name}.json`),
    join(directory, 'report.json'),
  );
}

/**
 * The offline demonstration is the fallback for a network failure during
 * judging, so its committed fixtures must keep telling the same story.
 */
describe('offline demo fixtures', () => {
  it('reproduces the inefficient pipeline with a DAG critical path', async () => {
    const { report } = await replay('inefficient');
    expect(report.criticalPath.method).toBe('dag');
    expect(report.criticalPath.path.map((node) => node.label)).toEqual([
      'Build',
      'Unit test',
      'Integration test',
    ]);
    expect(
      report.criticalPath.nonCriticalHotspots.map((entry) => entry.label),
    ).toEqual(['Security']);
    expect(report.recommendations.map((entry) => entry.ruleId)).toEqual([
      'GCI-CACHE-001',
      'GCI-CRITICAL-001',
      'GCI-DUP-001',
      'GCI-MATRIX-001',
    ]);
  });

  it('contrasts a critical-path speed-up with a hotspot speed-up', async () => {
    const { report } = await replay('inefficient');
    const [critical, hotspot] = report.whatIf.results;
    expect(critical?.onCriticalPath).toBe(true);
    expect(hotspot?.onCriticalPath).toBe(false);
    // Shortening the critical path is the only way to shorten the wait.
    expect(critical?.criticalPathSeconds?.changePercent ?? 0).toBeLessThan(-10);
    expect(hotspot?.criticalPathSeconds?.changePercent).toBe(0);
    // The hotspot frees more runner time than the critical-path job does.
    expect(hotspot?.runnerSeconds.changePercent ?? 0).toBeLessThan(
      critical?.runnerSeconds.changePercent ?? 0,
    );
  });

  it('shows a measurable improvement in the optimized pipeline', async () => {
    const before = (await replay('inefficient')).report;
    const after = (await replay('optimized')).report;

    const improvement = (from: number, to: number): number =>
      ((to - from) / from) * 100;

    expect(
      improvement(
        before.current.wallClockSeconds,
        after.current.wallClockSeconds,
      ),
    ).toBeLessThan(-25);
    expect(
      improvement(before.current.runnerSeconds, after.current.runnerSeconds),
    ).toBeLessThan(-40);
    expect(
      improvement(
        before.cost?.grossListPriceUsd ?? 0,
        after.cost?.grossListPriceUsd ?? 0,
      ),
    ).toBeLessThan(-40);
    expect(
      improvement(
        before.carbon?.operationalCarbonGrams.p50 ?? 0,
        after.carbon?.operationalCarbonGrams.p50 ?? 0,
      ),
    ).toBeLessThan(-40);

    // Acting on the recommendations retires two of them.
    expect(after.recommendations.map((entry) => entry.ruleId)).toEqual([
      'GCI-CACHE-001',
      'GCI-CRITICAL-001',
    ]);
    expect(
      after.baseline.metrics.every(
        (metric) =>
          metric.verdict === 'improvement' || metric.verdict === 'stable',
      ),
    ).toBe(true);
  });

  it('replays byte-identically, so the demo cannot drift', async () => {
    const first = (await replay('optimized')).report;
    const second = (await replay('optimized')).report;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
