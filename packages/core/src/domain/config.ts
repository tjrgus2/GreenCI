import { z } from 'zod';
import type { PolicyMode, PolicyRule } from '../policy/index.js';
import { canonicalHash } from '../util/canonical.js';
import type { AnalysisWarning } from './schemas.js';
import { describeUnknownKey } from './suggest.js';

const TriangularConfigSchema = z
  .object({
    min: z.number().finite(),
    mode: z.number().finite(),
    max: z.number().finite(),
  })
  .strict()
  .refine(
    (range) => range.min <= range.mode && range.mode <= range.max,
    'Expected min <= mode <= max',
  );

const StatisticsSchema = z
  .object({
    method: z.literal('median-mad').default('median-mad'),
    'regression-percent': z.number().min(0).max(1000).default(15),
    'modified-z-score': z.number().min(0).max(1000).default(3.5),
  })
  .strict();

const BaselineSchema = z
  .object({
    branch: z.string().min(1).max(255).optional(),
    'successful-runs': z.number().int().min(1).max(20).default(7),
    'max-runs': z.number().int().min(1).max(20).default(20),
    'minimum-samples': z.number().int().min(1).max(20).default(3),
    'workflow-shape-threshold': z.number().min(0).max(1).default(0.8),
    statistics: StatisticsSchema.prefault({}),
  })
  .strict();

const AnnotationsSchema = z
  .object({
    enabled: z.boolean().default(true),
    'max-count': z.number().int().min(0).max(50).default(20),
    'min-confidence': z.number().min(0).max(1).default(0.9),
  })
  .strict();

const ReportSchema = z
  .object({
    'pr-comment': z.boolean().default(true),
    'job-summary': z.boolean().default(true),
    'update-existing-comment': z.boolean().default(true),
    'top-hotspots': z.number().int().min(1).max(50).default(5),
    annotations: AnnotationsSchema.prefault({}),
  })
  .strict();

const CriticalPathSchema = z
  .object({
    enabled: z.boolean().default(true),
    'parse-workflow-dag': z.boolean().default(true),
  })
  .strict();

const FailureLogsSchema = z
  .object({
    enabled: z.boolean().default(false),
    'max-bytes-per-job': z
      .number()
      .int()
      .min(1024)
      .max(8_388_608)
      .default(2_097_152),
    'max-jobs': z.number().int().min(1).max(10).default(3),
    'tail-lines': z.number().int().min(50).max(20_000).default(2000),
  })
  .strict();

const TestReportSchema = z
  .object({
    artifact: z.string().min(1).max(255),
    format: z.literal('junit').default('junit'),
    'max-uncompressed-bytes': z
      .number()
      .int()
      .min(1024)
      .max(52_428_800)
      .default(10_485_760),
    'max-files': z.number().int().min(1).max(1000).default(100),
  })
  .strict();

const WhatIfSchema = z
  .object({
    enabled: z.boolean().default(true),
    'speedup-percent': z.number().min(1).max(95).default(50),
    'max-scenarios': z.number().int().min(0).max(5).default(2),
  })
  .strict();

const AnalysisSchema = z
  .object({
    'exclude-current-job': z.boolean().default(true),
    'critical-path': CriticalPathSchema.prefault({}),
    'what-if': WhatIfSchema.prefault({}),
    'failure-logs': FailureLogsSchema.prefault({}),
    'test-reports': z.array(TestReportSchema).max(5).default([]),
  })
  .strict();

const PolicyRuleSchema = z
  .object({
    metric: z.enum([
      'wall-clock-regression-percent',
      'runner-time-regression-percent',
      'list-price-regression-percent',
      'carbon-p50-regression-percent',
      'carbon-p95-grams',
      'failed-jobs',
      'workflow-shape-match',
      'critical-path-regression-percent',
    ]),
    operator: z
      .enum([
        'greater-than',
        'greater-than-or-equal',
        'less-than',
        'less-than-or-equal',
      ])
      .default('greater-than'),
    value: z.number().finite(),
    mode: z.enum(['report', 'warn', 'fail']).optional(),
    'minimum-confidence': z.enum(['high', 'medium', 'low']).default('medium'),
  })
  .strict();

