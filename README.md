<div align="center">

# 🌱 GreenCI

**Find out what a pull request did to your CI — before it becomes normal.**

<p>
  <a href="https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://github.com/tjrgus2/GreenCI/releases"><img alt="Release" src="https://img.shields.io/github/v/release/tjrgus2/GreenCI?include_prereleases&color=2ea043"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
</p>

<p>
  <a href="README.md"><b>English</b></a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="docs/methodology.md">Methodology</a> ·
  <a href="docs/security-model.md">Security</a>
</p>

</div>

---

CI gets slower one merge at a time. By the time it's unbearable, nobody remembers
which change did it.

GreenCI is a GitHub Action that catches it on the pull request. It reads what
GitHub already knows about your run — no code checkout, no agent, no external
service — compares it against a robust baseline of your own history, and tells
you **which job to actually fix.**

It also reports what that job costs you in runner minutes, money, and modeled
carbon. And when it isn't sure, it says so instead of picking a confident-looking
number.

## What it looks like

This is a real report, rendered the way GitHub shows it on your pull request.

---

**🌱 GreenCI Report**

> ⚠ Runner time increased by 88.4% against the median of 5 successful runs on `main`.

| Metric                   | Baseline median |       Current |   Change |
| ------------------------ | --------------: | ------------: | -------: |
| ⏱ Wall-clock time        |             23s |         1m 3s | ▲ 169.6% |
| 🖥 Runner time            |             43s |        1m 21s |  ▲ 88.4% |
| 💵 List-price equivalent |         $0.0240 |       $0.0320 |  ▲ 33.3% |
| 🌱 Carbon, p50           |   0.0676 gCO₂eq | 0.1269 gCO₂eq |  ▲ 87.7% |

**Confidence:** High · **Workflow shape match:** 100.0% · **Baseline samples:** 5 · **Data quality:** High

**Top regressions**

| Job / Step              | Baseline median | Current |   Change | Modified z-score |
| ----------------------- | --------------: | ------: | -------: | ---------------: |
| `Test / Simulate tests` |             20s |   1m 0s | ▲ 200.0% |                — |
| `Test`                  |             23s |   1m 3s | ▲ 173.9% |            53.96 |

**Critical path:** `Build` → `Unit test` → `Integration test` · 2m 34s · 96.3%

**What if?**

- `Integration test` −50% → critical path ▼ 23.7% · runner time ▼ 13.0%
- `Security` −50% → critical path ▬ 0.0% · runner time ▼ 22.5%

**Recommendations**

- 🟠 `GCI-CACHE-001` **Dependency installation dominates runner time** (confidence 0.85)
- 🔵 `GCI-MATRIX-001` **A matrix fan-out dominates runner consumption** (confidence 0.70)

⚠ **Policy:** Policy warning

---

Notice the last two `What if?` lines — that contrast is the whole point. Speeding
up `Integration test` shortens the wait but frees little runner time. Speeding up
`Security` frees the most runner time and shortens nobody's wait. Most tools show
you one number and let you guess which case you're in.

