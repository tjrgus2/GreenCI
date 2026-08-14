# Estimation methodology

This document explains exactly what GreenCI calculates and what it refuses to
claim. Every number in a report is reproducible from the report itself: it
records the GreenCI version, report schema version, configuration hash, dataset
versions, and simulation seed.

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

## 6. What GreenCI does not claim

- It does not measure energy; carbon figures are modeled estimates.
- It does not know your invoice.
- It does not know which physical host or region executed a job.
- It does not treat an unmatched job or step as a regression.
- It does not report a regression without enough samples or a comparable
  workflow shape.
