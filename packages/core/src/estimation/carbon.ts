import { percentile } from '../analysis/statistics.js';
import {
  carbonIntensityDataset,
  findCarbonRegion,
  findRunnerModel,
  runnerModelDataset,
} from '../datasets/index.js';
import type { TriangularConfig } from '../domain/config.js';
import type { CarbonRegion, RunnerPowerModel } from '../domain/datasets.js';
import type { NormalizedJob } from '../domain/schemas.js';
import { sha256Hex } from '../util/canonical.js';
import { createSeededRandom, triangular } from './random.js';

/** A modeled quantity expressed as an uncertainty interval. */
export interface EstimateInterval {
  readonly p05: number;
  readonly p50: number;
  readonly p95: number;
  readonly unit: string;
  readonly modelVersion: string;
}

/** One disclosed input of the carbon model. */
export interface CarbonAssumption {
  readonly key: string;
  readonly value: string;
  readonly source: string;
}

/** Weighted data-quality result for one carbon estimate. */
export interface CarbonQuality {
  readonly score: number;
  readonly grade: 'high' | 'medium' | 'low';
  readonly reasons: readonly string[];
}

/** Complete, uncertainty-aware operational carbon estimate. */
export interface CarbonEstimate {
  readonly modelVersion: string;
  readonly model: 'operational-v1';
  readonly region: string;
  readonly regionResolved: boolean;
  readonly simulationSamples: number;
  readonly seedHash: string;
  readonly energyKwh: EstimateInterval;
  readonly operationalCarbonGrams: EstimateInterval;
  readonly modeledJobs: number;
  readonly unmodeledJobs: number;
  readonly unknownRunnerClasses: readonly string[];
  readonly quality: CarbonQuality;
  readonly assumptions: readonly CarbonAssumption[];
  readonly measurementDisclaimer: string;
}

/** Everything the deterministic simulation needs, with no ambient state. */
export interface CarbonEstimateInput {
  readonly jobs: readonly NormalizedJob[];
  readonly runId: number;
  readonly configHash: string;
  readonly region: string;
  readonly simulationSamples: number;
  readonly pue: TriangularConfig;
  readonly utilization: TriangularConfig;
  readonly referenceYear: number;
}

/** Quality weights taken from the design contract. */
export const QUALITY_WEIGHTS = {
  runtimeMeasured: 0.3,
  runnerClassKnown: 0.2,
  runnerModelQuality: 0.2,
  regionConfigured: 0.15,
  datasetFreshness: 0.1,
  pueSourceQuality: 0.05,
} as const;

const PUE_SOURCE_QUALITY = 0.6;

const MEASUREMENT_DISCLAIMER =
  'Modeled operational emissions. GreenCI does not measure electricity on GitHub-hosted runners and does not claim certified SCI compliance.';

function interval(
  sortedSamples: readonly number[],
  unit: string,
  modelVersion: string,
): EstimateInterval {
  const p05 = Math.max(0, percentile(sortedSamples, 0.05));
  const p50 = Math.max(p05, percentile(sortedSamples, 0.5));
  const p95 = Math.max(p50, percentile(sortedSamples, 0.95));
  return { p05, p50, p95, unit, modelVersion };
}

