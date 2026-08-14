# GreenCI

GreenCI is a GitHub-native CI **performance regression** analyzer. It reads the
metadata GitHub already has about your workflow run and answers one question at
review time:

> Did this pull request make CI slower or more expensive, where, and how sure
> are we?

It reports wall-clock time, total runner time, parallelism, a robust historical
baseline comparison, list-price-equivalent cost, and an uncertainty-aware
operational carbon estimate — as one pull-request comment, one Job Summary, and
one versioned JSON artifact.

There is no GreenCI server, database, account, telemetry, or source-code upload.
The analyzer never checks out or executes pull-request code.

## Install

Run GreenCI last and list every analyzed job in `needs`:

```yaml
greenci:
  name: GreenCI
  if: always()
  needs: [build, test, lint]
  runs-on: ubuntu-latest
  permissions:
    actions: read
    contents: read
    pull-requests: write
  steps:
    - name: Analyze CI efficiency
      uses: tjrgus2/GreenCI@<FULL_COMMIT_SHA>
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

`pull-requests: write` is optional. Without it GreenCI records a warning and
falls back to the Job Summary instead of failing the job.

## What you get

| Surface               | Contents                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull-request comment  | Improvement or regression, the four headline metrics against their baseline medians, top regressions, confidence, and a collapsible estimation-details section. One comment, updated in place. |
| Job Summary           | Everything above plus per-job and per-step tables, the full baseline sample, per-job cost rounding, carbon percentiles, assumptions, and all warnings.                                         |
| `greenci-report.json` | The complete machine-readable report, validated against `schemas/report-v1.schema.json`.                                                                                                       |
| Action outputs        | `report-path`, `runner-seconds`, `carbon-p50-grams`, `carbon-p95-grams`, `list-price-usd`, `policy-conclusion`, `critical-path-seconds`, `recommendation-count`.                               |

Beyond the four headline metrics, the report separates **critical-path
bottlenecks** (what made developers wait) from **parallel resource hotspots**
(what consumed runner time, cost, and carbon), lists deterministic
evidence-backed recommendations, and evaluates an optional CI budget.

## Inputs

| Input                    | Default        | Purpose                                                                              |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| `github-token`           | required       | Reads Actions data and writes the pull-request comment.                              |
| `config-path`            | `.greenci.yml` | Repository-relative configuration path.                                              |
| `locale`                 | _(unset)_      | `en` or `ko`. Leave unset to use `.greenci.yml`, then `en`.                          |
| `baseline-runs`          | _(unset)_      | Successful base-branch runs to compare. Leave unset to use `.greenci.yml`, then `7`. |
| `parse-failure-logs`     | `false`        | Reserved for bounded failed-log parsing.                                             |
| `upload-report-artifact` | `true`         | Upload `greenci-report.json`.                                                        |

An unset `locale` or `baseline-runs` really does defer to the repository
configuration; the Action deliberately declares no value-level default for them.

## Configure

`.greenci.yml` is optional and read through the API at the analyzed revision. It
is data only: it is size-bounded, parsed with YAML aliases disabled, validated
against `schemas/config.schema.json`, and never executed. Unknown keys are
rejected so a typo fails loudly instead of silently disabling a feature.

```yaml
version: 1
locale: en

baseline:
  successful-runs: 7
  minimum-samples: 3
  workflow-shape-threshold: 0.8
  statistics:
    regression-percent: 15
    modified-z-score: 3.5

carbon:
  region: KR
  simulation-samples: 2000

report:
  pr-comment: true
  update-existing-comment: true
  top-hotspots: 5
  annotations:
    enabled: true
    max-count: 20
    min-confidence: 0.9

analysis:
  critical-path:
    enabled: true
    parse-workflow-dag: true
  # Off by default. Reads only a bounded tail of failed job logs, in memory.
  failure-logs:
    enabled: false
    max-bytes-per-job: 2097152
    max-jobs: 3
    tail-lines: 2000
  test-reports:
    - artifact: test-results
      format: junit
      max-uncompressed-bytes: 10485760

recommendations:
  enabled: true
  minimum-confidence: 0.65
  max-count: 5

# No rule is configured by default, so GreenCI cannot block a pull request
# unless you opt in.
policy:
  default-mode: warn
  rules:
    - metric: runner-time-regression-percent
      operator: greater-than
      value: 20
      mode: warn
      minimum-confidence: medium
```

## How the numbers are produced

- **Baseline** — successful runs of the same workflow on the base branch, with
  structurally incompatible runs excluded by a workflow-shape fingerprint.
- **Regression** — median and median absolute deviation with a modified
  z-score, not a comparison with the single previous run.
- **Cost** — per-job minute rounding against versioned list prices; the public
  repository charge and the list-price equivalent are shown separately, and the
  actual invoice is never claimed.
- **Carbon** — a deterministic 2000-sample Monte Carlo simulation producing p05,
  p50, and p95 with a data-quality grade and a printed assumption list.

Full details, including the zero-MAD fallback and every limitation, are in
[docs/methodology.md](docs/methodology.md). Dataset provenance is in
[docs/data-sources.md](docs/data-sources.md).

## Develop

Requirements: Node.js 24 and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm data:verify
pnpm schemas:verify
pnpm bundle
pnpm verify:dist
```

Replay a sanitized fixture offline, with no GitHub access:

```bash
pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/workflow-runs/baseline-regression.json
```

## Scope

Implemented: current-run runtime and concurrency analysis, historical baselines,
workflow-shape fingerprints, robust regression detection, cost, carbon, the
pull-request comment, English and Korean rendering, the versioned JSON report,
workflow-DAG critical-path analysis with an interval fallback, eight
deterministic recommendation rules, the confidence-gated policy engine, hardened
JUnit artifact analysis, and opt-in bounded failure-log diagnostics with
annotations.

Not yet implemented (Week 4): CodeQL, Scorecard, Dependabot, SBOM and artifact
attestation, the release workflow, and the recorded before/after demo.

## License

Apache-2.0.
