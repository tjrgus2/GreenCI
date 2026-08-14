/**
 * Reproduce the competition before/after demonstration entirely offline.
 *
 * The fixtures mirror the structure and durations of the live validation runs in
 * `tjrgus2/greenci-demo`, so the same story can be shown when GitHub is
 * unreachable. Nothing here touches the network.
 *
 *   pnpm demo                    replay both fixtures and print the comparison
 *   pnpm demo -- --write-fixtures  regenerate the committed demo fixtures
 *   pnpm demo -- --out <dir>       also write the two JSON reports
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeWorkflow,
  formatDuration,
  formatGrams,
  formatSignedPercent,
  formatUsd,
  type AnalysisReport,
} from '@greenci/core';

const workspaceRoot = resolve(import.meta.dirname, '..');
const epoch = Date.parse('2026-08-14T00:00:00.000Z');

function iso(offsetSeconds: number): string {
  return new Date(epoch + offsetSeconds * 1000).toISOString();
}

interface StepSpec {
  readonly name: string;
  readonly seconds: number;
}

interface JobSpec {
  readonly id: number;
  readonly apiName: string;
  readonly start: number;
  readonly steps: readonly StepSpec[];
}

function job(spec: JobSpec): unknown {
  const duration = spec.steps.reduce((total, step) => total + step.seconds, 0);
  let cursor = spec.start;
  const steps = spec.steps.map((step, index) => {
    const startedAt = iso(cursor);
    cursor += step.seconds;
    return {
      index: index + 1,
      name: step.name,
      normalizedName: step.name.toLocaleLowerCase('en-US'),
      startedAt,
      completedAt: iso(cursor),
      conclusion: 'success' as const,
      isRunnerInternal: false,
    };
  });
  return {
    id: spec.id,
    apiName: spec.apiName,
    runnerLabels: ['ubuntu-latest'],
    runnerClass: 'linux-x64',
    startedAt: iso(spec.start),
    completedAt: iso(spec.start + duration),
    conclusion: 'success',
    steps,
  };
}

/**
 * The inefficient pipeline: three jobs install dependencies from scratch, and a
 * three-way security matrix runs in parallel without gating anything.
 */
function inefficientJobs(jitter: number): unknown[] {
  const install = 25 + jitter;
  return [
    job({
      id: 1,
      apiName: 'Build',
      start: 0,
      steps: [
        { name: 'npm ci', seconds: install },
        { name: 'npm run build', seconds: 13 },
      ],
    }),
    job({
      id: 2,
      apiName: 'Unit test',
      start: 38 + jitter,
      steps: [
        { name: 'npm ci', seconds: install },
        { name: 'npm test', seconds: 18 },
      ],
    }),
    job({
      id: 3,
      apiName: 'Integration test',
      start: 81 + jitter * 2,
      steps: [
        { name: 'npm ci', seconds: install },
        { name: 'Run integration tests', seconds: 48 },
      ],
    }),
    ...['secrets', 'dependencies', 'sast'].map((rule, index) =>
      job({
        id: 4 + index,
        apiName: `Security (${rule})`,
        start: 0,
        steps: [{ name: 'Scan', seconds: 42 + jitter }],
      }),
    ),
  ];
}

/**
 * The optimized pipeline: the cache populated by `Build` hits downstream, and
 * the full security matrix moves off pull requests.
 */
function optimizedJobs(): unknown[] {
  return [
    job({
      id: 1,
      apiName: 'Build',
      start: 0,
      steps: [
        { name: 'npm ci', seconds: 25 },
        { name: 'npm run build', seconds: 13 },
      ],
    }),
    job({
      id: 2,
      apiName: 'Unit test',
      start: 38,
      steps: [
        { name: 'npm ci', seconds: 2 },
        { name: 'npm test', seconds: 18 },
      ],
    }),
    job({
      id: 3,
      apiName: 'Integration test',
      start: 58,
      steps: [
        { name: 'npm ci', seconds: 2 },
        { name: 'Run integration tests', seconds: 48 },
      ],
    }),
    job({
      id: 4,
      apiName: 'Security (secrets)',
      start: 0,
      steps: [{ name: 'Scan', seconds: 43 }],
    }),
  ];
}

