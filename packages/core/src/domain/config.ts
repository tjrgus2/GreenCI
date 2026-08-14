import { z } from 'zod';
import { canonicalHash } from '../util/canonical.js';
import type { AnalysisWarning } from './schemas.js';

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

const ReportSchema = z
  .object({
    'pr-comment': z.boolean().default(true),
    'job-summary': z.boolean().default(true),
    'update-existing-comment': z.boolean().default(true),
    'top-hotspots': z.number().int().min(1).max(50).default(5),
  })
  .strict();

const AnalysisSchema = z
  .object({
    'exclude-current-job': z.boolean().default(true),
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

/** The bundled default configuration used when no file is present. */
export const DEFAULT_CONFIG: ResolvedConfig = toResolved(
  GreenCIConfigFileSchema.parse({}),
);

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
 * Describe validation failures in a way a repository owner can act on. The
 * point of a strict configuration schema is to catch typos, so an unrecognized
 * key must name itself instead of reporting a generic invalid input.
 */
function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => {
      const location = issueLocation(issue.path);
      if (issue.code === 'unrecognized_keys') {
        return `${location}: unknown key(s) ${issue.keys.map((key) => `\`${key}\``).join(', ')}`;
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