const PolicySchema = z
  .object({
    'default-mode': z.enum(['report', 'warn', 'fail']).default('warn'),
    rules: z.array(PolicyRuleSchema).max(20).default([]),
  })
  .strict();

const RecommendationsSchema = z
  .object({
    enabled: z.boolean().default(true),
    'minimum-confidence': z.number().min(0).max(1).default(0.65),
    'max-count': z.number().int().min(0).max(20).default(5),
  })
  .strict();

const CarbonSchema = z
  .object({
    enabled: z.boolean().default(true),
    region: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/u)
      .default('GLOBAL'),
    model: z.literal('operational-v1').default('operational-v1'),
    'simulation-samples': z.number().int().min(200).max(20000).default(2000),
    pue: TriangularConfigSchema.default({ min: 1.1, mode: 1.2, max: 1.35 }),
    utilization: TriangularConfigSchema.default({
      min: 0.35,
      mode: 0.65,
      max: 0.95,
    }),
    'show-uncertainty': z.boolean().default(true),
  })
  .strict();

const CostSchema = z
  .object({
    enabled: z.boolean().default(true),
    'show-public-runner-equivalent': z.boolean().default(true),
  })
  .strict();

/**
 * Repository configuration file contract. Unknown keys are rejected so that a
 * typo fails loudly instead of silently disabling a feature.
 */
export const GreenCIConfigFileSchema = z
  .object({
    version: z.literal(1).default(1),
    locale: z.enum(['en', 'ko']).default('en'),
    report: ReportSchema.prefault({}),
    baseline: BaselineSchema.prefault({}),
    analysis: AnalysisSchema.prefault({}),
    carbon: CarbonSchema.prefault({}),
    cost: CostSchema.prefault({}),
    policy: PolicySchema.prefault({}),
    recommendations: RecommendationsSchema.prefault({}),
  })
  .strict();

export type GreenCIConfigFile = z.infer<typeof GreenCIConfigFileSchema>;

/** Bounds of a triangular distribution after configuration resolution. */
export interface TriangularConfig {
  readonly min: number;
  readonly mode: number;
  readonly max: number;
}

/** Fully resolved, camel-cased configuration consumed by the core engine. */
export interface ResolvedConfig {
  readonly version: 1;
  readonly locale: 'en' | 'ko';
  readonly report: {
    readonly prComment: boolean;
    readonly jobSummary: boolean;
    readonly updateExistingComment: boolean;
    readonly topHotspots: number;
    readonly annotations: {
      readonly enabled: boolean;
      readonly maxCount: number;
      readonly minConfidence: number;
    };
  };
  readonly baseline: {
    readonly branch: string | undefined;
    readonly successfulRuns: number;
    readonly maxRuns: number;
    readonly minimumSamples: number;
    readonly workflowShapeThreshold: number;
    readonly statistics: {
      readonly method: 'median-mad';
      readonly regressionPercent: number;
      readonly modifiedZScore: number;
    };
  };
  readonly analysis: {
    readonly excludeCurrentJob: boolean;
    readonly criticalPath: {
      readonly enabled: boolean;
      readonly parseWorkflowDag: boolean;
    };
    readonly whatIf: {
      readonly enabled: boolean;
      readonly speedupPercent: number;
      readonly maxScenarios: number;
    };
    readonly failureLogs: {
      readonly enabled: boolean;
      readonly maxBytesPerJob: number;
      readonly maxJobs: number;
      readonly tailLines: number;
    };
    readonly testReports: readonly {
      readonly artifact: string;
      readonly format: 'junit';
      readonly maxUncompressedBytes: number;
      readonly maxFiles: number;
    }[];
  };
  readonly carbon: {
    readonly enabled: boolean;
    readonly region: string;
    readonly model: 'operational-v1';
    readonly simulationSamples: number;
    readonly pue: TriangularConfig;
    readonly utilization: TriangularConfig;
    readonly showUncertainty: boolean;
  };
  readonly cost: {
    readonly enabled: boolean;
    readonly showPublicRunnerEquivalent: boolean;
  };
  readonly policy: {
    readonly defaultMode: PolicyMode;
    readonly rules: readonly PolicyRule[];
  };
  readonly recommendations: {
    readonly enabled: boolean;
    readonly minimumConfidence: number;
    readonly maxCount: number;
  };
}

