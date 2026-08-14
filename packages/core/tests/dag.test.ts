import { describe, expect, it } from 'vitest';
import {
  analyzeCriticalPath,
  analyzeIntervalCriticality,
} from '../src/analysis/critical-path.js';
import {
  buildWorkflowDag,
  definitionEdges,
  parseWorkflowDefinition,
} from '../src/analysis/dag.js';
import { analyzeFailures } from '../src/analysis/failures.js';
import { analyzeRuntime } from '../src/analysis/runtime.js';
import type { NormalizedJob } from '../src/domain/schemas.js';

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function job(
  id: number,
  name: string,
  startSeconds: number,
  durationSeconds: number,
  overrides: Partial<NormalizedJob> = {},
): NormalizedJob {
  return {
    id,
    apiName: name,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: new Date(epoch + startSeconds * 1000).toISOString(),
    completedAt: new Date(
      epoch + (startSeconds + durationSeconds) * 1000,
    ).toISOString(),
    durationSeconds,
    conclusion: 'success',
    steps: [],
    ...overrides,
  };
}

const serialWorkflow = {
  jobs: {
    build: { name: 'Build' },
    test: { name: 'Test', needs: 'build' },
    deploy: { name: 'Deploy', needs: ['test'] },
    lint: { name: 'Lint' },
  },
};

describe('workflow definition parsing', () => {
  it('reads names, needs, and matrix declarations', () => {
    const definition = parseWorkflowDefinition(
      '.github/workflows/ci.yml',
      serialWorkflow,
    );
    expect(definition?.jobs.map((entry) => entry.id)).toEqual([
      'build',
      'test',
      'deploy',
      'lint',
    ]);
    expect(definition?.jobs[1]?.needs).toEqual(['build']);
    expect(definition?.jobs[2]?.needs).toEqual(['test']);
    expect(definition?.jobs[3]?.needs).toEqual([]);
  });

  it('falls back to the job id when no display name is declared', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: { build: {}, test: { strategy: { matrix: { node: [18, 20] } } } },
    });
    expect(definition?.jobs[0]?.displayName).toBe('build');
    expect(definition?.jobs[1]?.hasMatrix).toBe(true);
  });

  it('drops a needs reference to a job that is not declared', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: { test: { needs: ['ghost'] } },
    });
    expect(definition?.jobs[0]?.needs).toEqual([]);
  });

  it('returns undefined for a document it does not understand', () => {
    expect(parseWorkflowDefinition('ci.yml', { on: 'push' })).toBeUndefined();
    expect(parseWorkflowDefinition('ci.yml', 'not a workflow')).toBeUndefined();
    expect(parseWorkflowDefinition('ci.yml', undefined)).toBeUndefined();
  });

  it('exposes declared edges for the shape fingerprint', () => {
    const definition = parseWorkflowDefinition('ci.yml', serialWorkflow);
    expect(definition && definitionEdges(definition)).toEqual([
      { from: 'build', to: 'test' },
      { from: 'test', to: 'deploy' },
    ]);
  });
});

describe('DAG mapping', () => {
  it('maps API jobs onto declared jobs with high confidence', () => {
    const definition = parseWorkflowDefinition('ci.yml', serialWorkflow);
    expect(definition).toBeDefined();
    if (definition === undefined) {
      return;
    }
    const dag = buildWorkflowDag(definition, [
      job(1, 'Build', 0, 60),
      job(2, 'Test', 60, 120),
      job(3, 'Deploy', 180, 30),
      job(4, 'Lint', 0, 20),
    ]);
    expect(dag.confidence).toBe('high');
    expect(dag.acyclic).toBe(true);
    expect(dag.unmappedJobNames).toEqual([]);
    expect(dag.nodes.map((node) => node.id)).toEqual([
      'build',
      'test',
      'deploy',
      'lint',
    ]);
  });

  it('aggregates matrix variants and lowers confidence', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: {
        test: { name: 'Test', strategy: { matrix: { node: [18, 20] } } },
      },
    });
    if (definition === undefined) {
      return;
    }
    const dag = buildWorkflowDag(definition, [
      job(1, 'Test (18)', 0, 60),
      job(2, 'Test (20)', 0, 90),
    ]);
    expect(dag.confidence).toBe('medium');
    expect(dag.reasons).toContain('matrix-jobs-aggregated');
    expect(dag.nodes[0]?.matrixVariants).toBe(2);
    expect(dag.nodes[0]?.durationSeconds).toBe(90);
    expect(dag.nodes[0]?.runnerSeconds).toBe(150);
  });

  it('lowers confidence when an API job cannot be mapped', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: { build: { name: 'Build' } },
    });
    if (definition === undefined) {
      return;
    }
    const dag = buildWorkflowDag(definition, [
      job(1, 'Build', 0, 60),
      job(2, 'Mystery', 0, 60),
    ]);
    expect(dag.confidence).toBe('medium');
    expect(dag.unmappedJobNames).toEqual(['Mystery']);
    expect(dag.reasons).toContain('unmapped-api-jobs');
  });

  it('refuses to map an ambiguous duplicate display name', () => {
    const definition = parseWorkflowDefinition('ci.yml', {
      jobs: { a: { name: 'Same' }, b: { name: 'Same' } },
    });
    if (definition === undefined) {
      return;
    }
    const dag = buildWorkflowDag(definition, [job(1, 'Same', 0, 60)]);
    expect(dag.nodes).toEqual([]);
    expect(dag.unmappedJobNames).toEqual(['Same']);
    expect(dag.confidence).toBe('low');
  });
});

