import { deriveLogicalJobId } from '../analysis/shape.js';
import type { NormalizedJob } from '../domain/schemas.js';
import type {
  AnalysisContext,
  EstimatedImpact,
  RecommendationRule,
} from './types.js';

const INSTALL_PATTERNS: readonly RegExp[] = [
  /\b(npm|pnpm|yarn|bun)\s+(ci|install|i)\b/u,
  /\bpip3?\s+install\b/u,
  /\bpoetry\s+install\b/u,
  /\bbundle\s+install\b/u,
  /\bcomposer\s+install\b/u,
  /\bgo\s+mod\s+(download|tidy)\b/u,
  /\bcargo\s+fetch\b/u,
  /\bmvn\b.*\bdependency\b/u,
  /\b(gradle|\.\/gradlew)\b.*\bdependencies\b/u,
  /\b(install|restore)\s+(dependencies|deps|packages|modules)\b/u,
  /\bdependency\s+install\b/u,
];

function isInstallStep(normalizedName: string): boolean {
  return INSTALL_PATTERNS.some((pattern) => pattern.test(normalizedName));
}

function totalRunnerSeconds(jobs: readonly NormalizedJob[]): number {
  return jobs.reduce((total, job) => total + (job.durationSeconds ?? 0), 0);
}

/** Scale cost and carbon by the share of runner time a change could remove. */
function impactFor(
  context: AnalysisContext,
  runnerSeconds: number,
): EstimatedImpact {
  const total = totalRunnerSeconds(context.jobs);
  const ratio = total > 0 ? Math.min(1, Math.max(0, runnerSeconds / total)) : 0;
  return {
    runnerSeconds: Math.round(runnerSeconds),
    ...(context.cost === undefined
      ? {}
      : {
          costUsd:
            Math.round(context.cost.grossListPriceUsd * ratio * 1e6) / 1e6,
        }),
    ...(context.carbon === undefined
      ? {}
      : {
          carbonGrams:
            Math.round(
              context.carbon.operationalCarbonGrams.p50 * ratio * 1e6,
            ) / 1e6,
        }),
    upperBound: true,
  };
}

const slowDependencyInstall: RecommendationRule = {
  id: 'GCI-CACHE-001',
  version: 1,
  evaluate(context) {
    const installs = context.jobs.flatMap((job) =>
      job.steps
        .filter(
          (step) =>
            !step.isRunnerInternal &&
            step.durationSeconds !== undefined &&
            isInstallStep(step.normalizedName),
        )
        .map((step) => ({ job, step, seconds: step.durationSeconds ?? 0 })),
    );
    const seconds = installs.reduce((total, entry) => total + entry.seconds, 0);
    const runner = totalRunnerSeconds(context.jobs);
    if (installs.length === 0 || seconds < 20 || runner <= 0) {
      return undefined;
    }
    const sharePercent = (seconds / runner) * 100;
    if (sharePercent < 15) {
      return undefined;
    }
    return {
      ruleId: 'GCI-CACHE-001',
      ruleVersion: 1,
      severity: 'warning',
      title: 'Dependency installation dominates runner time',
      explanation:
        'Dependency installation steps consume a large share of total runner time. A lockfile-aware dependency cache, or reusing a prepared dependency artifact, usually removes most of it.',
      confidence: installs.length > 1 ? 0.85 : 0.7,
      evidence: [
        {
          metric: 'install-seconds',
          observed: Math.round(seconds),
          source: 'GitHub Actions step timing',
        },
        {
          metric: 'install-share-percent',
          observed: Math.round(sharePercent * 10) / 10,
          source: 'GreenCI runtime analysis',
        },
        {
          metric: 'install-steps',
          observed: installs
            .map((entry) => `${entry.job.apiName} / ${entry.step.name}`)
            .slice(0, 5)
            .join(', '),
          source: 'GitHub Actions step names',
        },
      ],
      estimatedImpact: impactFor(context, seconds * 0.7),
    };
  },
};

