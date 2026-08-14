// GENERATED FILE. Do not edit by hand.
// Source of truth: data/*.json. Regenerate with `pnpm data:write`.

export const rawPricingDataset: unknown = {
  datasetId: 'github-pricing',
  version: '2026.08',
  modelVersion: 'github-pricing@2026.08',
  currency: 'USD',
  unit: 'usd-per-minute',
  source: 'https://docs.github.com/en/billing/reference/actions-runner-pricing',
  effectiveDate: '2026-07-01',
  retrievedAt: '2026-08-14',
  licenseNote:
    'Factual per-minute rates reproduced with source attribution. Rates are list prices for GitHub-hosted standard runners and exclude plan-included minutes, discounts, and organization billing agreements.',
  runners: [
    {
      sku: 'ubuntu-latest-2-core',
      runnerClass: 'linux-x64',
      architecture: 'x64',
      cores: 2,
      usdPerMinute: 0.008,
      standardPublicFree: true,
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
    },
    {
      sku: 'ubuntu-latest-arm-2-core',
      runnerClass: 'linux-arm64',
      architecture: 'arm64',
      cores: 2,
      usdPerMinute: 0.005,
      standardPublicFree: true,
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
    },
    {
      sku: 'windows-latest-2-core',
      runnerClass: 'windows-x64',
      architecture: 'x64',
      cores: 2,
      usdPerMinute: 0.016,
      standardPublicFree: true,
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
    },
    {
      sku: 'macos-latest-3-core',
      runnerClass: 'macos-arm64',
      architecture: 'arm64',
      cores: 3,
      usdPerMinute: 0.08,
      standardPublicFree: false,
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
    },
    {
      sku: 'macos-13-4-core',
      runnerClass: 'macos-x64',
      architecture: 'x64',
      cores: 4,
      usdPerMinute: 0.08,
      standardPublicFree: false,
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
    },
  ],
};

export const rawRunnerModelDataset: unknown = {
  datasetId: 'runner-models',
  version: '2026.08',
  modelVersion: 'runner-models@2026.08',
  unit: 'watts',
  source:
    'https://www.cloudcarbonfootprint.org/docs/methodology combined with https://docs.github.com/en/actions/reference/runners/github-hosted-runners',
  effectiveDate: '2026-07-01',
  retrievedAt: '2026-08-14',
  licenseNote:
    'Modeled power envelopes derived from published open methodology coefficients. These are estimates for the virtual-machine share attributable to a job, not measurements of physical hardware.',
  models: [
    {
      runnerClass: 'linux-x64',
      vcpus: 2,
      memoryGb: 7,
      idleWatts: { min: 1.4, mode: 2.5, max: 3.2 },
      peakWatts: { min: 7, mode: 10.5, max: 15 },
      memoryWattsPerGb: { min: 0.3, mode: 0.3925, max: 0.5 },
      quality: 0.55,
      source: 'https://www.cloudcarbonfootprint.org/docs/methodology',
      notes:
        'GitHub publishes 2-vCPU/7-GiB standard Linux runners but has also served larger public-repository runners. The range intentionally covers both variants.',
    },
    {
      runnerClass: 'linux-arm64',
      vcpus: 2,
      memoryGb: 8,
      idleWatts: { min: 1, mode: 1.8, max: 2.4 },
      peakWatts: { min: 4.5, mode: 7, max: 9.5 },
      memoryWattsPerGb: { min: 0.25, mode: 0.3725, max: 0.48 },
      quality: 0.45,
      source: 'https://www.cloudcarbonfootprint.org/docs/methodology',
      notes:
        'Arm server cores draw less power per vCPU than x86, but no vendor-published figure exists for the exact GitHub host, so the range is deliberately wide.',
    },
    {
      runnerClass: 'windows-x64',
      vcpus: 2,
      memoryGb: 7,
      idleWatts: { min: 2, mode: 3.2, max: 4.2 },
      peakWatts: { min: 8, mode: 11.5, max: 16 },
      memoryWattsPerGb: { min: 0.3, mode: 0.3925, max: 0.5 },
      quality: 0.5,
      source: 'https://www.cloudcarbonfootprint.org/docs/methodology',
      notes:
        'Same underlying x86 host family as the Linux runner with a higher baseline operating-system overhead.',
    },
    {
      runnerClass: 'macos-arm64',
      vcpus: 3,
      memoryGb: 14,
      idleWatts: { min: 3, mode: 5, max: 7.5 },
      peakWatts: { min: 14, mode: 22, max: 32 },
      memoryWattsPerGb: { min: 0.15, mode: 0.25, max: 0.35 },
      quality: 0.4,
      source: 'https://www.cloudcarbonfootprint.org/docs/methodology',
      notes:
        'Apple-silicon hosts are not covered by public cloud power studies; the estimate is a wide envelope and the data-quality score reflects that.',
    },
    {
      runnerClass: 'macos-x64',
      vcpus: 4,
      memoryGb: 14,
      idleWatts: { min: 6, mode: 10, max: 15 },
      peakWatts: { min: 30, mode: 45, max: 62 },
      memoryWattsPerGb: { min: 0.3, mode: 0.3925, max: 0.5 },
      quality: 0.4,
      source: 'https://www.cloudcarbonfootprint.org/docs/methodology',
      notes:
        'Intel Mac hosts are dedicated rather than shared, so the attributable power envelope is much larger than for a shared Linux virtual machine.',
    },
  ],
};