describe('critical path', () => {
  const definition = parseWorkflowDefinition('ci.yml', serialWorkflow);

  it('finds the longest weighted path and separates parallel hotspots', () => {
    if (definition === undefined) {
      return;
    }
    const jobs = [
      job(1, 'Build', 0, 60),
      job(2, 'Test', 60, 120),
      job(3, 'Deploy', 180, 30),
      // Lint consumes the most runner time of any single job but nothing
      // depends on it, so it must not appear on the critical path.
      job(4, 'Lint', 0, 150),
    ];
    const dag = buildWorkflowDag(definition, jobs);
    const result = analyzeCriticalPath(
      dag,
      analyzeRuntime(jobs).wallClockSeconds,
    );
    expect(result.method).toBe('dag');
    expect(result.path.map((node) => node.id)).toEqual([
      'build',
      'test',
      'deploy',
    ]);
    expect(result.totalSeconds).toBe(210);
    expect(result.path[1]?.contributionPercent).toBeCloseTo(57.14, 1);
    // Lint is the single largest runner consumer but delays nobody.
    expect(result.nonCriticalHotspots.map((entry) => entry.id)).toEqual([
      'lint',
    ]);
    expect(result.nonCriticalHotspots[0]?.runnerSharePercent).toBeCloseTo(
      41.67,
      1,
    );
    expect(result.wallClockSharePercent).toBe(100);
  });

  it('reports unavailable for an empty or cyclic graph', () => {
    const cyclic = parseWorkflowDefinition('ci.yml', {
      jobs: { a: { needs: ['b'] }, b: { needs: ['a'] } },
    });
    if (cyclic === undefined) {
      return;
    }
    const dag = buildWorkflowDag(cyclic, [
      job(1, 'a', 0, 10),
      job(2, 'b', 0, 10),
    ]);
    expect(dag.acyclic).toBe(false);
    const result = analyzeCriticalPath(dag, 20);
    expect(result.method).toBe('unavailable');
    expect(result.reasons).toContain('cycle-detected');
  });
});

describe('interval fallback criticality', () => {
  it('ranks jobs by exclusive wall-clock occupancy and labels itself', () => {
    const jobs = [
      job(1, 'Build', 0, 60),
      job(2, 'Test', 0, 200),
      job(3, 'Lint', 0, 30),
    ];
    const result = analyzeIntervalCriticality(
      jobs,
      analyzeRuntime(jobs).wallClockSeconds,
    );
    expect(result.method).toBe('interval-fallback');
    expect(result.confidence).toBe('low');
    expect(result.reasons).toContain('interval-based-estimate');
    expect(result.path[0]?.label).toBe('Test');
    expect(result.path[0]?.durationSeconds).toBe(140);
  });

  it('reports unavailable when no job has usable timestamps', () => {
    const result = analyzeIntervalCriticality(
      [
        {
          ...job(1, 'Build', 0, 60),
          startedAt: undefined,
          completedAt: undefined,
        },
      ],
      0,
    );
    expect(result.method).toBe('unavailable');
    expect(result.reasons).toContain('no-job-intervals');
  });
});

describe('failure analysis', () => {
  it('identifies the failed job, failed step, and how late it landed', () => {
    const failing: NormalizedJob = {
      ...job(2, 'Test', 60, 120, { conclusion: 'failure' }),
      steps: [
        {
          index: 1,
          name: 'Install',
          normalizedName: 'install',
          startedAt: new Date(epoch + 60_000).toISOString(),
          completedAt: new Date(epoch + 90_000).toISOString(),
          durationSeconds: 30,
          conclusion: 'success',
          isRunnerInternal: false,
        },
        {
          index: 2,
          name: 'Integration tests',
          normalizedName: 'integration tests',
          startedAt: new Date(epoch + 90_000).toISOString(),
          completedAt: new Date(epoch + 180_000).toISOString(),
          durationSeconds: 90,
          conclusion: 'failure',
          isRunnerInternal: false,
        },
      ],
    };
    const summary = analyzeFailures([job(1, 'Build', 0, 60), failing]);
    expect(summary.failedJobCount).toBe(1);
    expect(summary.failures[0]?.failedStepName).toBe('Integration tests');
    expect(summary.failures[0]?.failedStepIndex).toBe(2);
    expect(summary.failures[0]?.secondsBeforeFailure).toBe(120);
    expect(summary.firstFailureWallClockPercent).toBe(100);
  });

  it('reports no failure for a healthy run', () => {
    const summary = analyzeFailures([job(1, 'Build', 0, 60)]);
    expect(summary.failedJobCount).toBe(0);
    expect(summary.firstFailureWallClockPercent).toBeUndefined();
  });

  it('handles a failed job without step detail', () => {
    const summary = analyzeFailures([
      job(1, 'Build', 0, 60, { conclusion: 'timed_out' }),
    ]);
    expect(summary.failures[0]?.conclusion).toBe('timed_out');
    expect(summary.failures[0]?.failedStepName).toBeUndefined();
    expect(summary.failures[0]?.secondsBeforeFailure).toBe(60);
  });
});
