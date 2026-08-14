# Week 2 exit validation

Week 2 turns GreenCI from a current-run analyzer into a CI performance
regression analyzer: historical baselines, workflow-shape fingerprints, robust
statistics, cost, uncertainty-aware carbon, the pull-request comment, and
Korean rendering.

## Local verification

| Gate                                          | Result                                                            |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Prettier                                      | pass                                                              |
| ESLint                                        | pass                                                              |
| Strict TypeScript (`tsc -b` and test project) | pass                                                              |
| Vitest                                        | 135 / 135                                                         |
| Line coverage                                 | 97.70% (threshold 85%)                                            |
| Branch coverage                               | 86.66% (threshold 80%)                                            |
| `pnpm data:verify`                            | manifest and embedded copy match `data/*.json`                    |
| `pnpm schemas:verify`                         | published JSON Schemas match the Zod contracts                    |
| JSON Schema validation (ajv, draft 2020-12)   | a generated report validates; an extra field is rejected          |
| Action bundle generation                      | pass                                                              |
| Independent dist byte comparison              | pass                                                              |
| Fixture replay                                | `baseline-regression.json` reproduces byte-identical output twice |

Property-based tests (fast-check) cover the required invariants: cost and carbon
are non-negative, `p05 ≤ p50 ≤ p95`, identical input and seed produce identical
output, adding a non-negative job never reduces runner time or cost, triangular
samples stay inside their support, and no statistic yields `NaN` or `Infinity`.

## Live repositories and tested revisions

- Action repository: `tjrgus2/GreenCI`
- Validation repository: `tjrgus2/greenci-demo`
- Final validated GreenCI commit: `f0e6053e9c7cd924c70d8237ec0d0a9e80f907a4`
- Demo pull request: <https://github.com/tjrgus2/greenci-demo/pull/1>

Five successful `main` runs were produced first so that a real baseline existed:
`31773159458` (push), `31773168772`, `31773176508`, `31773183971`
(workflow_dispatch), plus the retained Week 1 run `29738767101`.

## Baseline path — `workflow_dispatch` on `main`

Run [31773183971](https://github.com/tjrgus2/greenci-demo/actions/runs/31773183971)

- Baseline retrieval: 4 successful `main` runs collected, status `ready`
- Workflow shape fingerprint: `5e45491860f95547…`, 4 of 4 exact matches
- Shape similarity: 1.000
- Median / MAD: wall-clock 23 s / 0.5, runner time 43.5 s / 0.5
- Verdict: `stable` for every metric, confidence `medium`
- Cost: list-price equivalent `$0.0240`, estimated charge `$0.00`
  (`standard-public-free`), 3 billable minutes
- Carbon: p05 0.0575, p50 0.0676, p95 0.0803 gCO₂eq, region `KR` resolved from
  `.greenci.yml`, data quality `high` (0.850)
- Warnings: none
- Job Summary, JSON artifact, schema `1.1.0`: all succeeded

The first push run [31773159458](https://github.com/tjrgus2/greenci-demo/actions/runs/31773159458)
found only one comparable historical run and correctly reported
`insufficient-samples` with no regression claim.

## Regression path — pull request

Run [31773957999](https://github.com/tjrgus2/greenci-demo/actions/runs/31773957999)
(final revision), comment
[5289869311](https://github.com/tjrgus2/greenci-demo/pull/1#issuecomment-5289869311)

The pull request slows `Test` from `sleep 20` to `sleep 60`.

| Metric             | Baseline median | Current |   Change |     z | Verdict    | Confidence |
| ------------------ | --------------: | ------: | -------: | ----: | ---------- | ---------- |
| wall-clock-seconds |              23 |      62 | ▲ 169.6% | 26.31 | regression | high       |
| runner-seconds     |              43 |      81 |  ▲ 88.4% | 25.63 | regression | high       |
| carbon-p50-grams   |            0.07 |    0.13 |  ▲ 87.7% | 34.34 | regression | high       |
| list-price-usd     |           0.024 |   0.032 |  ▲ 33.3% |     — | regression | low        |

- Baseline samples: 5, shape similarity 1.000, 5 exact matches
- Top regressions ranked `Test / Simulate tests` (▲ 200.0%) above `Test`
  (▲ 173.9%)
- Cost: `$0.0320` list-price equivalent, `$0.00` estimated charge, 4 billable
  minutes
- Carbon: p05 0.1046, p50 0.1269, p95 0.1558 gCO₂eq, seed `bbd93c61eb45060f…`
- Peak concurrency 3, average concurrency 1.306
- Warnings: none

`list-price-usd` shows `unavailable` as its scale method because every baseline
run cost exactly the same: the percentage-only fallback applies and confidence
is correctly reduced to `low`.

## Pull-request comment idempotency

Five pull-request runs were executed against the same pull request. Comment
`5289869311` was created once and updated four times; the comment count stayed
at `1` throughout, and the unrelated comment authored by another account was
never touched.

## Degraded modes verified live

| Scenario                     | Run                       | Result                                                                                                           |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Insufficient baseline        | 31773159458               | `insufficient-samples`, no regression claimed                                                                    |
| Korean rendering             | 31773595114               | Full report rendered in Korean; JSON fields and console logs stayed English                                      |
| Unknown carbon region (`ZZ`) | 31773595114               | Fell back to `GLOBAL`, `regionResolved: false`, grade dropped `high` → `medium`, `CARBON_REGION_UNKNOWN` warning |
| Invalid configuration        | 31773700441 / 31773863416 | Bundled defaults used with a `CONFIG_INVALID` warning naming the rejected key                                    |

Unknown runner price and power models cannot be triggered with GitHub-hosted
`ubuntu`/`windows`/`macos` labels, because every one of them resolves to a
modeled runner class. That path is covered by unit tests, which assert that an
unknown class is excluded from cost and carbon totals rather than inheriting an
unrelated price or power model.

## Bugs discovered and fixed during Week 2 validation

1. **Historical jobs had no durations.** The jobs API returns timestamps, not
   durations. The baseline compared raw API jobs, so every historical runner
   time was `0` and no regression could ever be detected. Baseline samples now
   run through the same duration recalculation as the current run.
   Found by the new baseline unit tests before the first live run.

2. **The analyzer job was excluded from the current run but not from history.**
   Historical runs contain a _completed_ GreenCI job, so every baseline looked
   structurally different and shape similarity landed exactly on the `0.80`
   threshold — real history could be silently discarded. The analyzer's logical
   job id is now filtered out of baseline samples too. Live runs went from
   "0 comparable runs" risk to 5 of 5 exact shape matches.

3. **A zero modified z-score was printed next to a large regression.** The
   `Test / Simulate tests` step had an identical duration in every baseline run,
   so MAD and IQR were both zero and the percentage-only fallback applied
   correctly — but the table still rendered `0.00`, which reads as "no
   deviation". The column now shows an explicit absence when no robust scale
   exists. Found in the first live pull-request comment.

4. **An unrecognized configuration key produced an unactionable warning.** The
   strict schema rejected `report-comment` with `(root): Invalid input`. The
   warning now names the offending key. Found while validating the invalid
   configuration degradation path.

Each fix landed with a regression test, a regenerated bundle, an updated demo
pin, and a re-run live validation.

## Remaining external blockers

None. Every Week 2 exit criterion was verified against the live GitHub API.
