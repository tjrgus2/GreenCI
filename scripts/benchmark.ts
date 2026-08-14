/**
 * Measure GreenCI's own analysis cost.
 *
 * The core engine performs no network access, so this measures exactly the work
 * GreenCI adds to a run once the GitHub API has answered. Synthetic workloads
 * are generated rather than fixtures so that the shapes named in the design
 * contract (10, 50, 100 jobs, matrix-heavy, 20 baselines) are all covered.
 *
 *   pnpm benchmark
 *   pnpm benchmark --json
 */
import { analyzeWorkflow, type AnalyzeWorkflowInput } from '@greenci/core';

const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function iso(offsetSeconds: number): string {
  return new Date(epoch + offsetSeconds * 1000).toISOString();
}

function job(
  id: number,
  apiName: string,
  startSeconds: number,
  durationSeconds: number,
  stepCount: number,
): AnalyzeWorkflowInput['jobs'][number] {
  const stepDuration = durationSeconds / Math.max(1, stepCount);
  return {
    id,
    apiName,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    createdAt: iso(Math.max(0, startSeconds - 3)),
    startedAt: iso(startSeconds),
    completedAt: iso(startSeconds + durationSeconds),
    conclusion: 'success',
    steps: Array.from({ length: stepCount }, (_, index) => ({
      index: index + 1,
      name: index === 0 ? 'npm ci' : `step ${index + 1}`,
      normalizedName: index === 0 ? 'npm ci' : `step ${index + 1}`,
      startedAt: iso(startSeconds + index * stepDuration),
      completedAt: iso(startSeconds + (index + 1) * stepDuration),
      conclusion: 'success' as const,
      isRunnerInternal: false,
    })),
  };
}

interface Workload {
  readonly name: string;
  readonly jobCount: number;
  readonly baselineRuns: number;
  readonly matrixVariants: number;
  readonly stepsPerJob: number;
}

const workloads: readonly Workload[] = [
  {
    name: '10 jobs, no baseline',
    jobCount: 10,
    baselineRuns: 0,
    matrixVariants: 1,
    stepsPerJob: 5,
  },
  {
    name: '10 jobs, 7 baselines',
    jobCount: 10,
    baselineRuns: 7,
    matrixVariants: 1,
    stepsPerJob: 5,
  },
  {
    name: '50 jobs, 7 baselines',
    jobCount: 50,
    baselineRuns: 7,
    matrixVariants: 1,
    stepsPerJob: 5,
  },
  {
    name: '50 jobs, 20 baselines',
    jobCount: 50,
    baselineRuns: 20,
    matrixVariants: 1,
    stepsPerJob: 5,
  },
  {
    name: '100 jobs, 20 baselines',
    jobCount: 100,
    baselineRuns: 20,
    matrixVariants: 1,
    stepsPerJob: 5,
  },
  {
    name: 'matrix-heavy: 100 jobs in 5 groups, 20 baselines',
    jobCount: 100,
    baselineRuns: 20,
    matrixVariants: 20,
    stepsPerJob: 8,
  },
];

function buildJobs(workload: Workload, jitterSeconds: number) {
  const groups = Math.max(
    1,
    Math.ceil(workload.jobCount / workload.matrixVariants),
  );
  return Array.from({ length: workload.jobCount }, (_, index) => {
    const group = Math.floor(index / workload.matrixVariants);
    const variant = index % workload.matrixVariants;
    const name =
      workload.matrixVariants > 1
        ? `Group ${group} (variant-${variant})`
        : `Job ${index}`;
    const start = (index % 4) * 15;
    const duration = 60 + ((index * 7) % 90) + jitterSeconds;
    void groups;
    return job(index + 1, name, start, duration, workload.stepsPerJob);
  });
}

