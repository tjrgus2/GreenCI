<div align="center">

# 🌱 GreenCI

**Which job made CI slower, and what it costs you.**

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

CI gets slower one merge at a time. By the time someone complains, the cause is
twenty commits back.

GreenCI runs as a job inside your workflow and reports what the current pull
request changed. It reads the Actions API — the run, its jobs and steps, the
workflow file, and your recent successful runs on the base branch — then compares
this run against the median and MAD of that history.

The hard part isn't measuring; it's knowing which job to fix. The job that delays
your merge and the job that eats your runner minutes are often different jobs, so
the critical path and runner consumption are reported separately.

## What the report looks like

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

Here `Integration test` drives the wait and `Security` drives the runner cost.

Live runs: [a slower PR](https://github.com/tjrgus2/greenci-demo/pull/1) ·
[a late failure](https://github.com/tjrgus2/greenci-demo/pull/2) ·
[an optimized PR](https://github.com/tjrgus2/greenci-demo/pull/3) ·
[GreenCI on itself](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)

## Install

One job. List the jobs you want analyzed in `needs`.

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

That's the whole installation. There's no default policy, so it can't fail your
pull request until you write one.

`if: always()` is the part people forget. Leave it out and GreenCI gets skipped
whenever a job fails, which is when you wanted the report.

`pull-requests: write` is optional. Without it — fork pull requests get a
read-only token, so this happens on its own — GreenCI writes the Job Summary and
records a warning instead.

`@v1` moves only when the release workflow moves it. To pin harder, use the commit
behind a release; release archives carry build provenance, so you can verify what
you pinned.

```yaml
- uses: tjrgus2/GreenCI@545fcc230d574851cdb50484ad09beceeb37c2ea # v1.0.0
```

## What it reports

| Where                 | What                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request          | One comment, created once and updated in place: verdict, four headline metrics against their baseline medians, top regressions, critical path, counterfactuals, policy.   |
| Run page              | A Job Summary with the above plus per-job and per-step tables, the whole baseline sample, per-job cost rounding, carbon percentiles, test results, assumptions, warnings. |
| `greenci-report.json` | The full report, validated against [`schemas/report-v1.schema.json`](schemas/report-v1.schema.json), plus eight Action outputs you can branch on.                         |
| Annotations           | File and line annotations for confident diagnostics, if you turn on failed-log parsing.                                                                                   |

<details>
<summary><b>Everything it measures</b></summary>

<br>

- **Runtime** — wall-clock time, runner time, queue time, idle gaps, peak and
  average concurrency, per-job and per-step timing.
- **Regression detection** — median and MAD with a modified z-score, plus IQR and
  percentage-only fallbacks.
- **Workflow-shape fingerprinting** — structurally incompatible history is dropped
  before any statistic runs.
- **DAG critical path** — rebuilt from `jobs.<id>.needs`, with matrix expansion, a
  mapping-confidence grade, and an interval-overlap fallback that is labelled as
  one.
- **Counterfactuals** — what a 50% speed-up of the critical-path job and of the
  parallel hotspot would each buy.
- **Cost** — per-job minute rounding against versioned list prices.
- **Carbon** — 2000-sample Monte Carlo giving p05/p50/p95 and a data-quality grade.
- **Recommendations** — eight deterministic rules with evidence and bounded impact.
- **Policy** — `report`/`warn`/`fail` over eight metrics.
- **JUnit** — totals, slowest suites and cases, failures, read through a hardened
  in-memory archive reader.
- **Failure diagnostics** — opt-in, bounded, credential-redacted parsing of failed
  job logs for ten toolchains.
- **English and Korean** across every rendered surface.

| Metric                     | What it means                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Wall-clock time            | Last job's end minus first job's start. Close to what a developer waited.                     |
| Runner time                | Sum of job durations. What you consumed and pay for.                                          |
| Critical path              | Longest weighted path through `needs`. Shortening it is the only way to shorten the wait.     |
| Non-critical hotspot       | Heavy runner use off the critical path. Shortening it saves money and no time.                |
| Queue time                 | Job creation to job start, kept separate so a scheduling delay doesn't read as a code change. |
| Peak / average concurrency | Why a workflow can be fast and expensive at once.                                             |

</details>

## How it decides something regressed

Four conditions have to hold at once: the percentage change clears its threshold,
the modified z-score against the baseline median and MAD clears its own, there are
enough samples, and the workflow shape still matches. A single slow run in your
history can't trip it.

Shape matching runs first. GreenCI fingerprints job ids, `needs` edges, step keys,
and runner classes, and drops historical runs that differ by more than the
configured similarity. Without that step the statistics would be comparing two
different workflows.

When there's no usable scale (identical samples, so MAD is zero) it falls back to
IQR, then to a plain percentage comparison with confidence forced to low. Every
verdict carries its grade, and a `fail` policy rule downgrades itself to `warn`
when the measurement behind it isn't confident enough.

## Cost and carbon

Cost is a **list-price equivalent**: runner usage times the published per-minute
rate, with each job's partial minute rounded up before summing, the way GitHub
bills. Under the public-repository policy that makes standard runners free, the
estimated billable figure is reported separately. Your actual invoice isn't
calculated — plan credits and org billing agreements aren't visible to an Action.
Unknown runner classes get no price by analogy; they're excluded and named in a
warning.

Carbon is **modeled operational emissions**, not a measurement. GitHub exposes
none of CPU utilization, host hardware, host sharing, instantaneous power,
data-centre region, or facility PUE, so each one is sampled from a triangular
distribution across 2000 deterministic iterations. The result is p05/p50/p95 with
a data-quality grade, the reasons that lowered it, the assumptions, and the seed.

[docs/methodology.md](docs/methodology.md) has the derivation and labels every
number as measured, estimated, assumed, user-configured, or dataset-derived.

## Recommendations

Eight hand-written rules with fixed thresholds — no model is consulted. Each one
prints the observations it fired on, so the arithmetic is checkable:

```text
🟠 GCI-CACHE-001  Dependency installation dominates runner time  (confidence 0.85)
   install-seconds: 75          →  75 ≥ 20 ✓
   install-share-percent: 26.8  →  26.8% ≥ 15% ✓
   estimated saving: 53s        →  75 × 0.7
```

The confidence value is a constant assigned per rule, not a learned probability.
`GCI-CRITICAL-001` reports 0.85 when the `needs` graph was read directly and 0.50
when the critical path came from the interval fallback. Rules live in
[`packages/core/src/recommendation/rules.ts`](packages/core/src/recommendation/rules.ts)
and a new one is a reasonable first contribution.

## Security

The whole design follows from one decision: GreenCI reads metadata and never
handles your code. There is no GreenCI service to send anything to.

- Outbound traffic goes to exactly one place: the GitHub API of the repository
  being analyzed. No telemetry, no analytics, no model API.
- The analyzer works from the Actions API alone. It does not check out the pull
  request, pass repository-controlled strings to a shell, or use `eval`.
- `.greenci.yml`, the workflow file, artifacts, and logs are untrusted input:
  size-bounded, alias-free YAML, schema-validated, escaped.
- Artifacts go through GreenCI's own in-memory ZIP reader, which rejects zip slip,
  absolute paths, symlinks, oversized members, and compression bombs before
  allocating.
- Failed-log parsing is off by default. Enabled, it stays in memory, bounded and
  credential-redacted, and is never written to disk.
- Permissions: `actions: read`, `contents: read`, and optionally
  `pull-requests: write`.

Threat model and limits: [docs/security-model.md](docs/security-model.md).
Reporting a vulnerability: [SECURITY.md](SECURITY.md).

## Configuration

`.greenci.yml` is optional. It's read through the API at the analyzed revision and
validated against [`schemas/config.schema.json`](schemas/config.schema.json);
unknown keys are rejected, with a suggestion for the key you probably meant. Every
example below is parsed by the test suite, so none of them can drift from the
schema.

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

</details>

<details>
<summary><b>Advanced</b> — test reports, failure diagnostics, tuned statistics</summary>

<br>

Most of these are fine at their defaults.

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
| `locale`                 | unset          | `en` or `ko`. Unset defers to `.greenci.yml`, then `en`.                          |
| `baseline-runs`          | unset          | Successful base-branch runs to compare. Unset defers to `.greenci.yml`, then `7`. |
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

Replay a committed fixture offline, no GitHub involved:

```bash
pnpm install && pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/demo/inefficient.json
```

`pnpm demo` replays the committed before/after pair and prints the comparison.

## Limitations

- You have to list your jobs in `needs`. GreenCI analyzes the run it belongs to
  and can't wait for jobs it doesn't depend on.
- Baselines come from the Actions API. A new repository, a rebuilt workflow, or a
  quiet branch will say "inconclusive", and that's the correct answer.
- Carbon is modeled. The data-centre region is unknown unless you configure it.
- Cost is a list-price equivalent, not your invoice.
- Matrix mapping is a heuristic: a job literally named `Build (fast)` reads as a
  matrix variant. Ambiguous mapping lowers the DAG confidence instead of guessing
  quietly.
- No monthly savings projection —
  [ADR 0007](docs/adr/0007-no-savings-projection.md) explains why.
- Self-hosted runners get timing analysis but have no price or power model, so
  cost and carbon exclude them and say so.

## Documentation

| Document                                 | Contents                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| [Methodology](docs/methodology.md)       | Every number labelled measured / estimated / assumed.    |
| [Security model](docs/security-model.md) | Threat model, attack surfaces, and the control for each. |
| [Architecture](docs/architecture.md)     | Boundaries, determinism, degraded modes, localization.   |
| [Data sources](docs/data-sources.md)     | Dataset provenance and how to correct one.               |
| [Demo](docs/demo.md)                     | The before/after story with real run IDs.                |
| [Performance](docs/performance.md)       | What GreenCI itself costs to run.                        |
| [Decision records](docs/adr/README.md)   | What was chosen, what was declined, and why.             |

## Contributing

Bug reports, dataset corrections, new recommendation rules, and new log parsers
are all welcome — [CONTRIBUTING.md](CONTRIBUTING.md) has the details. The local
gate is one command:

```bash
pnpm verify:all
```

## License

[Apache-2.0](LICENSE)