/** Action inputs that take precedence over the repository configuration file. */
export interface ConfigOverrides {
  readonly locale?: 'en' | 'ko' | undefined;
  readonly baselineRuns?: number | undefined;
}

function toResolved(file: GreenCIConfigFile): ResolvedConfig {
  return {
    version: file.version,
    locale: file.locale,
    report: {
      prComment: file.report['pr-comment'],
      jobSummary: file.report['job-summary'],
      updateExistingComment: file.report['update-existing-comment'],
      topHotspots: file.report['top-hotspots'],
      annotations: {
        enabled: file.report.annotations.enabled,
        maxCount: file.report.annotations['max-count'],
        minConfidence: file.report.annotations['min-confidence'],
      },
    },
    baseline: {
      branch: file.baseline.branch,
      successfulRuns: file.baseline['successful-runs'],
      maxRuns: file.baseline['max-runs'],
      minimumSamples: file.baseline['minimum-samples'],
      workflowShapeThreshold: file.baseline['workflow-shape-threshold'],
      statistics: {
        method: file.baseline.statistics.method,
        regressionPercent: file.baseline.statistics['regression-percent'],
        modifiedZScore: file.baseline.statistics['modified-z-score'],
      },
    },
    analysis: {
      excludeCurrentJob: file.analysis['exclude-current-job'],
      criticalPath: {
        enabled: file.analysis['critical-path'].enabled,
        parseWorkflowDag: file.analysis['critical-path']['parse-workflow-dag'],
      },
      whatIf: {
        enabled: file.analysis['what-if'].enabled,
        speedupPercent: file.analysis['what-if']['speedup-percent'],
        maxScenarios: file.analysis['what-if']['max-scenarios'],
      },
      failureLogs: {
        enabled: file.analysis['failure-logs'].enabled,
        maxBytesPerJob: file.analysis['failure-logs']['max-bytes-per-job'],
        maxJobs: file.analysis['failure-logs']['max-jobs'],
        tailLines: file.analysis['failure-logs']['tail-lines'],
      },
      testReports: file.analysis['test-reports'].map((entry) => ({
        artifact: entry.artifact,
        format: entry.format,
        maxUncompressedBytes: entry['max-uncompressed-bytes'],
        maxFiles: entry['max-files'],
      })),
    },
    carbon: {
      enabled: file.carbon.enabled,
      region: file.carbon.region.toLocaleUpperCase('en-US'),
      model: file.carbon.model,
      simulationSamples: file.carbon['simulation-samples'],
      pue: file.carbon.pue,
      utilization: file.carbon.utilization,
      showUncertainty: file.carbon['show-uncertainty'],
    },
    cost: {
      enabled: file.cost.enabled,
      showPublicRunnerEquivalent: file.cost['show-public-runner-equivalent'],
    },
    policy: {
      defaultMode: file.policy['default-mode'],
      rules: file.policy.rules.map((rule) => ({
        metric: rule.metric,
        operator: rule.operator,
        value: rule.value,
        mode: rule.mode ?? file.policy['default-mode'],
        minimumConfidence: rule['minimum-confidence'],
      })),
    },
    recommendations: {
      enabled: file.recommendations.enabled,
      minimumConfidence: file.recommendations['minimum-confidence'],
      maxCount: file.recommendations['max-count'],
    },
  };
}

function applyOverrides(
  config: ResolvedConfig,
  overrides: ConfigOverrides,
): ResolvedConfig {
  const successfulRuns =
    overrides.baselineRuns ?? config.baseline.successfulRuns;
  return {
    ...config,
    locale: overrides.locale ?? config.locale,
    baseline: {
      ...config.baseline,
      successfulRuns,
      maxRuns: Math.max(config.baseline.maxRuns, successfulRuns),
      minimumSamples: Math.min(config.baseline.minimumSamples, successfulRuns),
    },
  };
}