interface ModeledJob {
  readonly durationSeconds: number;
  readonly model: RunnerPowerModel;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function computeQuality(
  jobs: readonly NormalizedJob[],
  modeled: readonly ModeledJob[],
  region: CarbonRegion | undefined,
  regionExplicit: boolean,
  referenceYear: number,
): CarbonQuality {
  const reasons: string[] = [];
  if (jobs.length === 0) {
    return {
      score: 0,
      grade: 'low',
      reasons: ['no-analyzed-jobs'],
    };
  }

  const measured =
    jobs.filter((job) => job.durationSeconds !== undefined).length /
    jobs.length;
  if (measured < 1) {
    reasons.push('incomplete-job-timestamps');
  }

  const knownClass =
    jobs.filter((job) => findRunnerModel(job.runnerClass) !== undefined)
      .length / jobs.length;
  if (knownClass < 1) {
    reasons.push('unmodeled-runner-class');
  }

  const modeledSeconds = modeled.reduce(
    (total, job) => total + job.durationSeconds,
    0,
  );
  const modelQuality =
    modeledSeconds > 0
      ? modeled.reduce(
          (total, job) => total + job.model.quality * job.durationSeconds,
          0,
        ) / modeledSeconds
      : 0;
  if (modelQuality < 0.6) {
    reasons.push('modeled-runner-power-only');
  }

  let regionScore = 0;
  if (region === undefined) {
    reasons.push('carbon-region-unknown');
  } else if (regionExplicit) {
    regionScore = 1;
  } else {
    regionScore = 0.5;
    reasons.push('global-average-carbon-intensity');
  }

  const freshness =
    region === undefined
      ? 0
      : clamp01(1 - Math.max(0, referenceYear - region.year) / 5);
  if (freshness < 1) {
    reasons.push('carbon-dataset-age');
  }

  const score =
    QUALITY_WEIGHTS.runtimeMeasured * clamp01(measured) +
    QUALITY_WEIGHTS.runnerClassKnown * clamp01(knownClass) +
    QUALITY_WEIGHTS.runnerModelQuality * clamp01(modelQuality) +
    QUALITY_WEIGHTS.regionConfigured * regionScore +
    QUALITY_WEIGHTS.datasetFreshness * freshness +
    QUALITY_WEIGHTS.pueSourceQuality * PUE_SOURCE_QUALITY;

  const rounded = Math.round(clamp01(score) * 1000) / 1000;
  const grade = rounded >= 0.8 ? 'high' : rounded >= 0.55 ? 'medium' : 'low';
  return { score: rounded, grade, reasons };
}

/**
 * Estimate operational emissions with a deterministic Monte Carlo simulation.
 *
 * The seed is derived from the run identity, the resolved configuration, and
 * the model version, so identical inputs always produce identical percentiles.
 */
export function estimateCarbon(input: CarbonEstimateInput): CarbonEstimate {
  const modelVersion = [
    'operational-v1',
    runnerModelDataset.modelVersion,
    carbonIntensityDataset.modelVersion,
  ].join('+');
  const seedHash = sha256Hex(
    `${input.runId}|${input.configHash}|${modelVersion}`,
  );
  const random = createSeededRandom(seedHash);

  const regionExplicit =
    input.region.trim().toLocaleUpperCase('en-US') !==
    carbonIntensityDataset.defaultRegion;
  const region =
    findCarbonRegion(input.region) ??
    findCarbonRegion(carbonIntensityDataset.defaultRegion);
  const regionResolved = findCarbonRegion(input.region) !== undefined;

  const unknownRunnerClasses = new Set<string>();
  const modeled: ModeledJob[] = [];
  for (const job of input.jobs) {
    const model = findRunnerModel(job.runnerClass);
    if (model === undefined) {
      unknownRunnerClasses.add(job.runnerClass);
      continue;
    }
    modeled.push({ durationSeconds: job.durationSeconds ?? 0, model });
  }

  const samples = Math.max(1, Math.trunc(input.simulationSamples));
  const energySamples: number[] = new Array<number>(samples);
  const carbonSamples: number[] = new Array<number>(samples);

  for (let index = 0; index < samples; index += 1) {
    let energyKwh = 0;
    for (const job of modeled) {
      const utilization = triangular(input.utilization, random);
      const pue = triangular(input.pue, random);
      const idleWatts = triangular(job.model.idleWatts, random);
      const peakWatts = triangular(job.model.peakWatts, random);
      const memoryWattsPerGb = triangular(job.model.memoryWattsPerGb, random);
      const dynamicWatts = Math.max(0, peakWatts - idleWatts) * utilization;
      const powerWatts =
        idleWatts + dynamicWatts + job.model.memoryGb * memoryWattsPerGb;
      energyKwh += (job.durationSeconds / 3600) * (powerWatts / 1000) * pue;
    }
    const intensity =
      region === undefined ? 0 : triangular(region.gramsPerKwh, random);
    energySamples[index] = Math.max(0, energyKwh);
    carbonSamples[index] = Math.max(0, energyKwh * intensity);
  }

  energySamples.sort((left, right) => left - right);
  carbonSamples.sort((left, right) => left - right);

  const quality = computeQuality(
    input.jobs,
    modeled,
    region,
    regionExplicit && regionResolved,
    input.referenceYear,
  );

  const assumptions: CarbonAssumption[] = [
    {
      key: 'utilization',
      value: `triangular(${input.utilization.min}, ${input.utilization.mode}, ${input.utilization.max})`,
      source: 'GreenCI configuration',
    },
    {
      key: 'pue',
      value: `triangular(${input.pue.min}, ${input.pue.mode}, ${input.pue.max})`,
      source: 'GreenCI configuration',
    },
    {
      key: 'runner-power-model',
      value: runnerModelDataset.modelVersion,
      source: runnerModelDataset.source,
    },
    {
      key: 'carbon-intensity',
      value:
        region === undefined
          ? 'unavailable'
          : `${region.region} triangular(${region.gramsPerKwh.min}, ${region.gramsPerKwh.mode}, ${region.gramsPerKwh.max}) gCO2eq/kWh`,
      source: carbonIntensityDataset.source,
    },
    {
      key: 'simulation-samples',
      value: String(samples),
      source: 'GreenCI configuration',
    },
    {
      key: 'data-center-region',
      value: regionResolved
        ? `${input.region} (configured)`
        : `${carbonIntensityDataset.defaultRegion} (fallback; GitHub does not publish the execution region)`,
      source: 'GreenCI configuration',
    },
  ];

  return {
    modelVersion,
    model: 'operational-v1',
    region: region?.region ?? carbonIntensityDataset.defaultRegion,
    regionResolved,
    simulationSamples: samples,
    seedHash,
    energyKwh: interval(energySamples, 'kWh', modelVersion),
    operationalCarbonGrams: interval(carbonSamples, 'gCO2eq', modelVersion),
    modeledJobs: modeled.length,
    unmodeledJobs: input.jobs.length - modeled.length,
    unknownRunnerClasses: [...unknownRunnerClasses].sort(),
    quality,
    assumptions,
    measurementDisclaimer: MEASUREMENT_DISCLAIMER,
  };
}