function buildWorkflowDefinition(workload: Workload): unknown {
  const groups = Math.max(
    1,
    Math.ceil(workload.jobCount / workload.matrixVariants),
  );
  const jobs: Record<string, unknown> = {};
  for (let group = 0; group < groups; group += 1) {
    const id = workload.matrixVariants > 1 ? `group-${group}` : `job-${group}`;
    const displayName =
      workload.matrixVariants > 1 ? `Group ${group}` : `Job ${group}`;
    jobs[id] = {
      name: displayName,
      ...(group === 0
        ? {}
        : {
            needs: [
              workload.matrixVariants > 1
                ? `group-${group - 1}`
                : `job-${group - 1}`,
            ],
          }),
      ...(workload.matrixVariants > 1
        ? { strategy: { matrix: { variant: [1, 2] } } }
        : {}),
    };
  }
  return { jobs };
}

function buildInput(workload: Workload): AnalyzeWorkflowInput {
  return {
    identity: {
      owner: 'benchmark',
      repository: 'greenci',
      workflowId: 1,
      workflowPath: '.github/workflows/ci.yml',
      runId: 999,
      runAttempt: 1,
      headSha: 'a'.repeat(40),
      headBranch: 'feature',
      baseBranch: 'main',
      event: 'pull_request',
      pullRequestNumber: 1,
      repositoryVisibility: 'private',
    },
    jobs: buildJobs(workload, 0),
    generatedAt: iso(3600),
    warnings: [],
    workflowDefinition: buildWorkflowDefinition(workload),
    baseline: {
      available: workload.baselineRuns > 0,
      branch: 'main',
      samples: Array.from({ length: workload.baselineRuns }, (_, run) => ({
        runId: run + 1,
        runAttempt: 1,
        headSha: String(run).padStart(40, 'b'),
        jobs: buildJobs(workload, (run % 5) - 2),
      })),
    },
  };
}

interface Measurement {
  readonly workload: string;
  readonly jobs: number;
  readonly steps: number;
  readonly baselineRuns: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly peakHeapMb: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function measure(workload: Workload): Measurement {
  const input = buildInput(workload);
  // Warm up so the first measurement does not pay for lazy compilation.
  analyzeWorkflow(input);
  const durations: number[] = [];
  let peakHeap = 0;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const start = process.hrtime.bigint();
    const report = analyzeWorkflow(input);
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    if (report.jobs.length === 0) {
      throw new Error('benchmark produced an empty report');
    }
  }
  const steps = input.jobs.reduce(
    (total, entry) => total + entry.steps.length,
    0,
  );
  return {
    workload: workload.name,
    jobs: input.jobs.length,
    steps,
    baselineRuns: workload.baselineRuns,
    medianMs: Math.round(median(durations) * 100) / 100,
    minMs: Math.round(Math.min(...durations) * 100) / 100,
    maxMs: Math.round(Math.max(...durations) * 100) / 100,
    peakHeapMb: Math.round((peakHeap / 1024 / 1024) * 10) / 10,
  };
}

const measurements = workloads.map(measure);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
} else {
  const rows = [
    [
      'Workload',
      'Jobs',
      'Steps',
      'Baselines',
      'Median',
      'Min',
      'Max',
      'Peak heap',
    ],
    ...measurements.map((entry) => [
      entry.workload,
      String(entry.jobs),
      String(entry.steps),
      String(entry.baselineRuns),
      `${entry.medianMs.toFixed(2)} ms`,
      `${entry.minMs.toFixed(2)} ms`,
      `${entry.maxMs.toFixed(2)} ms`,
      `${entry.peakHeapMb.toFixed(1)} MB`,
    ]),
  ];
  const widths =
    rows[0]?.map((_, column) =>
      Math.max(...rows.map((row) => (row[column] ?? '').length)),
    ) ?? [];
  for (const row of rows) {
    process.stdout.write(
      `${row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ')}\n`,
    );
  }
  process.stdout.write(
    `\nNode ${process.version} on ${process.platform}/${process.arch}. ` +
      `Core analysis only; GitHub API latency is excluded.\n`,
  );
}
