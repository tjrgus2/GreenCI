# ADR 0006: Counterfactual what-if analysis

- Status: accepted
- Date: 2026-08-14

## Context

GreenCI already separates the critical path (what makes developers wait) from
parallel resource hotspots (what consumes runner time, cost, and carbon). In
practice readers still conflate them: the biggest job on the report looks like
the thing to fix, even when nothing depends on it.

The distinction only becomes obvious when you can see what each optimization
would actually buy.

## Decision

Add a deterministic counterfactual engine that recomputes GreenCI's own models
over hypothetically shortened jobs.

Two scenarios are generated automatically, chosen to be maximally contrasting:

1. the job that dominates the critical path becomes N% faster (default 50%);
2. the job that dominates non-critical runner consumption becomes N% faster.

For each, the report shows the estimated change to critical-path duration,
runner time, list-price equivalent, and carbon p50.

No new model is introduced. The existing DAG, cost, and carbon engines are
re-run over modified durations, so the numbers are consistent with the rest of
the report by construction.

## Constraints honoured

- **Nothing is claimed as a saving.** The section is titled "What if?
  (counterfactual estimates)" and carries a disclaimer stating the figures are
  recomputed model output, not measured savings and not a guarantee that the
  change is achievable.
- **Only duration-derived metrics change.** Timestamps are left untouched
  because a counterfactual has no real schedule. Wall-clock time is therefore
  reported through the critical path, and only when the workflow graph was
  reconstructed; otherwise the scenario is marked `runner-only`.
- **Deterministic.** The same input produces byte-identical output, including the
  carbon percentiles, because the seed derivation is unchanged.
- **Opt-out.** `analysis.what-if.enabled: false` removes it; the speed-up
  percentage and scenario count are configurable.

## Consequences

- Two extra cost estimates and two extra carbon simulations per run. At the
  default 2000 samples this is a few tens of milliseconds; the benchmark records
  the real figure.
- The engine can only model job-level speed-ups. Step-level and structural
  changes ("remove this duplicated install") are not modelled, because their
  effect on the graph is not derivable from timing alone.
- The report schema gains an optional `whatIf` section (minor version bump).