const repeatedStep: RecommendationRule = {
  id: 'GCI-DUP-001',
  version: 1,
  evaluate(context) {
    const byStep = new Map<string, { jobs: Set<string>; seconds: number }>();
    for (const job of context.jobs) {
      for (const step of job.steps) {
        if (step.isRunnerInternal || step.durationSeconds === undefined) {
          continue;
        }
        const entry = byStep.get(step.normalizedName) ?? {
          jobs: new Set<string>(),
          seconds: 0,
        };
        entry.jobs.add(job.apiName);
        entry.seconds += step.durationSeconds;
        byStep.set(step.normalizedName, entry);
      }
    }
    const duplicated = [...byStep.entries()]
      .filter(([, entry]) => entry.jobs.size >= 2 && entry.seconds >= 30)
      .sort((left, right) => right[1].seconds - left[1].seconds);
    const worst = duplicated[0];
    if (worst === undefined) {
      return undefined;
    }
    const [name, entry] = worst;
    const avoidable = entry.seconds * (1 - 1 / entry.jobs.size);
    return {
      ruleId: 'GCI-DUP-001',
      ruleVersion: 1,
      severity: 'info',
      title: 'The same step runs in several jobs',
      explanation:
        'An equivalent step executes in more than one job. Building or preparing once and sharing the result through an artifact, or extracting a reusable workflow, removes the duplicated runner time.',
      confidence: 0.75,
      evidence: [
        {
          metric: 'duplicated-step',
          observed: name,
          source: 'Normalized GitHub Actions step names',
        },
        {
          metric: 'jobs',
          observed: [...entry.jobs].join(', '),
          source: 'GitHub Actions job names',
        },
        {
          metric: 'combined-seconds',
          observed: Math.round(entry.seconds),
          source: 'GitHub Actions step timing',
        },
      ],
      estimatedImpact: impactFor(context, avoidable),
    };
  },
};

const expensiveMatrix: RecommendationRule = {
  id: 'GCI-MATRIX-001',
  version: 1,
  evaluate(context) {
    const groups = new Map<string, { variants: number; seconds: number }>();
    for (const job of context.jobs) {
      const derived = deriveLogicalJobId(job.apiName);
      if (derived.matrixSignature === undefined) {
        continue;
      }
      const entry = groups.get(derived.logicalJobId) ?? {
        variants: 0,
        seconds: 0,
      };
      entry.variants += 1;
      entry.seconds += job.durationSeconds ?? 0;
      groups.set(derived.logicalJobId, entry);
    }
    const runner = totalRunnerSeconds(context.jobs);
    const worst = [...groups.entries()]
      .filter(([, entry]) => entry.variants >= 3)
      .sort((left, right) => right[1].seconds - left[1].seconds)[0];
    if (worst === undefined || runner <= 0) {
      return undefined;
    }
    const [name, entry] = worst;
    const sharePercent = (entry.seconds / runner) * 100;
    if (sharePercent < 30) {
      return undefined;
    }
    return {
      ruleId: 'GCI-MATRIX-001',
      ruleVersion: 1,
      severity: 'info',
      title: 'A matrix fan-out dominates runner consumption',
      explanation:
        'One matrix job expands into many variants that together consume most of the run. Consider a reduced matrix on pull requests and the full matrix on the default branch or a schedule.',
      confidence: 0.7,
      evidence: [
        { metric: 'matrix-job', observed: name, source: 'GitHub job names' },
        {
          metric: 'variants',
          observed: entry.variants,
          source: 'GitHub job names',
        },
        {
          metric: 'runner-share-percent',
          observed: Math.round(sharePercent * 10) / 10,
          source: 'GreenCI runtime analysis',
        },
      ],
      estimatedImpact: impactFor(context, entry.seconds * 0.5),
    };
  },
};

