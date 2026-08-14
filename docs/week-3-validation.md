# Week 3 exit validation

Week 3 adds the analysis that explains _why_ CI is slow: a DAG critical path,
deterministic recommendations, a confidence-gated policy engine, hardened JUnit
artifact analysis, and opt-in bounded failure diagnostics.

## Local verification

| Gate                                          | Result                          |
| --------------------------------------------- | ------------------------------- |
| Prettier                                      | pass                            |
| ESLint                                        | pass                            |
| Strict TypeScript (`tsc -b` and test project) | pass                            |
| Vitest                                        | 250 / 250                       |
| Line coverage                                 | 97.30% (threshold 85%)          |
| Branch coverage                               | 85.26% (threshold 80%)          |
| `pnpm data:verify`                            | pass                            |
| `pnpm schemas:verify`                         | pass                            |
| JSON Schema validation (ajv, draft 2020-12)   | pass                            |
| Action bundle generation                      | pass                            |
| Independent dist byte comparison              | pass                            |
| Fixture replay                                | byte-identical output on repeat |

Security tests cover the full hostile-archive matrix — zip slip, absolute and
drive-letter paths, backslash separators, null bytes, symlinks, ZIP64,
unsupported compression, oversized members, member-count limits,
compression-ratio bombs, declared/actual size mismatch, and corrupt archives —
plus XML entity payloads, credential redaction, and escape-path rejection for
annotations.

## Live repositories and tested revisions

- Action repository: `tjrgus2/GreenCI`
- Validation repository: `tjrgus2/greenci-demo`
- Final validated GreenCI commit: `f073d91778055e55e75332c08e764b139cb70e4d`
- Demo revision: `af682eb70cecbdaf8490240cf3eca06cec1f7873`

A second demo workflow, `.github/workflows/greenci-intelligence.yml`, models a
deliberately inefficient pipeline:

```text
Build ──▶ Unit test ──▶ Integration test     critical path
Security (3-way matrix)                      parallel resource hotspot
```

## Inefficient pipeline — `workflow_dispatch` on `main`