export const rawCarbonIntensityDataset: unknown = {
  datasetId: 'carbon-intensity',
  version: '2026.08',
  modelVersion: 'carbon-intensity@2026.08',
  unit: 'gCO2eq-per-kWh',
  source: 'https://ember-energy.org/data/electricity-data-explorer/',
  effectiveDate: '2026-01-01',
  retrievedAt: '2026-08-14',
  licenseNote:
    'Annual average grid carbon-intensity figures reproduced with source attribution. Values are yearly averages and do not reflect the marginal intensity at the moment a job executed.',
  defaultRegion: 'GLOBAL',
  regions: [
    {
      region: 'GLOBAL',
      name: 'Global average grid',
      gramsPerKwh: { min: 430, mode: 481, max: 540 },
      quality: 0.5,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
    {
      region: 'KR',
      name: 'Republic of Korea',
      gramsPerKwh: { min: 395, mode: 436, max: 485 },
      quality: 0.7,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
    {
      region: 'US',
      name: 'United States',
      gramsPerKwh: { min: 330, mode: 369, max: 415 },
      quality: 0.7,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
    {
      region: 'EU',
      name: 'European Union',
      gramsPerKwh: { min: 210, mode: 251, max: 300 },
      quality: 0.7,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
    {
      region: 'GB',
      name: 'United Kingdom',
      gramsPerKwh: { min: 200, mode: 238, max: 285 },
      quality: 0.7,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
    {
      region: 'JP',
      name: 'Japan',
      gramsPerKwh: { min: 440, mode: 486, max: 535 },
      quality: 0.7,
      year: 2024,
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
    },
  ],
};

export const rawDataManifest: unknown = {
  schemaVersion: 1,
  datasets: [
    {
      id: 'github-pricing',
      version: '2026.08',
      path: 'data/github-pricing.json',
      source:
        'https://docs.github.com/en/billing/reference/actions-runner-pricing',
      unit: 'usd-per-minute',
      uncertainty:
        'List prices are exact as published, but actual invoices depend on included minutes, discounts, and organization billing agreements that GreenCI cannot observe.',
      effectiveDate: '2026-07-01',
      retrievedAt: '2026-08-14',
      licenseNote:
        'Factual per-minute rates reproduced with source attribution. Rates are list prices for GitHub-hosted standard runners and exclude plan-included minutes, discounts, and organization billing agreements.',
      sha256:
        '9b227940f7f3ed957be30d36a6fc1785f34843a6646a2104f0d5846355139ab2',
    },
    {
      id: 'runner-models',
      version: '2026.08',
      path: 'data/runner-models.json',
      source:
        'https://www.cloudcarbonfootprint.org/docs/methodology combined with https://docs.github.com/en/actions/reference/runners/github-hosted-runners',
      unit: 'watts',
      uncertainty:
        'Idle power, peak power, and memory power are triangular ranges rather than point values because GitHub does not publish host hardware or utilization.',
      effectiveDate: '2026-07-01',
      retrievedAt: '2026-08-14',
      licenseNote:
        'Modeled power envelopes derived from published open methodology coefficients. These are estimates for the virtual-machine share attributable to a job, not measurements of physical hardware.',
      sha256:
        '04596112e222ea051e544aba0917d9281ec5912fa83f5631fa800683b085a738',
    },
    {
      id: 'carbon-intensity',
      version: '2026.08',
      path: 'data/carbon-intensity.json',
      source: 'https://ember-energy.org/data/electricity-data-explorer/',
      unit: 'gCO2eq-per-kWh',
      uncertainty:
        'Annual average grid intensity expressed as a triangular range; the marginal intensity at execution time and the exact data-center region are unknown.',
      effectiveDate: '2026-01-01',
      retrievedAt: '2026-08-14',
      licenseNote:
        'Annual average grid carbon-intensity figures reproduced with source attribution. Values are yearly averages and do not reflect the marginal intensity at the moment a job executed.',
      sha256:
        '0171f878a57e6a37a7104d017ce51b0f3209d03b956d3bf790d71f5c626c9ab5',
    },
  ],
};
