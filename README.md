# 🌱 GreenCI

**Did this pull request make CI slower or more expensive — where, and how sure
are we?**

GreenCI is a GitHub Action that answers that question on every pull request. It
reads the metadata GitHub already has about your workflow run and reports the
change in wait time, runner consumption, cost, and modeled carbon against a
statistically robust baseline — then tells you which job to actually fix.

No server, no database, no account, no telemetry, no source-code upload, no LLM.
The analyzer never checks out or executes pull-request code.

[English](README.md) · [한국어](README.ko.md)

---

## Why GreenCI

CI gets slower one merge at a time. By the time anyone notices, nobody knows
which change did it. The usual tools either compare against the single previous
run — which is so noisy that developers learn to ignore it — or hide the answer
behind a dashboard nobody opens.

GreenCI takes a different position on four things:

- **It refuses to cry wolf.** A regression needs a percentage change _and_ a
  robust z-score _and_ enough samples _and_ a comparable workflow shape. One
  slow outlier in the baseline cannot trigger it.
- **It separates waiting from spending.** The job that delays your merge and the
  job that burns your runner minutes are usually not the same job. GreenCI
  rebuilds your `needs` graph and reports both, then estimates what fixing each
  one would actually buy.
- **It shows uncertainty instead of hiding it.** Carbon is a p05–p95 interval
  with a data-quality grade, a printed assumption list, and a reproducible seed.
  Never one confident-looking number.
- **It stays out of your way.** The default installation configures no policy at
  all, so it cannot block a pull request. Without comment permission it falls
  back to the Job Summary instead of failing.

## Example pull-request comment

```md
# 🌱 GreenCI Report

> ⚠ Runner time increased by 88.4% against the median of 5 successful runs on `main`.

| Metric                   | Baseline median |       Current |   Change |
| ------------------------ | --------------: | ------------: | -------: |
| ⏱ Wall-clock time        |             23s |         1m 3s | ▲ 169.6% |
| 🖥 Runner time            |             43s |        1m 21s |  ▲ 88.4% |
| 💵 List-price equivalent |         $0.0240 |       $0.0320 |  ▲ 33.3% |
| 🌱 Carbon, p50           |   0.0676 gCO₂eq | 0.1269 gCO₂eq |  ▲ 87.7% |

**Confidence:** High · **Workflow shape match:** 100.0% · **Baseline samples:** 5 · **Data quality:** High

## Top regressions

| Job / Step              | Baseline median | Current |   Change | Modified z-score |
| ----------------------- | --------------: | ------: | -------: | ---------------: |
| `Test / Simulate tests` |             20s |   1m 0s | ▲ 200.0% |                — |
| `Test`                  |             23s |   1m 3s | ▲ 173.9% |            53.96 |

**Critical path:** `Build` → `Unit test` → `Integration test` · 2m 34s · 96.3%

**What if? (counterfactual estimates)**

- `Integration test` −50% → Critical path ▼ 23.7% · Runner time ▼ 13.0%
- `Security` −50% → Critical path ▬ 0.0% · Runner time ▼ 22.5%

## Recommendations

- 🟠 `GCI-CACHE-001` **Dependency installation dominates runner time** (Confidence 0.85)
- 🔵 `GCI-MATRIX-001` **A matrix fan-out dominates runner consumption** (Confidence 0.70)

⚠ **Policy:** Policy warning

<details><summary>Estimation and data-quality details</summary>…</details>
```