Run [31775992270](https://github.com/tjrgus2/greenci-demo/actions/runs/31775992270)

- Critical path (method `dag`): `Build` 38 s → `Unit test` 43 s →
  `Integration test` 73 s, total 154 s, 96.3% of wall-clock time
- Non-critical hotspot: `Security` matrix, 127 s of runner time (45.2% of the
  run) — the largest single consumer, delaying nobody
- Matrix mapping confidence: `medium`, reason `matrix-jobs-aggregated`
- Recommendations: `GCI-CACHE-001`, `GCI-CRITICAL-001`, `GCI-DUP-001`,
  `GCI-MATRIX-001`
- Policy: `pass`, both configured rules evaluated
- JUnit artifact: 5 test cases parsed from 1 file, slowest case
  `handles a large document`
- Failure diagnostics: disabled, as designed
- Job Summary, JSON artifact (schema `1.2.0`): succeeded

This is exactly the distinction the design asks for: `Integration test` is the
developer-waiting-time bottleneck, while `Security` is the runner-time, cost,
and carbon hotspot.

## Failure path with opt-in diagnostics — pull request

Run [31776564882](https://github.com/tjrgus2/greenci-demo/actions/runs/31776564882),
pull request <https://github.com/tjrgus2/greenci-demo/pull/2>

`Integration test` fails late after printing two TypeScript errors, with
`parse-failure-logs: 'true'` and `analysis.failure-logs.enabled: true`.

- Failed job `Integration test`, failed step `Run integration tests`, 66 s
  before failure, first failure at 98.7% of the wall-clock window
- `GCI-ORDER-001` fired, giving 5 recommendations in total
- Policy: `warn` — `failed-jobs` exceeded, `runner-time-regression-percent`
  within budget
- Diagnostics: 1 job parsed, 3 diagnostics (2 located TypeScript errors at
  confidence 0.92, 1 generic exit-code at 0.45)
- Annotations: exactly 2, verified through the check-runs API at
  `src/checkout.ts:84` and `src/checkout.ts:91`
- The GreenCI job itself still concluded `success` — annotations do not fail it

## Before and after — the competition demonstration

Pull request <https://github.com/tjrgus2/greenci-demo/pull/3> acts on the
recommendations: the dependency cache populated by `Build` now hits in the two
downstream jobs, and the full security matrix moves off pull requests.

Run [31776834036](https://github.com/tjrgus2/greenci-demo/actions/runs/31776834036),
comment
[5290307344](https://github.com/tjrgus2/greenci-demo/pull/3#issuecomment-5290307344)

| Metric                | Baseline median (before) | Current (after) |  Change |
| --------------------- | -----------------------: | --------------: | ------: |
| Wall-clock time       |                   2m 41s |          1m 53s | ▼ 29.6% |
| Runner time           |                   4m 42s |          2m 32s | ▼ 46.1% |
| List-price equivalent |                  $0.0560 |         $0.0320 | ▼ 42.9% |
| Carbon p50            |            0.4447 gCO₂eq |   0.2395 gCO₂eq | ▼ 46.1% |
| Critical path         |                  154.5 s |           109 s | ▼ 29.4% |

- Every metric verdict: `improvement`
- Recommendations dropped from 5 to 2: `GCI-DUP-001` and `GCI-MATRIX-001` stop
  firing once the duplication and the fan-out are gone
- Policy moved from `warn` to `pass`
- Critical-path confidence rose from `medium` to `high` once the matrix no longer
  needed aggregating
- Workflow shape match stayed at 100.0% with 0 exact fingerprint matches: the
  matrix cardinality changed, but the pipeline is still the same shape and
  therefore still comparable
- Carbon interval p05 0.2067 – p95 0.2757 gCO₂eq, data quality `high` (0.850)

## Scenarios exercised live

| Scenario                          | Where                                      |
| --------------------------------- | ------------------------------------------ |
| Serial CI (`needs` chain)         | `greenci-intelligence.yml`                 |
| Parallel CI                       | `greenci-live.yml`                         |
| Matrix CI                         | `Security` 3-way matrix                    |
| Duplicate dependency installation | `npm ci` in three jobs                     |
| Late failure                      | pull request 2                             |
| Expensive non-critical matrix     | `Security` at 45.2% of runner time         |
| JUnit artifact                    | `test-results` artifact, 5 cases           |
| Deliberate workflow regression    | pull request 1 (Week 2) and pull request 2 |
| Optimized workflow                | pull request 3                             |

## Bugs discovered and fixed during Week 3 validation

1. **Two GreenCI workflows in one repository fought over one comment.** With
   both `greenci-live.yml` and `greenci-intelligence.yml` analyzing the same
   pull request, the second run overwrote the first run's report, because the
   hidden marker was not scoped. The marker now carries the analyzed workflow
   path — sanitized so a hostile path cannot terminate the HTML comment early —
   and comment selection matches the scoped marker. Verified live: pull request
   2 and pull request 3 each carry one comment per workflow.

2. **Phantom diagnostics from the command-echo block.** GitHub prints a
   `##[group]Run …` block containing the script source before a `run:` step, so
   every diagnostic the script printed was also parsed out of the script text
   itself. Four annotations were emitted for two real problems. That block is
   now skipped.

3. **Duplicate annotations on one line.** Two findings that differed only in
   surrounding log text produced different fingerprints. A diagnostic
   fingerprint is now keyed on parser plus location whenever a location exists,
   so one line can only ever yield one annotation. Verified live: 2 annotations
   for 2 problems.

Each fix landed with a regression test, a regenerated bundle, an updated demo
pin, and a re-run live validation.

## Known artifacts of the fix sequence

Pull request 2 still carries one stale comment
(`5290188954`) written before the marker fix; it uses the old unscoped marker
and is therefore no longer claimed by either workflow. It is left in place as
evidence of the bug rather than deleted.

## Remaining external blockers

None. Every Week 3 exit criterion was verified against the live GitHub API.
