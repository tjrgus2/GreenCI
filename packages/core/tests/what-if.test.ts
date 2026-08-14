import { describe, expect, it } from 'vitest';
import { analyzeWorkflow } from '../src/analysis/analyze.js';
import { analyzeCriticalPath } from '../src/analysis/critical-path.js';
import {
  buildWorkflowDag,
  parseWorkflowDefinition,
} from '../src/analysis/dag.js';
import { analyzeRuntime } from '../src/analysis/runtime.js';
import { analyzeWhatIf } from '../src/analysis/what-if.js';
import type { NormalizedJob } from '../src/domain/schemas.js';
import { estimateCarbon } from '../src/estimation/carbon.js';
import { estimateCost } from '../src/estimation/cost.js';
import { DEFAULT_CONFIG } from '../src/domain/config.js';

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function job(
  id: number,
  apiName: string,
  start: number,
  duration: number,
): NormalizedJob {
  return {
    id,
    apiName,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: new Date(epoch + start * 1000).toISOString(),
    completedAt: new Date(epoch + (start + duration) * 1000).toISOString(),
    durationSeconds: duration,
    conclusion: 'success',
    steps: [
      {
        index: 1,
        name: 'work',
        normalizedName: 'work',
        startedAt: new Date(epoch + start * 1000).toISOString(),
        completedAt: new Date(epoch + (start + duration) * 1000).toISOString(),
        durationSeconds: duration,
        conclusion: 'success',
        isRunnerInternal: false,
      },
    ],
  };
}

// Build 60s -> Integration 240s on the critical path; a 3-way Security matrix
// consumes 300s of runner time in parallel without delaying anything.
const jobs: NormalizedJob[] = [
  job(1, 'Build', 0, 60),
  job(2, 'Integration test', 60, 240),
  job(3, 'Security (a)', 0, 100),
  job(4, 'Security (b)', 0, 100),
  job(5, 'Security (c)', 0, 100),
];

const definition = parseWorkflowDefinition('.github/workflows/ci.yml', {
  jobs: {
    build: { name: 'Build' },
    'integration-test': { name: 'Integration test', needs: ['build'] },
    security: { name: 'Security', strategy: { matrix: { rule: [1, 2, 3] } } },
  },
});

function analyze(overrides: Partial<Parameters<typeof analyzeWhatIf>[0]> = {}) {
  if (definition === undefined) {
    throw new Error('definition fixture failed to parse');
  }
  const criticalPath = analyzeCriticalPath(
    buildWorkflowDag(definition, jobs),
    analyzeRuntime(jobs).wallClockSeconds,
  );
  return analyzeWhatIf({
    jobs,
    definition,
    criticalPath,
    speedupPercent: 50,
    maxScenarios: 2,
    estimateCost: (candidates) =>
      estimateCost(candidates, { repositoryVisibility: 'private' }),
    estimateCarbon: (candidates) =>
      estimateCarbon({
        jobs: candidates,
        runId: 7,
        configHash: 'a'.repeat(64),
        region: 'KR',
        simulationSamples: 400,
        pue: DEFAULT_CONFIG.carbon.pue,
        utilization: DEFAULT_CONFIG.carbon.utilization,
        referenceYear: 2026,
      }),
    ...overrides,
  });
}