const lateFailure: RecommendationRule = {
  id: 'GCI-ORDER-001',
  version: 1,
  evaluate(context) {
    const at = context.failures.firstFailureWallClockPercent;
    if (context.failures.failedJobCount === 0 || at === undefined || at < 50) {
      return undefined;
    }
    const failedNames = new Set(
      context.failures.failures.map((failure) => failure.jobName),
    );
    const fasterChecks = context.jobs.filter(
      (job) =>
        !failedNames.has(job.apiName) &&
        (job.durationSeconds ?? 0) > 0 &&
        (job.durationSeconds ?? 0) <
          (context.failures.failures[0]?.durationSeconds ?? 0),
    );
    return {
      ruleId: 'GCI-ORDER-001',
      ruleVersion: 1,
      severity: 'warning',
      title: 'The pipeline failed late',
      explanation:
        'The first failure landed well into the run, so contributors waited before learning the pipeline was broken. Running the fastest checks first, or gating slow jobs behind them, shortens that feedback loop.',
      confidence: fasterChecks.length > 0 ? 0.8 : 0.6,
      evidence: [
        {
          metric: 'first-failure-wall-clock-percent',
          observed: Math.round(at * 10) / 10,
          source: 'GreenCI runtime analysis',
        },
        {
          metric: 'failed-jobs',
          observed: [...failedNames].join(', '),
          source: 'GitHub Actions job conclusions',
        },
        {
          metric: 'faster-checks-available',
          observed: fasterChecks.length,
          source: 'GreenCI runtime analysis',
        },
      ],
    };
  },
};

const criticalPathBottleneck: RecommendationRule = {
  id: 'GCI-CRITICAL-001',
  version: 1,
  evaluate(context) {
    const path = context.criticalPath;
    if (path.method === 'unavailable' || path.path.length === 0) {
      return undefined;
    }
    const worst = [...path.path].sort(
      (left, right) => right.contributionPercent - left.contributionPercent,
    )[0];
    if (worst === undefined || worst.contributionPercent < 40) {
      return undefined;
    }
    return {
      ruleId: 'GCI-CRITICAL-001',
      ruleVersion: 1,
      severity: 'warning',
      title: 'One job dominates the critical path',
      explanation:
        'A single job accounts for most of the time developers wait for this workflow. Splitting or parallelizing it changes merge latency, while optimizing a non-critical job would not.',
      confidence: path.method === 'dag' ? 0.85 : 0.5,
      evidence: [
        {
          metric: 'critical-path-job',
          observed: worst.label,
          source:
            path.method === 'dag'
              ? 'Workflow needs graph'
              : 'Interval overlap fallback',
        },
        {
          metric: 'contribution-percent',
          observed: Math.round(worst.contributionPercent * 10) / 10,
          source: 'GreenCI critical-path analysis',
        },
        {
          metric: 'critical-path-seconds',
          observed: Math.round(path.totalSeconds),
          source: 'GreenCI critical-path analysis',
        },
      ],
    };
  },
};

const statisticalRegression: RecommendationRule = {
  id: 'GCI-REGRESSION-001',
  version: 1,
  evaluate(context) {
    const regressed = context.baseline.metrics.find(
      (metric) =>
        metric.verdict === 'regression' &&
        (metric.metric === 'runner-seconds' ||
          metric.metric === 'wall-clock-seconds'),
    );
    if (regressed === undefined) {
      return undefined;
    }
    const node = context.baseline.jobComparisons.find(
      (entry) => entry.verdict === 'regression',
    );
    return {
      ruleId: 'GCI-REGRESSION-001',
      ruleVersion: 1,
      severity: regressed.confidence === 'high' ? 'critical' : 'warning',
      title: 'A statistically significant CI regression was detected',
      explanation:
        'The current run is slower than the robust median of comparable historical runs by more than the configured threshold. The listed node is the largest contributor and is the place to look first.',
      confidence: regressed.confidence === 'high' ? 0.9 : 0.65,
      evidence: [
        {
          metric: regressed.metric,
          observed: Math.round(regressed.current),
          baseline: Math.round(regressed.baselineMedian),
          source: 'GreenCI baseline comparison',
        },
        {
          metric: 'modified-z-score',
          observed:
            regressed.scaleMethod === 'unavailable'
              ? 'unavailable'
              : Math.round(regressed.modifiedZScore * 100) / 100,
          source: 'GreenCI robust statistics',
        },
        {
          metric: 'baseline-samples',
          observed: regressed.sampleCount,
          source: 'GitHub Actions run history',
        },
        ...(node === undefined
          ? []
          : [
              {
                metric: 'largest-regressed-node',
                observed: node.label,
                baseline: Math.round(node.baselineMedian),
                source: 'GreenCI per-node comparison',
              },
            ]),
      ],
    };
  },
};

