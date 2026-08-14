# ADR 0002: Compare against a robust baseline, never the previous run

- Status: accepted
- Date: 2026-07-27

## Context

The cheapest regression check is "this run versus the previous run". CI runtimes
are noisy — runner host variation, package-download variance, cache hits and
misses, flaky tests, external service latency — so a single-run comparison
produces false alarms often enough that developers learn to ignore it. An
ignored check is worse than no check.

## Decision

GreenCI compares against a sample of successful runs on the baseline branch and
summarizes it with the median and the median absolute deviation. A regression
requires _all_ of:

- percentage change at or above the configured threshold (default 15%);
- modified z-score at or above the configured threshold (default 3.5);
- at least the configured minimum sample count (default 3);
- workflow-shape similarity at or above the configured threshold (default 0.80).

When MAD is zero the scale falls back to the interquartile range, and when that
is zero too the decision uses percentage change alone with confidence forced to
`low`.

## Consequences

- One pathological outlier cannot manufacture or mask a regression. A baseline
  of `100, 102, 99, 101, 98, 100, 300` keeps a median of 100 where the mean would
  have been 128.6.
- GreenCI often says "inconclusive". That is the intended behaviour: a new
  repository, a rebuilt workflow, or a two-run history genuinely does not support
  a regression claim.
- Every comparison costs API calls (one per baseline run's jobs), so the sample
  is capped and fetched with bounded concurrency.
- Comparability has to be established before statistics, which is why workflow
  shape fingerprinting exists at all.
