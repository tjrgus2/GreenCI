# Estimation methodology

This document explains exactly what GreenCI calculates and what it refuses to
claim. Every number in a report is reproducible from the report itself: it
records the GreenCI version, report schema version, configuration hash, dataset
versions, and simulation seed.

## 0. What is measured, what is not

The single most important thing to understand about GreenCI is which of its
numbers are observations and which are model output. Every input is classified
here, and the classification is why carbon is published as an interval rather
than a number.

| Quantity                                                         | Class                                               | Source                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Job and step start and completion times                          | **Measured**                                        | GitHub Actions API                                                     |
| Job conclusion, run attempt, run identity                        | **Measured**                                        | GitHub Actions API                                                     |
| Wall-clock time, runner time, queue time, idle gaps, concurrency | **Derived** (arithmetic on measured timestamps)     | GreenCI                                                                |
| Runner labels and runner class                                   | **Platform metadata**                               | GitHub Actions API, normalized by GreenCI                              |
| `needs` graph and matrix declarations                            | **Platform metadata**                               | The workflow definition at the analyzed commit                         |
| Baseline sample                                                  | **Measured** (of other runs)                        | GitHub Actions API                                                     |
| Median, MAD, modified z-score, verdicts                          | **Derived**                                         | GreenCI                                                                |
| Per-minute runner price                                          | **Dataset**                                         | `data/github-pricing.json`, published vendor rates                     |
| Billable minutes, list-price equivalent                          | **Derived**                                         | GreenCI, per-job rounding                                              |
| Actual invoice cost                                              | **Not produced**                                    | Plan credits and billing agreements are invisible to an Action         |
| Runner idle power, peak power, memory power                      | **Estimated model**                                 | `data/runner-models.json`, ranges from published methodology           |
| CPU utilization                                                  | **Modeled**                                         | Triangular distribution, user-configurable                             |
| Power usage effectiveness (PUE)                                  | **Modeled / user configured**                       | Triangular distribution, defaults from published industry ranges       |
| Data-centre region                                               | **User configured**, otherwise a disclosed fallback | `.greenci.yml`; GitHub does not publish it and GreenCI never infers it |
| Grid carbon intensity                                            | **Dataset**                                         | `data/carbon-intensity.json`, annual averages with a range             |
| Energy, operational carbon (p05/p50/p95)                         | **Modeled estimate**                                | Monte Carlo over the rows above                                        |
| Data-quality score and grade                                     | **Derived**                                         | Weighted over how much of the above was known                          |
| Counterfactual what-if figures                                   | **Counterfactual estimate**                         | The same models re-run over hypothetical durations                     |

GreenCI does not measure watts, does not read a power meter, does not know which
physical host or data centre executed a job, and does not know your invoice. Where
a value is unknown it is excluded and named in a warning, never substituted.

### Why Monte Carlo

Six of the carbon inputs above are ranges, not values. Propagating ranges through
a multiplication chain by hand gives either a false point estimate (multiply the
modes) or a uselessly wide bound (multiply the extremes). Sampling the
distributions jointly gives the actual shape of the result, which is what p05,
p50, and p95 report.

Making it deterministic — seeding from run identity, configuration hash, and model
version — means the interval is reproducible rather than merely plausible: re-run
the analysis and you get the same three numbers, and the report prints the seed so
you can check.

## 1. Runtime

| Metric              | Definition                                                  |
| ------------------- | ----------------------------------------------------------- |
| Wall-clock time     | `max(job.completedAt) − min(job.startedAt)`                 |
| Active time         | Union of job intervals, excluding idle gaps                 |
| Idle gaps           | Wall-clock time during which no analyzed job was running    |
| Runner time         | `Σ job.durationSeconds`                                     |
| Peak concurrency    | Maximum simultaneous jobs from a sweep-line over job events |
| Average concurrency | `runnerSeconds / wallClockSeconds`                          |

Wall-clock time answers "how long did the developer wait"; runner time answers
"how much compute was consumed". A highly parallel workflow can be fast and
expensive at the same time, so both are always shown.

Jobs or steps with incomplete timestamps are excluded from totals and reported
through the `JOB_TIMESTAMPS_INCOMPLETE` / `STEP_TIMESTAMPS_INCOMPLETE` warnings
rather than being silently treated as zero-length.

## 2. Workflow shape

Two runs are only comparable when they describe the same pipeline. GreenCI
builds a structural fingerprint from the workflow path, logical job identifiers,
declared `needs` edges (when available), normalized non-runner-internal step
names, matrix signatures, and runner classes. Timestamps, commit SHAs, statuses,
and numeric identifiers are deliberately excluded.

When fingerprints differ, similarity is the weighted combination from the design
contract:

```text
similarity = 0.35 × jobIdJaccard
           + 0.25 × edgeJaccard
           + 0.25 × stepKeyJaccard
           + 0.15 × runnerClassMatch
```

A component that is not observable on both sides — declared `needs` edges are
only available when the workflow definition was parsed — is dropped and the
remaining weights are renormalized, so missing data never fabricates a
structural difference. Two empty sets are treated as identical.