const workflowDefinition = {
  jobs: {
    build: { name: 'Build' },
    'unit-test': { name: 'Unit test', needs: ['build'] },
    'integration-test': { name: 'Integration test', needs: ['unit-test'] },
    security: {
      name: 'Security',
      strategy: { matrix: { rule: ['secrets', 'dependencies', 'sast'] } },
    },
  },
};

const config = {
  version: 1,
  carbon: { region: 'KR', 'simulation-samples': 2000 },
  analysis: {
    'critical-path': { enabled: true, 'parse-workflow-dag': true },
    'what-if': { enabled: true, 'speedup-percent': 50 },
  },
  policy: {
    'default-mode': 'warn',
    rules: [
      {
        metric: 'runner-time-regression-percent',
        operator: 'greater-than',
        value: 20,
        mode: 'warn',
      },
    ],
  },
};

function baselineSamples(): unknown[] {
  return [0, 1, -1, 2].map((jitter, index) => ({
    runId: 900_001 + index,
    runAttempt: 1,
    headSha: String(index).padStart(40, 'c'),
    jobs: inefficientJobs(jitter),
  }));
}

function fixture(current: unknown[], runId: number): unknown {
  return {
    identity: {
      owner: 'greenci',
      repository: 'demo',
      workflowId: 4242,
      workflowPath: '.github/workflows/greenci-intelligence.yml',
      runId,
      runAttempt: 1,
      headSha: String(runId).padStart(40, 'd'),
      headBranch: runId === 910_000 ? 'main' : 'optimize-ci',
      baseBranch: 'main',
      event: 'pull_request',
      pullRequestNumber: runId === 910_000 ? 1 : 3,
      repositoryVisibility: 'private',
    },
    generatedAt: iso(1800),
    config,
    workflowDefinition,
    jobs: current,
    baseline: {
      available: true,
      branch: 'main',
      samples: baselineSamples(),
    },
  };
}

const fixturePaths = {
  before: 'fixtures/demo/inefficient.json',
  after: 'fixtures/demo/optimized.json',
} as const;