**See it running for real:** [a slower PR](https://github.com/tjrgus2/greenci-demo/pull/1)
· [a late failure](https://github.com/tjrgus2/greenci-demo/pull/2) · [an optimized PR](https://github.com/tjrgus2/greenci-demo/pull/3)
· [GreenCI analyzing itself](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)

## Install

Add one job. List the jobs you want analyzed in `needs`.

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

That's the whole installation. There's nothing to configure to get a first
report, and no default policy, so it can't block your pull request.

Three things worth knowing:

- **`if: always()` matters.** Without it, GreenCI gets skipped exactly when a job
  fails — which is when you most want the report.
- **`pull-requests: write` is optional.** Without it, including on fork pull
  requests where GitHub hands out a read-only token, GreenCI writes the Job
  Summary instead and records a warning.
- **Pin it if you prefer.** `@v1` moves only when the protected release workflow
  moves it. If you'd rather not trust a moving tag, pin the commit behind a
  release — every release archive is attested, so you can verify what you pinned:
  ```yaml
  - uses: tjrgus2/GreenCI@7c8f4ac36dda3f2066eb8fea358ac1b4ea25c7f7 # v1.0.0-rc.2
  ```

## What makes it different

**It won't cry wolf.** A regression needs a percentage change _and_ a robust
z-score _and_ enough samples _and_ a comparable workflow shape. One slow outlier
in your history can't trigger it. Tools that compare against the single previous
run are so noisy that people learn to ignore them — that's the failure mode this
avoids.

**It separates waiting from spending.** The job delaying your merge and the job
burning your runner minutes are usually not the same job. GreenCI rebuilds your
`needs` graph, reports both, and estimates what fixing each one would buy.

**It shows uncertainty instead of hiding it.** Carbon is a p05–p95 interval with
a data-quality grade, a printed list of assumptions, and a reproducible seed.
Never one confident number pretending to be a measurement.

**It's boring on purpose.** No server, no database, no account, no telemetry, no
LLM, no source upload. Same input, same output, every time.

## What you get

**On the pull request** — one comment, created once and updated in place. Verdict,
four headline metrics against their baseline medians, top regressions, critical
path, counterfactuals, recommendations, policy result.

**On the run page** — a Job Summary with everything above plus per-job and
per-step tables, the full baseline sample, per-job cost rounding, carbon
percentiles, test results, diagnostics, every assumption, and every warning.

**As data** — `greenci-report.json`, validated against
[`schemas/report-v1.schema.json`](schemas/report-v1.schema.json), plus eight
Action outputs you can branch on in your own steps.

**As annotations** — file and line annotations for confident diagnostics, when
failed-log parsing is switched on.

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

Everything past the API boundary is a pure function of its input.
[`packages/core`](packages/core) touches no network, filesystem, clock, or
unseeded randomness — so the same run always produces the same report, and you
can replay any analysis offline from a fixture.

<details>
<summary><b>Everything it measures</b></summary>

<br>

- **Runtime** — wall-clock time, total runner time, queue time, idle gaps, peak
  and average concurrency, per-job and per-step timing.
- **Regression detection** — median and MAD with a modified z-score over
  successful base-branch runs, with IQR and percentage-only fallbacks.
- **Workflow-shape fingerprinting** — structurally incompatible history is thrown
  out before any statistic is computed.
- **DAG critical path** — rebuilt from `jobs.<id>.needs`, with matrix expansion, a
  mapping-confidence grade, and an interval-overlap fallback that says so.
- **Counterfactual what-if** — what a 50% speed-up of the critical-path job versus
  the parallel hotspot would each buy.
- **Cost** — per-job minute rounding against versioned list prices.
- **Carbon** — deterministic 2000-sample Monte Carlo giving p05/p50/p95 with a
  data-quality grade.
- **Recommendations** — eight deterministic rules, each with an id, evidence,
  confidence, and a bounded impact estimate. No model is consulted.
- **Policy** — `report`/`warn`/`fail` over eight metrics, and it refuses to fail
  on a measurement it isn't confident about.
- **JUnit analysis** — totals, slowest suites and cases, failures, read through a
  hardened in-memory archive reader.
- **Failure diagnostics** — opt-in, bounded, credential-redacted parsing of failed
  job logs for ten toolchains, with file and line annotations.
- **English and Korean** rendering of every surface.

| Metric                     | What it means                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Wall-clock time            | Last job's end minus first job's start — roughly what a developer waited.                         |
| Runner time                | Sum of job durations — what you consumed and pay for.                                             |
| Critical path              | Longest weighted path through `needs`. Shortening it is the only way to shorten the wait.         |
| Non-critical hotspot       | Heavy runner use off the critical path. Shortening it saves money, not time.                      |
| Queue time                 | Time from job creation to start, kept separate so a scheduling delay never looks like a code bug. |
| Peak / average concurrency | Why a workflow can be fast and expensive at the same time.                                        |

</details>

## About those numbers

The easiest way to lose trust is to state something you can't back up. So:

**Cost.** GreenCI reports a **gross list-price equivalent** (runner usage ×
published per-minute rate, each job's partial minute rounded up _before_ summing,
the way GitHub bills) and an **estimated billable cost** after the public-repo
policy that makes standard runners free. It does **not** report your actual
invoice — plan credits and org billing agreements aren't visible to an Action, so
GreenCI never pretends to know your bill. An unknown runner class never gets a
price by analogy; it's excluded and named in a warning.

**Carbon.** These are **modeled operational emissions**. GreenCI does not measure
electricity, read hardware counters, or claim SCI conformity. GitHub exposes none
of CPU utilization, host hardware, host sharing, instantaneous power, data-centre
region, or facility PUE — so every one of those is sampled from a triangular
distribution across 2000 deterministic iterations and published as p05/p50/p95
with a data-quality grade, the reasons that lowered it, and the seed.

**Recommendations.** Eight hand-written rules with fixed thresholds. The
confidence number is a value we assigned per rule, not a learned probability, and
every recommendation prints the observations it came from so you can check the
arithmetic yourself.

Full derivation and the exact list of what's measured versus estimated versus
assumed: [docs/methodology.md](docs/methodology.md).

## Security

- No GreenCI server, database, or account. The only outbound destination is the
  GitHub API of the repository being analyzed.
- No telemetry, no analytics, no LLM call, no source-code upload.
- The analyzer never checks out or executes pull-request code, never runs a shell
  with repository-controlled strings, and never uses `eval`.
- `.greenci.yml`, the workflow definition, artifacts, and logs are all treated as
  untrusted input: size-bounded, alias-free YAML, schema-validated, escaped.
- Artifacts go through GreenCI's own in-memory ZIP reader, which refuses zip slip,
  absolute paths, symlinks, oversized members, and compression bombs _before_
  allocating.
- Failed-log parsing is **off by default**. Enabled, it's bounded,
  credential-redacted, processed in memory, and never persisted.
- Least privilege: `actions: read`, `contents: read`, and optionally
  `pull-requests: write`. Nothing else, ever.

Threat model and limit table: [docs/security-model.md](docs/security-model.md).
Reporting a vulnerability: [SECURITY.md](SECURITY.md).

## Configuration

`.greenci.yml` is optional, read through the API at the analyzed revision, and
validated against [`schemas/config.schema.json`](schemas/config.schema.json).
Unknown keys are rejected — and GreenCI suggests the key you probably meant.

Every example below is parsed by the test suite, so none of them can drift from
what the schema actually accepts.

<details>
<summary><b>Recommended</b> — a Korean report, a real region, a warning budget</summary>

<br>

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

</details>

<details>
<summary><b>Strict</b> — fail the GreenCI job on a confident regression</summary>

<br>

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

A `fail` rule is automatically downgraded to `warn` when the underlying
measurement is less confident than `minimum-confidence` requires. GreenCI will
not block your pull request on a number it doesn't trust.

</details>

<details>
<summary><b>Advanced</b> — test reports, failure diagnostics, tuned statistics</summary>

<br>

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

</details>

<details>
<summary><b>Action inputs and outputs</b></summary>

<br>

| Input                    | Default        | Purpose                                                                           |
| ------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `github-token`           | required       | Reads Actions data and writes the pull-request comment.                           |
| `config-path`            | `.greenci.yml` | Repository-relative configuration path.                                           |
| `locale`                 | _(unset)_      | `en` or `ko`. Unset defers to `.greenci.yml`, then `en`.                          |
| `baseline-runs`          | _(unset)_      | Successful base-branch runs to compare. Unset defers to `.greenci.yml`, then `7`. |
| `parse-failure-logs`     | `false`        | Allow bounded failed-log parsing. Also needs `analysis.failure-logs.enabled`.     |
| `upload-report-artifact` | `true`         | Upload `greenci-report.json`.                                                     |

| Output                  | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `report-path`           | Path to `greenci-report.json`.                     |
| `runner-seconds`        | Total analyzed runner time in seconds.             |
| `carbon-p50-grams`      | Median modeled operational emissions.              |
| `carbon-p95-grams`      | p95 modeled operational emissions.                 |
| `list-price-usd`        | Gross list-price equivalent.                       |
| `policy-conclusion`     | `pass`, `warn`, `fail`, or `skipped`.              |
| `critical-path-seconds` | Duration of the analyzed critical path.            |
| `recommendation-count`  | Recommendations that met the confidence threshold. |

</details>

## Run it locally

No network, no token, no GitHub:

```bash
pnpm install && pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

The committed before/after story runs in one command:

```bash
pnpm demo
```

## Limitations

Worth knowing before you install:

- **You have to list your jobs in `needs`.** GreenCI analyzes the run it belongs
  to; it can't wait for jobs it doesn't depend on.
- **Baselines come from the Actions API**, so a new repository, a rebuilt
  workflow, or a quiet branch will legitimately say "inconclusive".
- **Carbon is modeled, not measured**, and the data-centre region is unknown
  unless you configure it.
- **Cost is a list-price equivalent**, not your invoice.
- **Matrix mapping is a heuristic.** A job literally named `Build (fast)` is read
  as a matrix variant. When mapping is ambiguous GreenCI lowers the DAG
  confidence rather than guessing quietly.
- **No monthly savings projection.** See
  [ADR 0007](docs/adr/0007-no-savings-projection.md) for why, and what's reported
  instead.
- **Self-hosted runners** get timing analysis but have no price or power model, so
  cost and carbon exclude them and say so.

## Documentation

| Document                                 | What's in it                                              |
| ---------------------------------------- | --------------------------------------------------------- |
| [Methodology](docs/methodology.md)       | Every number, labelled measured / estimated / assumed.    |
| [Security model](docs/security-model.md) | Threat model, attack surfaces, and the controls for each. |
| [Architecture](docs/architecture.md)     | Boundaries, determinism, degraded modes, localization.    |
| [Data sources](docs/data-sources.md)     | Dataset provenance and how to correct one.                |
| [Demo](docs/demo.md)                     | The before/after story with real run IDs.                 |
| [Performance](docs/performance.md)       | What GreenCI itself costs to run.                         |
| [Decision records](docs/adr/README.md)   | What was chosen, what was declined, and why.              |

## Contributing

Bug reports, dataset corrections, and new recommendation rules or log parsers are
all welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md). The whole local gate
is one command:

```bash
pnpm verify:all
```

## License

[Apache-2.0](LICENSE)