describe('counterfactual what-if engine', () => {
  const result = analyze();

  it('models the critical-path job and the parallel hotspot', () => {
    expect(result.available).toBe(true);
    expect(result.method).toBe('dag');
    expect(result.results.map((entry) => entry.targetLabel)).toEqual([
      'Integration test',
      'Security',
    ]);
    expect(result.results.map((entry) => entry.onCriticalPath)).toEqual([
      true,
      false,
    ]);
  });

  it('shortens the critical path only for the critical-path job', () => {
    const critical = result.results[0];
    const hotspot = result.results[1];
    expect(critical?.criticalPathSeconds?.before).toBe(300);
    expect(critical?.criticalPathSeconds?.after).toBe(180);
    expect(critical?.criticalPathSeconds?.changePercent).toBeCloseTo(-40, 5);
    // Halving the matrix frees runner time but nobody waits less.
    expect(hotspot?.criticalPathSeconds?.before).toBe(300);
    expect(hotspot?.criticalPathSeconds?.after).toBe(300);
    expect(hotspot?.criticalPathSeconds?.changePercent).toBe(0);
  });

  it('frees more runner time from the hotspot than from the critical path', () => {
    const critical = result.results[0];
    const hotspot = result.results[1];
    expect(critical?.runnerSeconds.before).toBe(600);
    expect(critical?.runnerSeconds.after).toBe(480);
    expect(hotspot?.runnerSeconds.after).toBe(450);
    expect(hotspot?.runnerSeconds.changePercent ?? 0).toBeLessThan(
      critical?.runnerSeconds.changePercent ?? 0,
    );
  });

  it('reduces cost and carbon without ever increasing them', () => {
    for (const entry of result.results) {
      expect(entry.listPriceUsd?.after ?? 0).toBeLessThanOrEqual(
        entry.listPriceUsd?.before ?? 0,
      );
      expect(entry.carbonP50Grams?.after ?? 0).toBeLessThanOrEqual(
        entry.carbonP50Grams?.before ?? 0,
      );
      expect(Number.isFinite(entry.carbonP50Grams?.changePercent ?? 0)).toBe(
        true,
      );
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(analyze())).toBe(JSON.stringify(analyze()));
  });

  it('never claims a measured saving', () => {
    expect(result.disclaimer).toContain('not measured savings');
    expect(result.disclaimer).toContain('Counterfactual');
  });

  it('clamps an out-of-range speed-up and honours the scenario limit', () => {
    expect(analyze({ speedupPercent: 500 }).results[0]?.speedupPercent).toBe(
      95,
    );
    expect(analyze({ speedupPercent: -5 }).results[0]?.speedupPercent).toBe(1);
    expect(analyze({ maxScenarios: 1 }).results).toHaveLength(1);
    expect(analyze({ maxScenarios: 0 }).available).toBe(false);
  });

  it('falls back to duration-derived metrics without a workflow graph', () => {
    const intervalCriticalPath = analyzeCriticalPath(
      buildWorkflowDag({ path: 'ci.yml', jobs: [] }, jobs),
      300,
    );
    const withoutGraph = analyze({
      definition: undefined,
      criticalPath: intervalCriticalPath,
    });
    expect(withoutGraph.available).toBe(false);
    expect(withoutGraph.method).toBe('unavailable');
  });

  it('reports unavailable when there is nothing to model', () => {
    const empty = analyzeWhatIf({
      jobs: [],
      definition: undefined,
      criticalPath: {
        method: 'unavailable',
        confidence: 'low',
        totalSeconds: 0,
        wallClockSharePercent: 0,
        path: [],
        nonCriticalHotspots: [],
        reasons: [],
      },
      speedupPercent: 50,
      maxScenarios: 2,
      estimateCost: (candidates) =>
        estimateCost(candidates, { repositoryVisibility: 'public' }),
      estimateCarbon: () => {
        throw new Error('must not estimate carbon with no scenario');
      },
    });
    expect(empty.available).toBe(false);
    expect(empty.results).toEqual([]);
  });
});

describe('what-if inside the full report', () => {
  const identity = {
    owner: 'owner',
    repository: 'repo',
    workflowId: 1,
    workflowPath: '.github/workflows/ci.yml',
    runId: 500,
    runAttempt: 1,
    headSha: 'abc',
    headBranch: 'feature',
    baseBranch: 'main',
    event: 'pull_request',
    pullRequestNumber: 2,
    repositoryVisibility: 'private' as const,
  };

  function report(config: Record<string, unknown> = {}) {
    return analyzeWorkflow({
      identity,
      jobs,
      generatedAt: '2026-08-14T00:10:00.000Z',
      workflowDefinition: {
        jobs: {
          build: { name: 'Build' },
          'integration-test': { name: 'Integration test', needs: ['build'] },
          security: {
            name: 'Security',
            strategy: { matrix: { rule: [1, 2, 3] } },
          },
        },
      },
      ...(Object.keys(config).length === 0 ? {} : { config }),
    });
  }

  it('is present, schema-valid, and contrasts the two scenarios', () => {
    const analysis = report();
    expect(analysis.whatIf.available).toBe(true);
    expect(analysis.whatIf.results).toHaveLength(2);
    expect(analysis.whatIf.results[0]?.onCriticalPath).toBe(true);
    expect(analysis.whatIf.results[1]?.onCriticalPath).toBe(false);
  });

  it('can be disabled', () => {
    const disabled = report({ analysis: { 'what-if': { enabled: false } } });
    expect(disabled.whatIf.available).toBe(false);
    expect(disabled.whatIf.method).toBe('unavailable');
    expect(disabled.whatIf.disclaimer).toContain('disabled');
  });

  it('honours a configured speed-up percentage', () => {
    const configured = report({
      analysis: { 'what-if': { 'speedup-percent': 25 } },
    });
    expect(configured.whatIf.results[0]?.speedupPercent).toBe(25);
  });
});