Real reports from live runs: [before](docs/demo.md#before--the-inefficient-pipeline)
and [after](docs/demo.md#after--the-optimized-pipeline).

## Quick start

Add one job. List every job you want analyzed in `needs`.

```yaml
jobs:
  build: # your existing jobs
  test:

  greenci:
    name: GreenCI
    if: always()
    needs: [build, test]
    runs-on: ubuntu-latest

    permissions:
      actions: read
      contents: read
      pull-requests: write

    steps:
      - uses: tjrgus2/GreenCI@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That is the whole installation. There is nothing to configure to get a first
report.

**Pinning.** `@v1` follows the latest v1 release and is updated only by the
protected release workflow. If you would rather not trust a moving tag, pin the
commit — this is what GreenCI's own demo repository does:

```yaml
- uses: tjrgus2/GreenCI@d15bc009041ac36bf77ef1699938cdeb5938edb2 # v1.0.0
```

**`if: always()`** matters: without it GreenCI is skipped exactly when a job
fails, which is when you most want the report.

**`pull-requests: write`** is optional. Without it — including on fork pull
requests, where GitHub grants a read-only token — GreenCI records a warning and
writes the Job Summary instead.

## What you get

| Surface               | Contents                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull-request comment  | Improvement or regression, four headline metrics against their baseline medians, top regressions, critical path, counterfactual estimates, recommendations, policy result. One comment per workflow, updated in place. |
| Job Summary           | Everything above plus per-job and per-step tables, the full baseline sample, per-job cost rounding, carbon percentiles, test results, diagnostics, assumptions, and all warnings.                                      |
| `greenci-report.json` | The complete machine-readable report, validated against [`schemas/report-v1.schema.json`](schemas/report-v1.schema.json).                                                                                              |
| Annotations           | File and line annotations for confident diagnostics, when failed-log parsing is enabled.                                                                                                                               |
| Action outputs        | `report-path`, `runner-seconds`, `carbon-p50-grams`, `carbon-p95-grams`, `list-price-usd`, `policy-conclusion`, `critical-path-seconds`, `recommendation-count`.                                                       |

## Features

- **Runtime analysis** — wall-clock time, total runner time, queue time, idle
  gaps, peak and average concurrency, per-job and per-step timing.
- **Robust regression detection** — median and MAD with a modified z-score over
  successful base-branch runs, with an IQR and percentage-only fallback.
- **Workflow-shape fingerprinting** — structurally incompatible history is
  excluded before any statistic is computed.
- **DAG critical path** — rebuilt from `jobs.<id>.needs`, with matrix expansion,
  a mapping-confidence grade, and an interval-overlap fallback that is labelled
  as such.
- **Counterfactual what-if** — what a 50% speed-up of the critical-path job
  versus the parallel hotspot would each buy.
- **Cost** — per-job minute rounding against versioned list prices, with the
  public-repository charge and the list-price equivalent kept separate.
- **Carbon** — deterministic 2000-sample Monte Carlo producing p05/p50/p95 with
  a data-quality grade.
- **Recommendations** — eight deterministic rules, each with a rule id,
  evidence, confidence, and a bounded impact estimate.
- **Policy engine** — `report`/`warn`/`fail` over eight metrics, and it refuses
  to fail on a measurement it is not confident about.
- **JUnit analysis** — totals, slowest suites and cases, failed cases, read
  through a hardened in-memory archive reader.
- **Failure diagnostics** — opt-in, bounded, credential-redacted parsing of
  failed job logs for ten toolchains, with annotations.
- **English and Korean** report rendering.
- **Offline replay** — reproduce any analysis from a sanitized fixture with no
  network access.

## How it works

```text
Your build / test / lint jobs finish
        ↓
GreenCI job runs with if: always()
        ↓
Reads the run, its jobs and steps, the workflow definition,
.greenci.yml, and successful base-branch history — GitHub API only
        ↓
Excludes itself · rebuilds the needs graph · fingerprints the shape
        ↓
Robust statistics · cost · carbon · critical path · counterfactuals
        ↓
Recommendations · policy
        ↓
One PR comment · one Job Summary · one JSON artifact
```

Everything after the API boundary is a pure function of its input:
[`packages/core`](packages/core) performs no network, filesystem, clock, or
unseeded random access, so the same run always produces the same report.

## Metrics

| Metric                     | Meaning                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Wall-clock time            | Latest job completion minus earliest job start — roughly what a developer waited.                                    |
| Runner time                | Sum of job durations — what you consumed and pay for.                                                                |
| Critical path              | Longest weighted path through `needs`; shortening it is the only way to shorten the wait.                            |
| Non-critical hotspot       | High runner consumption off the critical path; shortening it saves money, not time.                                  |
| Queue time                 | Time between job creation and start, reported separately so a scheduling delay is never presented as a code problem. |
| Peak / average concurrency | Why a workflow can be fast and expensive at once.                                                                    |

## Cost

GreenCI reports two figures and refuses to report a third:

- **Gross list-price equivalent** — runner usage × published per-minute rate,
  with each job's partial minute rounded up _before_ summing, the way GitHub
  bills.
- **Estimated billable cost** — the above after the known public-repository
  policy, which makes standard runners free.
- **Actual invoice cost** — _not calculated._ Plan credits and organization
  billing agreements are not visible to an Action, so GreenCI never pretends to
  know your bill.

An unknown runner class is never given a price by analogy; it is excluded and
named in a warning.

## Carbon

GreenCI reports **modeled operational emissions**. It does not measure
electricity, does not read hardware counters, and does not claim SCI conformity.

GitHub does not expose CPU utilization, host hardware, host sharing,
instantaneous power, data-centre region, or facility PUE. Every one of those is
therefore sampled from a triangular distribution across 2000 deterministic Monte
Carlo iterations, and the result is published as p05/p50/p95 with a weighted
data-quality grade, the reasons that lowered it, and the seed.

Full derivation, dataset provenance, and the exact list of what is measured
versus estimated versus assumed: [docs/methodology.md](docs/methodology.md).

## Security and privacy

- No GreenCI server, database, or account. The only outbound destination is the
  GitHub API of the repository being analyzed.
- No telemetry, no analytics, no LLM call, no source-code upload.
- The analyzer does not check out pull-request code, does not run a shell with
  repository-controlled strings, and does not use `eval`.
- `.greenci.yml`, the workflow definition, artifacts, and logs are all treated as
  untrusted data: size-bounded, alias-free YAML, schema-validated, escaped.
- Artifacts are read by GreenCI's own in-memory ZIP reader, which refuses zip
  slip, absolute paths, symlinks, oversized members, and compression bombs
  before allocating.
- Failed-log parsing is **off by default**. When enabled it is bounded,
  credential-redacted, processed in memory, and never persisted.
- Least privilege: `actions: read`, `contents: read`, and optionally
  `pull-requests: write`. Nothing else, ever.

Threat model and the full limit table:
[docs/security-model.md](docs/security-model.md). Vulnerability reporting:
[SECURITY.md](SECURITY.md).

## Configuration

`.greenci.yml` is optional, read through the API at the analyzed revision, and
validated against [`schemas/config.schema.json`](schemas/config.schema.json).
Unknown keys are rejected — and GreenCI suggests the key you probably meant.

**Minimal** — no file at all. Every default is documented below.

**Recommended** — a Korean report, a real region, and a warning budget:

```yaml
version: 1
locale: ko

carbon:
  region: KR

policy:
  rules:
    - metric: runner-time-regression-percent
      operator: greater-than
      value: 25
      mode: warn
```

**Strict CI budget** — fail the GreenCI job on a confident regression:

```yaml
version: 1

policy:
  default-mode: warn
  rules:
    - metric: runner-time-regression-percent
      operator: greater-than
      value: 20
      mode: fail
      minimum-confidence: high
    - metric: carbon-p95-grams
      operator: greater-than
      value: 10
      mode: warn
    - metric: failed-jobs
      operator: greater-than
      value: 0
      mode: warn
```

A `fail` rule is downgraded to `warn` automatically when the underlying
measurement is less confident than `minimum-confidence` requires.

**Advanced analysis** — test reports, failure diagnostics, tuned statistics:

```yaml
version: 1

baseline:
  branch: main
  successful-runs: 10
  minimum-samples: 5
  workflow-shape-threshold: 0.85
  statistics:
    regression-percent: 10
    modified-z-score: 3
carbon:
  region: EU
  simulation-samples: 4000
analysis:
  what-if:
    speedup-percent: 30
  failure-logs:
    enabled: true
    max-jobs: 2
  test-reports:
    - artifact: test-results
      format: junit
report:
  top-hotspots: 8
  annotations:
    min-confidence: 0.9
recommendations:
  minimum-confidence: 0.6
  max-count: 8
```

Every documented example is parsed by the test suite, so these cannot drift from
what the schema accepts.

### Inputs

| Input                    | Default        | Purpose                                                                           |
| ------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `github-token`           | required       | Reads Actions data and writes the pull-request comment.                           |
| `config-path`            | `.greenci.yml` | Repository-relative configuration path.                                           |
| `locale`                 | _(unset)_      | `en` or `ko`. Unset defers to `.greenci.yml`, then `en`.                          |
| `baseline-runs`          | _(unset)_      | Successful base-branch runs to compare. Unset defers to `.greenci.yml`, then `7`. |
| `parse-failure-logs`     | `false`        | Allow bounded failed-log parsing. Also requires `analysis.failure-logs.enabled`.  |
| `upload-report-artifact` | `true`         | Upload `greenci-report.json`.                                                     |

## CLI

Reproduce any analysis offline, with no network access:

```bash
pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

The committed before/after demonstration runs in one command:

```bash
pnpm demo
```

## Architecture

```text
packages/core            pure analysis and rendering, no @actions/*, no I/O
packages/github-action   GitHub adapters and every side effect
packages/cli             offline fixture replay
data/                    versioned datasets with SHA-256 provenance
schemas/                 generated from the Zod contracts
```

See [docs/architecture.md](docs/architecture.md) and
[docs/adr/](docs/adr/README.md) for the decisions and their trade-offs.

## Limitations

Worth knowing before you install:

- **You must list your jobs in `needs`.** GreenCI analyzes the run it is part of;
  it cannot wait for jobs it does not depend on.
- **Baselines come from the Actions API**, so a new repository, a rebuilt
  workflow, or a quiet branch will legitimately produce "inconclusive".
- **Carbon is modeled, not measured**, and the data-centre region is unknown
  unless you configure it.
- **Cost is a list-price equivalent**, not your invoice.
- **Matrix mapping is a heuristic.** A job literally named `Build (fast)` is
  treated as a matrix variant; GreenCI lowers the DAG confidence when mapping is
  ambiguous rather than guessing silently.
- **No monthly projection.** See [ADR 0007](docs/adr/0007-no-savings-projection.md)
  for why, and what is reported instead.
- **Self-hosted runners** are analyzed for timing but have no price or power
  model, so cost and carbon exclude them and say so.

## Contributing

Bug reports, dataset corrections, and new recommendation rules or log parsers
are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the whole local
gate is one command:

```bash
pnpm verify:all
```

## License

[Apache-2.0](LICENSE).