function writeFixtures(): void {
  mkdirSync(resolve(workspaceRoot, 'fixtures/demo'), { recursive: true });
  writeFileSync(
    resolve(workspaceRoot, fixturePaths.before),
    `${JSON.stringify(fixture(inefficientJobs(0), 910_000), null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(workspaceRoot, fixturePaths.after),
    `${JSON.stringify(fixture(optimizedJobs(), 920_000), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write('Demo fixtures regenerated.\n');
}

function replay(relativePath: string): AnalysisReport {
  const raw: unknown = JSON.parse(
    readFileSync(resolve(workspaceRoot, relativePath), 'utf8'),
  );
  return analyzeWorkflow(raw);
}

function change(before: number, after: number): string {
  return formatSignedPercent(
    before > 0 ? ((after - before) / before) * 100 : 0,
  );
}

function comparisonTable(
  before: AnalysisReport,
  after: AnalysisReport,
): string[][] {
  return [
    ['Metric', 'Before', 'After', 'Change'],
    [
      'Wall-clock time',
      formatDuration(before.current.wallClockSeconds),
      formatDuration(after.current.wallClockSeconds),
      change(before.current.wallClockSeconds, after.current.wallClockSeconds),
    ],
    [
      'Runner time',
      formatDuration(before.current.runnerSeconds),
      formatDuration(after.current.runnerSeconds),
      change(before.current.runnerSeconds, after.current.runnerSeconds),
    ],
    [
      'Critical path',
      formatDuration(before.criticalPath.totalSeconds),
      formatDuration(after.criticalPath.totalSeconds),
      change(before.criticalPath.totalSeconds, after.criticalPath.totalSeconds),
    ],
    [
      'List-price equivalent',
      formatUsd(before.cost?.grossListPriceUsd),
      formatUsd(after.cost?.grossListPriceUsd),
      change(
        before.cost?.grossListPriceUsd ?? 0,
        after.cost?.grossListPriceUsd ?? 0,
      ),
    ],
    [
      'Carbon p50',
      formatGrams(before.carbon?.operationalCarbonGrams.p50),
      formatGrams(after.carbon?.operationalCarbonGrams.p50),
      change(
        before.carbon?.operationalCarbonGrams.p50 ?? 0,
        after.carbon?.operationalCarbonGrams.p50 ?? 0,
      ),
    ],
    [
      'Recommendations',
      String(before.recommendations.length),
      String(after.recommendations.length),
      '—',
    ],
    ['Policy', before.policy.conclusion, after.policy.conclusion, '—'],
  ];
}

function printTable(rows: readonly (readonly string[])[]): void {
  const widths =
    rows[0]?.map((_, column) =>
      Math.max(...rows.map((row) => (row[column] ?? '').length)),
    ) ?? [];
  for (const row of rows) {
    process.stdout.write(
      `${row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ')}\n`,
    );
  }
}

if (process.argv.includes('--write-fixtures')) {
  writeFixtures();
} else {
  const before = replay(fixturePaths.before);
  const after = replay(fixturePaths.after);

  process.stdout.write('GreenCI offline before/after demonstration\n');
  process.stdout.write(
    `GreenCI ${before.greenciVersion} · report schema ${before.schemaVersion}\n\n`,
  );
  printTable(comparisonTable(before, after));

  process.stdout.write('\nBefore — critical path and hotspot\n');
  process.stdout.write(
    `  path: ${before.criticalPath.path.map((node) => `${node.label} ${Math.round(node.durationSeconds)}s`).join(' -> ')}\n`,
  );
  for (const hotspot of before.criticalPath.nonCriticalHotspots) {
    process.stdout.write(
      `  non-critical hotspot: ${hotspot.label} ${Math.round(hotspot.runnerSeconds)}s ` +
        `(${hotspot.runnerSharePercent.toFixed(1)}% of runner time)\n`,
    );
  }

  process.stdout.write('\nBefore — recommendations\n');
  for (const recommendation of before.recommendations) {
    process.stdout.write(
      `  ${recommendation.ruleId} ${recommendation.title}\n`,
    );
  }
  process.stdout.write('\nAfter — recommendations\n');
  for (const recommendation of after.recommendations) {
    process.stdout.write(
      `  ${recommendation.ruleId} ${recommendation.title}\n`,
    );
  }

  process.stdout.write('\nBefore — counterfactual estimates\n');
  for (const result of before.whatIf.results) {
    process.stdout.write(
      `  ${result.targetLabel} -${result.speedupPercent}% ` +
        `(${result.onCriticalPath ? 'on' : 'off'} critical path): ` +
        `critical path ${result.criticalPathSeconds === undefined ? 'n/a' : formatSignedPercent(result.criticalPathSeconds.changePercent)}, ` +
        `runner ${formatSignedPercent(result.runnerSeconds.changePercent)}, ` +
        `carbon ${result.carbonP50Grams === undefined ? 'n/a' : formatSignedPercent(result.carbonP50Grams.changePercent)}\n`,
    );
  }
  process.stdout.write(`\n${before.whatIf.disclaimer}\n`);
  process.stdout.write(`${before.carbon?.measurementDisclaimer ?? ''}\n`);

  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1) {
    const directory = process.argv[outIndex + 1];
    if (directory === undefined) {
      throw new Error('--out requires a directory');
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'before.json'),
      `${JSON.stringify(before, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      resolve(directory, 'after.json'),
      `${JSON.stringify(after, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(`\nReports written to ${resolve(directory)}\n`);
  }
}