const highVariability: RecommendationRule = {
  id: 'GCI-FLAKY-001',
  version: 1,
  evaluate(context) {
    const runner = context.baseline.metrics.find(
      (metric) => metric.metric === 'runner-seconds',
    );
    if (
      runner === undefined ||
      runner.sampleCount < 5 ||
      runner.baselineMedian <= 0
    ) {
      return undefined;
    }
    const normalizedMad = runner.baselineMad / runner.baselineMedian;
    if (normalizedMad < 0.2) {
      return undefined;
    }
    return {
      ruleId: 'GCI-FLAKY-001',
      ruleVersion: 1,
      severity: 'info',
      title: 'Workflow runtime is unstable across runs',
      explanation:
        'The historical runtime of this workflow varies widely, which makes regressions harder to detect and merge times unpredictable. Unstable caches, network-dependent steps, or flaky tests are the usual causes.',
      confidence: 0.6,
      evidence: [
        {
          metric: 'normalized-mad',
          observed: Math.round(normalizedMad * 1000) / 1000,
          source: 'GreenCI robust statistics',
        },
        {
          metric: 'runner-seconds-range',
          observed: `${Math.round(runner.baselineMin)}–${Math.round(runner.baselineMax)}`,
          source: 'GitHub Actions run history',
        },
        {
          metric: 'baseline-samples',
          observed: runner.sampleCount,
          source: 'GitHub Actions run history',
        },
      ],
    };
  },
};

const queuePressure: RecommendationRule = {
  id: 'GCI-QUEUE-001',
  version: 1,
  evaluate(context) {
    const queued = context.jobs.filter((job) => job.queueSeconds !== undefined);
    if (queued.length === 0 || context.runtime.wallClockSeconds <= 0) {
      return undefined;
    }
    const worstQueue = Math.max(
      ...queued.map((job) => job.queueSeconds ?? 0),
      0,
    );
    const sharePercent = (worstQueue / context.runtime.wallClockSeconds) * 100;
    if (worstQueue < 30 || sharePercent < 25) {
      return undefined;
    }
    const slowest = queued
      .filter((job) => (job.queueSeconds ?? 0) === worstQueue)
      .map((job) => job.apiName)
      .join(', ');
    return {
      ruleId: 'GCI-QUEUE-001',
      ruleVersion: 1,
      severity: 'info',
      title: 'Runner queue time dominates the wait',
      explanation:
        'Jobs spent a large part of the wall-clock window waiting for a runner rather than executing. This is a scheduling and capacity question, not a code optimization opportunity.',
      confidence: 0.75,
      evidence: [
        {
          metric: 'max-queue-seconds',
          observed: Math.round(worstQueue),
          source: 'GitHub Actions job timestamps',
        },
        {
          metric: 'queue-share-percent',
          observed: Math.round(sharePercent * 10) / 10,
          source: 'GreenCI runtime analysis',
        },
        {
          metric: 'queued-jobs',
          observed: slowest,
          source: 'GitHub Actions job names',
        },
      ],
    };
  },
};

/** The complete built-in rule catalog, evaluated in this order. */
export const BUILT_IN_RULES: readonly RecommendationRule[] = [
  statisticalRegression,
  criticalPathBottleneck,
  slowDependencyInstall,
  lateFailure,
  expensiveMatrix,
  repeatedStep,
  highVariability,
  queuePressure,
];
