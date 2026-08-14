import {
  CarbonIntensityDatasetSchema,
  DataManifestSchema,
  PricingDatasetSchema,
  RunnerModelDatasetSchema,
  type CarbonIntensityDataset,
  type CarbonRegion,
  type DataManifest,
  type PricingDataset,
  type RunnerPowerModel,
  type RunnerModelDataset,
  type RunnerPrice,
} from '../domain/datasets.js';
import {
  rawCarbonIntensityDataset,
  rawDataManifest,
  rawPricingDataset,
  rawRunnerModelDataset,
} from './generated.js';

/** Bundled GitHub Actions runner price list. */
export const pricingDataset: PricingDataset =
  PricingDatasetSchema.parse(rawPricingDataset);

/** Bundled runner power models. */
export const runnerModelDataset: RunnerModelDataset =
  RunnerModelDatasetSchema.parse(rawRunnerModelDataset);

/** Bundled grid carbon-intensity dataset. */
export const carbonIntensityDataset: CarbonIntensityDataset =
  CarbonIntensityDatasetSchema.parse(rawCarbonIntensityDataset);

/** Bundled provenance manifest for every dataset above. */
export const dataManifest: DataManifest =
  DataManifestSchema.parse(rawDataManifest);

/** Look up a runner price, returning `undefined` for unknown runner classes. */
export function findRunnerPrice(runnerClass: string): RunnerPrice | undefined {
  return pricingDataset.runners.find(
    (runner) => runner.runnerClass === runnerClass,
  );
}

/** Look up a runner power model, returning `undefined` when it is unknown. */
export function findRunnerModel(
  runnerClass: string,
): RunnerPowerModel | undefined {
  return runnerModelDataset.models.find(
    (model) => model.runnerClass === runnerClass,
  );
}

/** Look up a grid region, returning `undefined` when it is not modeled. */
export function findCarbonRegion(region: string): CarbonRegion | undefined {
  const normalized = region.trim().toLocaleUpperCase('en-US');
  return carbonIntensityDataset.regions.find(
    (entry) => entry.region === normalized,
  );
}