/**
 * The fully defaulted configuration document, in the file's own kebab-case
 * shape. It doubles as the authoritative list of accepted keys.
 */
const DEFAULT_CONFIG_FILE: GreenCIConfigFile = GreenCIConfigFileSchema.parse(
  {},
);

/** The bundled default configuration used when no file is present. */
export const DEFAULT_CONFIG: ResolvedConfig = toResolved(DEFAULT_CONFIG_FILE);

/** Result of resolving configuration, including non-fatal validation warnings. */
export interface ConfigResolution {
  readonly config: ResolvedConfig;
  readonly configHash: string;
  readonly warnings: AnalysisWarning[];
}

function issueLocation(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

/**
 * Keys accepted at a path but absent from the fully defaulted document, because
 * they are optional and have no default.
 */
const OPTIONAL_KEYS: Readonly<Record<string, readonly string[]>> = {
  baseline: ['branch'],
};

/** Element shapes of the array-valued configuration sections. */
const ARRAY_ELEMENT_KEYS: Readonly<Record<string, readonly string[]>> = {
  'analysis.test-reports': [
    'artifact',
    'format',
    'max-uncompressed-bytes',
    'max-files',
  ],
  'policy.rules': ['metric', 'operator', 'value', 'mode', 'minimum-confidence'],
};

/**
 * Every key the schema accepts at one path, derived from the schema itself by
 * walking a fully defaulted document, so the suggestion list cannot drift from
 * what is actually accepted.
 */
function acceptedKeysAt(path: readonly PropertyKey[]): string[] {
  const objectPath = path.filter((segment) => typeof segment !== 'number');
  const elementKeys = ARRAY_ELEMENT_KEYS[objectPath.map(String).join('.')];
  if (path.some((segment) => typeof segment === 'number')) {
    return [...(elementKeys ?? [])];
  }

  let cursor: unknown = DEFAULT_CONFIG_FILE;
  for (const segment of objectPath) {
    if (typeof cursor !== 'object' || cursor === null) {
      return [];
    }
    cursor = (cursor as Record<string, unknown>)[String(segment)];
  }
  if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) {
    return [];
  }
  return [
    ...Object.keys(cursor),
    ...(OPTIONAL_KEYS[objectPath.map(String).join('.')] ?? []),
  ];
}

/**
 * Describe validation failures in a way a repository owner can act on. The
 * point of a strict configuration schema is to catch typos, so an unrecognized
 * key names itself and, when one is plausible, the key that was probably meant.
 */
function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => {
      const location = issueLocation(issue.path);
      if (issue.code === 'unrecognized_keys') {
        const candidates = acceptedKeysAt(issue.path);
        return `${location}: unknown key(s) ${issue.keys
          .map((key) => describeUnknownKey(key, candidates))
          .join(', ')}`;
      }
      return `${location}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Resolve configuration with the documented precedence: Action input beats the
 * repository configuration file, which beats the bundled defaults. Invalid
 * files degrade to defaults with a warning rather than failing the analysis.
 */
export function resolveConfig(
  rawFile: unknown,
  overrides: ConfigOverrides = {},
): ConfigResolution {
  const warnings: AnalysisWarning[] = [];
  let base = DEFAULT_CONFIG;

  if (rawFile !== undefined && rawFile !== null) {
    const parsed = GreenCIConfigFileSchema.safeParse(rawFile);
    if (parsed.success) {
      base = toResolved(parsed.data);
    } else {
      warnings.push({
        code: 'CONFIG_INVALID',
        source: 'core',
        message: `The repository GreenCI configuration was rejected and bundled defaults are used instead: ${describeIssues(parsed.error.issues)}`,
      });
    }
  }

  const config = applyOverrides(base, overrides);
  return {
    config,
    configHash: hashConfig(config),
    warnings,
  };
}

/** Stable hash of a resolved configuration, used to seed the carbon model. */
export function hashConfig(config: ResolvedConfig): string {
  return canonicalHash(config);
}