Runs below the configured threshold (default `0.80`) are excluded before any
statistic is computed, and the report says how many were excluded.

## 3. Robust regression detection

GreenCI never compares against a single previous run. For each metric it
summarizes the baseline sample with median, median absolute deviation (MAD),
quartiles, and range, then computes:

```text
modified z-score = 0.6745 × (current − median) / MAD
percent change   = (current − median) / median × 100
```

A regression is reported when

```text
percentChange   ≥ regression-percent   (default 15)
AND |z|         ≥ modified-z-score     (default 3.5)
AND sampleCount ≥ minimum-samples      (default 3)
AND similarity  ≥ workflow-shape-threshold (default 0.80)
```

Improvements use the symmetric condition.

### When MAD is zero

A perfectly uniform baseline has `MAD = 0`, which would divide by zero. GreenCI
falls back in this order:

1. **MAD** — the default robust scale.
2. **Interquartile range** — `sigma ≈ IQR / 1.349` when `MAD = 0` but `IQR > 0`.
3. **Percentage change alone** — when neither scale exists, the decision uses
   the percentage threshold only and the confidence is forced to `low`, with the
   reason `robust-scale-unavailable` recorded in the report.

No code path can emit `NaN` or `Infinity`: z-scores are clamped to a finite
bound and a non-positive baseline median yields an explicitly absent percentage
change rather than a division.

### Outlier resistance

With a baseline of `100, 102, 99, 101, 98, 100, 300` seconds the median stays at
`100` and the MAD at `1`, so a single pathologically slow run cannot mask a real
regression or manufacture a false one. The arithmetic mean would have been
`128.6`.

### Confidence

| Grade  | Condition                                                        |
| ------ | ---------------------------------------------------------------- |
| High   | MAD-based scale, ≥ 5 samples, shape similarity ≥ 0.95            |
| Medium | A robust scale exists, samples ≥ minimum, similarity ≥ threshold |
| Low    | Anything else, including the percentage-only fallback            |

Job- and step-level comparisons use the same statistics with a stable key built
from the logical job id, matrix signature, runner class, normalized step name,
and step occurrence index. Nodes that exist in the current run but in no
baseline run are listed as unmatched and are never called regressions.

## 4. Cost

GreenCI distinguishes three quantities and only publishes the first two:

| Term                        | Meaning                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Gross list-price equivalent | Runner usage × published per-minute rate                                                            |
| Estimated billable cost     | List price after known public-repository policy                                                     |
| Actual invoice cost         | **Not calculated.** Plan credits and organization billing agreements are not visible to the Action. |

GitHub rounds each job's partial minute up, so rounding happens per job and is
then summed:

```text
billableMinutes(job) = ceil(job.durationSeconds / 60)
grossCost(job)       = billableMinutes(job) × pricePerMinute
grossCost(run)       = Σ grossCost(job)
```

Summing durations first and rounding once would understate cost — two 30-second
jobs are two billable minutes, not one.

Standard GitHub-hosted runners are free for public repositories under the
current policy. In that case the estimated billable cost is `$0.00` while the
list-price equivalent is still reported, because it remains useful for
cross-project comparison. macOS runners are not covered by that policy, so a
run that uses them is priced at list price even on a public repository.

An unknown runner class never inherits an unrelated price. It is excluded from
the total, listed in `unknownRunnerClasses`, and reported through the
`RUNNER_PRICE_UNKNOWN` warning.

## 5. Carbon

GreenCI estimates **modeled operational emissions**. It does not measure
electricity, does not read hardware counters, and does not claim SCI
certification or an ISO conformity statement.

Per job and per simulation sample:

```text
P_IT      = idleWatts + (peakWatts − idleWatts) × utilization
          + memoryGb × memoryWattsPerGb
E_IT      = durationHours × P_IT / 1000
E_facility= E_IT × PUE
carbon    = Σ E_facility × gridCarbonIntensity
```

`utilization`, `PUE`, idle and peak power, memory power, and grid intensity are
all triangular distributions rather than point values, because GitHub does not
publish host hardware, allocation, utilization, data-centre PUE, or execution
region. The default simulation draws 2000 samples and reports p05, p50, and p95
for both energy and carbon.

The simulation is deterministic. The seed is

```text
sha256(runId | configHash | modelVersion)
```

so a re-run of the same analysis reproduces the same interval exactly. The
report records the seed hash, the sample count, and every assumption.

### Data-quality grade

| Component                                | Weight |
| ---------------------------------------- | -----: |
| Runtime measured from GitHub             |   0.30 |
| Runner class known                       |   0.20 |
| Runner power-model quality               |   0.20 |
| Region explicitly configured and modeled |   0.15 |
| Carbon dataset freshness                 |   0.10 |
| PUE source quality                       |   0.05 |

`High ≥ 0.80`, `Medium ≥ 0.55`, otherwise `Low`. Unknown runner classes,
an unmodeled region, incomplete timestamps, and a stale dataset all lower the
score and are listed as machine-readable reasons.

