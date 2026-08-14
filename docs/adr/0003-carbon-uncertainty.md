# ADR 0003: Report carbon as an interval, never as a single number

- Status: accepted
- Date: 2026-07-27

## Context

GitHub exposes how long a job ran. It does not expose CPU utilization, the
physical host model, how many jobs shared that host, instantaneous power, the
data-centre region, or that facility's power usage effectiveness. Every carbon
figure derived from Actions metadata is therefore a model output with wide
uncertainty.

A single number like `4.05 gCO₂eq` reads as a measurement. It would be the most
quotable output GreenCI produces and the least defensible.

## Decision

Carbon and energy are reported as p05 / p50 / p95 from a deterministic Monte
Carlo simulation (default 2000 samples) that draws utilization, idle power, peak
power, memory power, PUE, and grid intensity from triangular distributions.

Alongside the interval, every report carries a weighted data-quality score and
grade, the machine-readable reasons that lowered it, the full assumption list,
the dataset versions, and the simulation seed.

The seed is `sha256(runId | configHash | modelVersion)`, so the interval is
reproducible from the report itself.

## Consequences

- Unknown inputs lower confidence instead of being guessed. An unmodeled runner
  class is excluded from the total and named in a warning; an unmodeled region
  falls back to the global average and drops the grade.
- GreenCI never claims to measure electricity and never claims SCI conformity.
  The wording "modeled operational emissions" is enforced in the renderer.
- The report is larger and the UI has to show a range, which is harder to
  screenshot than one number. That cost is accepted.
- Reviewers can audit the calculation: the model version, the dataset digests,
  and the seed are all printed.
