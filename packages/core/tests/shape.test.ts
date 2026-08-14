import { describe, expect, it } from 'vitest';
import {
  buildWorkflowShape,
  compareWorkflowShapes,
  deriveLogicalJobId,
  jaccard,
} from '../src/analysis/shape.js';
import type { NormalizedJob } from '../src/domain/schemas.js';

function job(
  name: string,
  steps: readonly string[] = ['install', 'run'],
  runnerClass = 'linux-x64',
): NormalizedJob {
  return {
    id: name.length,
    apiName: name,
    runnerLabels: ['ubuntu-latest'],
    runnerClass,
    startedAt: '2026-07-20T00:00:00.000Z',
    completedAt: '2026-07-20T00:01:00.000Z',
    durationSeconds: 60,
    conclusion: 'success',
    steps: steps.map((step, index) => ({
      index,
      name: step,
      normalizedName: step,
      conclusion: 'success' as const,
      isRunnerInternal: step === 'Set up job',
    })),
  };
}

const workflowPath = '.github/workflows/ci.yml';

describe('logical job identity', () => {
  it('splits a matrix job name from its signature', () => {
    expect(deriveLogicalJobId('Test (20, ubuntu-latest)')).toEqual({
      logicalJobId: 'test',
      matrixSignature: '20, ubuntu-latest',
    });
    expect(deriveLogicalJobId('Build')).toEqual({
      logicalJobId: 'build',
      matrixSignature: undefined,
    });
    expect(deriveLogicalJobId('(only-parens)')).toEqual({
      logicalJobId: '(only-parens)',
      matrixSignature: undefined,
    });
  });
});

describe('workflow shape fingerprint', () => {
  it('is stable for structurally identical runs and ignores runner-internal steps', () => {
    const left = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test')],
    });
    const right = buildWorkflowShape({
      workflowPath,
      jobs: [
        job('Test', ['Set up job', 'install', 'run']),
        job('Build', ['install', 'run', 'Set up job']),
      ],
    });
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(compareWorkflowShapes(left, right).similarity).toBe(1);
    expect(compareWorkflowShapes(left, right).exactMatch).toBe(true);
  });

  it('separates matrix variants and records them in the fingerprint', () => {
    const withMatrix = buildWorkflowShape({
      workflowPath,
      jobs: [job('Test (18)'), job('Test (20)')],
    });
    const withoutMatrix = buildWorkflowShape({
      workflowPath,
      jobs: [job('Test')],
    });
    expect(withMatrix.matrixKeys).toEqual(['test::18', 'test::20']);
    expect(withMatrix.fingerprint).not.toBe(withoutMatrix.fingerprint);
  });

  it('reports a high but not exact similarity for a partial change', () => {
    const before = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test'), job('Lint')],
    });
    const after = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test'), job('Lint'), job('Docs')],
    });
    const result = compareWorkflowShapes(after, before);
    expect(result.exactMatch).toBe(false);
    expect(result.similarity).toBeGreaterThan(0.6);
    expect(result.similarity).toBeLessThan(1);
  });

  it('falls below the comparison threshold when the workflow is rebuilt', () => {
    const before = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test')],
    });
    const after = buildWorkflowShape({
      workflowPath,
      jobs: [
        job('Build'),
        job('Unit test', ['setup', 'vitest']),
        job('Integration test', ['setup', 'docker']),
        job('Security scan', ['scan'], 'windows-x64'),
      ],
    });
    expect(compareWorkflowShapes(after, before).similarity).toBeLessThan(0.8);
  });

  it('penalizes a runner-class change on a shared job', () => {
    const linux = buildWorkflowShape({ workflowPath, jobs: [job('Build')] });
    const windows = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build', ['install', 'run'], 'windows-x64')],
    });
    const result = compareWorkflowShapes(linux, windows);
    expect(result.similarity).toBeCloseTo(0.8, 5);
  });

  it('only compares declared edges when both runs expose them', () => {
    const withEdges = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test')],
      edges: [{ from: 'build', to: 'test' }],
    });
    const withoutEdges = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test')],
    });
    expect(withEdges.edgesAvailable).toBe(true);
    expect(withoutEdges.edgesAvailable).toBe(false);
    expect(compareWorkflowShapes(withEdges, withoutEdges).similarity).toBe(1);

    const differentEdges = buildWorkflowShape({
      workflowPath,
      jobs: [job('Build'), job('Test')],
      edges: [{ from: 'test', to: 'build' }],
    });
    expect(
      compareWorkflowShapes(withEdges, differentEdges).similarity,
    ).toBeLessThan(1);
  });
});

describe('jaccard index', () => {
  it('treats two empty sets as identical and disjoint sets as different', () => {
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(['a'], [])).toBe(0);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 10);
  });
});