GreenCI does not guess the GitHub data-centre location. When the configured
region is not in the bundled dataset it falls back to the global average,
records `regionResolved: false`, and lowers the grade.

## 6. Critical path versus resource hotspots

GreenCI answers two different questions and never conflates them:

```text
Critical path        → how long developers waited
Parallel hotspot     → how much runner time, cost, and carbon was consumed
```

A `security-matrix` job can consume more runner time than any other job while
delaying nobody; an `integration-test` job on the critical path can be cheap and
still dominate merge latency.

The graph is rebuilt from `jobs.<id>.needs` in the exact workflow definition used
by the run. API job names are mapped onto declared jobs through the logical job
id (GitHub renders a matrix job as `name (values)`). A matrix job becomes one
node whose _duration_ is its slowest variant — because dependents wait for all
of them — and whose _runner time_ is the sum of every variant.

Mapping confidence is reported, never assumed:

| Confidence | Condition                                                               |
| ---------- | ----------------------------------------------------------------------- |
| High       | Every API job mapped to exactly one declared job, no matrix aggregation |
| Medium     | Some API job was unmapped, or a matrix job was aggregated               |
| Low        | Cycle detected, or nothing could be mapped                              |

If the definition is unavailable, GreenCI falls back to interval-overlap
analysis: how much wall-clock time each job occupied _alone_. That result is
labelled `interval-fallback` everywhere it appears and is explicitly not
presented as a DAG critical path.

## 7. Recommendations

Recommendations are produced by a deterministic rule engine. No model is
consulted, no network call is made, and the same input always yields the same
output. Every recommendation carries a rule id, a severity, a confidence score,
its supporting evidence, and — where it can be bounded — an upper-bound impact
estimate.

| Rule                 | Fires when                                                   |
| -------------------- | ------------------------------------------------------------ |
| `GCI-CACHE-001`      | Install-shaped steps consume ≥ 15% of runner time and ≥ 20 s |
| `GCI-DUP-001`        | An equivalent step runs in ≥ 2 jobs for ≥ 30 s combined      |
| `GCI-MATRIX-001`     | A matrix group of ≥ 3 variants consumes ≥ 30% of runner time |
| `GCI-ORDER-001`      | The first failure lands after ≥ 50% of the wall-clock window |
| `GCI-CRITICAL-001`   | One critical-path node contributes ≥ 40% of the path         |
| `GCI-REGRESSION-001` | A wall-clock or runner-time regression was confirmed         |
| `GCI-FLAKY-001`      | Normalized MAD ≥ 0.2 over ≥ 5 baseline samples               |
| `GCI-QUEUE-001`      | Queue time is ≥ 30 s and ≥ 25% of the wall-clock window      |

`GCI-QUEUE-001` exists specifically so that a scheduling delay is never
presented as a code optimization opportunity.

Impact estimates scale cost and carbon by the share of runner time a change
could remove and are always flagged `upperBound: true`. A rule that throws is
isolated: it is named in a warning and the remaining rules still run.

## 8. Policy engine

The policy engine turns the analysis into an enforceable CI budget. It is
deliberately separate from the recommendation engine.

Supported metrics: wall-clock, runner-time, list-price, and carbon-p50
regression percentages; absolute carbon p95 grams; failed-job count; workflow
shape match; and critical-path regression percentage.

Modes are `report`, `warn`, and `fail`. Two safety rules apply:

1. A metric that could not be measured is never enforced — it is recorded as
   `evaluated: false` with the reason.
2. A `fail` rule is downgraded to `warn` when the underlying measurement is less
   confident than the rule requires.

**The default installation configures no rules at all**, so it cannot block a
pull request.

## 9. Test report analysis

JUnit XML is parsed from the configured artifact and reported as totals, slowest
suites, slowest cases, and failed cases. Because an artifact is
attacker-controlled on a fork pull request, the archive is read by GreenCI's own
hardened in-memory ZIP reader and the XML parser has entity processing disabled.
Every refusal is surfaced in the report rather than silently dropped. See
[security-model.md](security-model.md) for the full limit table.

## 10. Failure diagnostics

Failed-log parsing is off by default. When explicitly enabled it reads only the
bounded tail of failed job logs, in memory, and emits sanitized,
credential-redacted diagnostics. An annotation is only emitted when the parser
produced a repository-relative path, a valid line, and a confidence at or above
the configured threshold.

## 11. What GreenCI does not claim

- It does not measure energy; carbon figures are modeled estimates.
- It does not know your invoice.
- It does not know which physical host or region executed a job.
- It does not treat an unmatched job or step as a regression.
- It does not report a regression without enough samples or a comparable
  workflow shape.
- It does not present an interval-overlap estimate as a DAG critical path.
- It does not promise that a recommendation will work; recommendations are
  evidence-based suggestions with bounded impact estimates.
- It does not block a pull request by default, and never fails a job on a
  measurement it is not confident about.
- It does not execute, store, or transmit any artifact or log content.
