import { z } from 'zod';

/** A triangular uncertainty range used by every estimation dataset. */
export const TriangularRangeSchema = z
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

const ProvenanceSchema = z.object({
  datasetId: z.string().min(1),
  version: z.string().min(1),
  modelVersion: z.string().min(1),
  unit: z.string().min(1),
  source: z.string().min(1),
  effectiveDate: z.string().min(1),
  retrievedAt: z.string().min(1),
  licenseNote: z.string().min(1),
});

/** One priced GitHub-hosted runner SKU. */
export const RunnerPriceSchema = z
  .object({
    sku: z.string().min(1),
    runnerClass: z.string().min(1),
    architecture: z.enum(['x64', 'arm64']),
    cores: z.number().int().positive(),
    usdPerMinute: z.number().nonnegative(),
    standardPublicFree: z.boolean(),
    source: z.string().min(1),
  })
  .strict();

/** Versioned GitHub Actions runner price list. */
export const PricingDatasetSchema = ProvenanceSchema.extend({
  currency: z.literal('USD'),
  runners: z.array(RunnerPriceSchema).min(1),
})
  .strict()
  .refine(
    (dataset) =>
      new Set(dataset.runners.map((runner) => runner.runnerClass)).size ===
      dataset.runners.length,
    'Runner classes must be unique',
  );

/** Modeled power characteristics of one runner class. */
export const RunnerPowerModelSchema = z
  .object({
    runnerClass: z.string().min(1),
    vcpus: z.number().int().positive(),
    memoryGb: z.number().positive(),
    idleWatts: TriangularRangeSchema,
    peakWatts: TriangularRangeSchema,
    memoryWattsPerGb: TriangularRangeSchema,
    quality: z.number().min(0).max(1),
    source: z.string().min(1),
    notes: z.string().min(1),
  })
  .strict();

/** Versioned runner power dataset. */
export const RunnerModelDatasetSchema = ProvenanceSchema.extend({
  models: z.array(RunnerPowerModelSchema).min(1),
}).strict();

/** Modeled grid carbon intensity for one region. */
export const CarbonRegionSchema = z
  .object({
    region: z.string().min(1),
    name: z.string().min(1),
    gramsPerKwh: TriangularRangeSchema,
    quality: z.number().min(0).max(1),
    year: z.number().int().positive(),
    source: z.string().min(1),
  })
  .strict();

/** Versioned grid carbon-intensity dataset. */
export const CarbonIntensityDatasetSchema = ProvenanceSchema.extend({
  defaultRegion: z.string().min(1),
  regions: z.array(CarbonRegionSchema).min(1),
}).strict();

/** One entry of the versioned data manifest. */
export const DataManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    path: z.string().min(1),
    source: z.string().min(1),
    unit: z.string().min(1),
    uncertainty: z.string().min(1),
    effectiveDate: z.string().min(1),
    retrievedAt: z.string().min(1),
    licenseNote: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

/** The versioned provenance record for every bundled dataset. */
export const DataManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasets: z.array(DataManifestEntrySchema).min(1),
  })
  .strict();

export type TriangularRange = z.infer<typeof TriangularRangeSchema>;
export type RunnerPrice = z.infer<typeof RunnerPriceSchema>;
export type PricingDataset = z.infer<typeof PricingDatasetSchema>;
export type RunnerPowerModel = z.infer<typeof RunnerPowerModelSchema>;
export type RunnerModelDataset = z.infer<typeof RunnerModelDatasetSchema>;
export type CarbonRegion = z.infer<typeof CarbonRegionSchema>;
export type CarbonIntensityDataset = z.infer<
  typeof CarbonIntensityDatasetSchema
>;
export type DataManifestEntry = z.infer<typeof DataManifestEntrySchema>;
export type DataManifest = z.infer<typeof DataManifestSchema>;
