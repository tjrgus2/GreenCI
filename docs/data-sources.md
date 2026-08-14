# Data sources and provenance

GreenCI bundles every model it needs so that an analysis is reproducible and no
repository data ever leaves GitHub. There is no runtime call to a pricing or
carbon API.

## Layout

```text
data/github-pricing.json      per-minute list prices for GitHub-hosted runners
data/runner-models.json       modeled power envelopes per runner class
data/carbon-intensity.json    grid carbon intensity per region
data/manifest.json            generated provenance record with SHA-256 digests
```

`data/*.json` is the source of truth. Two artifacts are generated from it and
committed:

- `packages/core/src/datasets/generated.ts` — the embedded copy compiled into
  `@greenci/core`, so the pure engine needs no filesystem access and the Action
  bundle stays self-contained;
- `data/manifest.json` — id, version, path, source, unit, uncertainty note,
  effective date, retrieval date, licence note, and the SHA-256 of each file.

```bash
pnpm data:write    # regenerate the manifest and the embedded copy
pnpm data:verify   # fail if either output has drifted from data/*.json
```

`pnpm data:verify` is part of the release gate, exactly like the Action bundle
verification. Every report embeds the manifest entries, so a reader can tell
which dataset version produced a number.

## Dataset requirements

Each dataset records `datasetId`, `version`, `modelVersion`, `unit`, `source`,
`effectiveDate`, `retrievedAt`, and `licenseNote`. Every estimated physical
quantity is a triangular `{min, mode, max}` range rather than a point value, and
each entry carries a `quality` score in `[0, 1]` that feeds the report's
data-quality grade.

## `github-pricing`

Published GitHub Actions per-minute list prices for standard GitHub-hosted
runners, with `standardPublicFree` recording whether the current public
repository policy waives the charge. Runner classes that are not listed are
never priced by analogy: they are surfaced as unknown.

These are list prices. Included plan minutes, discounts, and organization
billing agreements are invisible to the Action, so GreenCI never presents a
figure as an invoice total.

## `runner-models`

Modeled power envelopes for the virtual-machine share attributable to a job,
derived from the published Cloud Carbon Footprint methodology coefficients
combined with GitHub's documented runner specifications.

These are the least certain inputs in the system and the ranges are deliberately
wide:

- GitHub does not publish host CPU models or how many jobs share a host.
- Standard Linux runners have been documented as 2 vCPU / 7 GiB, while larger
  public-repository runners have also been served; the range covers both.
- Apple-silicon and Intel macOS hosts are not covered by public cloud power
  studies, so their `quality` score is the lowest in the dataset.

## `carbon-intensity`

Annual average grid carbon intensity per region, in gCO2eq/kWh, expressed as a
range. Two limitations are recorded in the manifest and in every report:

1. Annual averages are not the marginal intensity at the moment a job ran.
2. GitHub does not publish the execution region. GreenCI uses the region from
   `.greenci.yml` when it is configured, and otherwise falls back to the global
   average with `regionResolved: false` and a lower data-quality grade. It never
   infers a data-centre location.

## Supported carbon regions

`carbon.region` accepts any `region` code in `data/carbon-intensity.json`.
Today that is:

| Code     | Region                             |
| -------- | ---------------------------------- |
| `GLOBAL` | Global average grid (the fallback) |
| `KR`     | Republic of Korea                  |
| `US`     | United States                      |
| `EU`     | European Union                     |
| `GB`     | United Kingdom                     |
| `JP`     | Japan                              |

An unrecognized code falls back to `GLOBAL`, sets `regionResolved: false`, lowers
the data-quality grade, and emits `CARBON_REGION_UNKNOWN`. GreenCI never guesses
a region from repository metadata, because GitHub does not publish where a job
ran. Missing a region you need is a
[dataset correction](https://github.com/tjrgus2/GreenCI/issues/new?template=dataset_update.yml),
not a bug.

## Supported runner classes

`data/github-pricing.json` and `data/runner-models.json` cover `linux-x64`,
`linux-arm64`, `windows-x64`, `macos-x64`, and `macos-arm64`. Anything else —
including self-hosted runners and `windows-arm64` — is deliberately absent rather
than approximated: those jobs still get full timing analysis, are excluded from
the cost and carbon totals, and are named in `RUNNER_PRICE_UNKNOWN` and
`RUNNER_MODEL_UNKNOWN`.

## Updating a dataset

1. Edit the relevant `data/*.json` file, updating `version`, `effectiveDate`,
   `retrievedAt`, and the per-entry `source`.
2. Run `pnpm data:write`.
3. Commit the dataset, the regenerated manifest, and the regenerated embedded
   copy together, in a reviewable pull request.
4. Run `pnpm bundle` so the Action distribution contains the new values.

Automated fetching may propose a change, but a human review is required before
release.
