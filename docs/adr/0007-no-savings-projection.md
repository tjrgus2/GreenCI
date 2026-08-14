# ADR 0007: No monthly savings projection in v1.0.0

- Status: accepted (deferred feature)
- Date: 2026-08-14

## Context

A projection was considered: take the per-run saving from an optimization,
multiply it by how often the workflow runs, and report a weekly and monthly
figure — "~6.5 runner hours and ~$4.32 list-price equivalent per month".

That is the number a maintainer actually wants when deciding whether an
optimization is worth the effort.

## Decision

Not implemented in v1.0.0. The per-run figure is delivered instead, through the
counterfactual engine (ADR 0006).

## Rationale

1. **Run frequency is not reliably observable within GreenCI's constraints.**
   The only history GreenCI reads is the capped baseline sample: at most 20
   successful runs on one branch, of one workflow. Deriving a rate from it
   systematically undercounts, because failed runs, other branches, other
   workflows, and runs beyond the cap are all invisible.
2. **The error compounds.** A per-run saving carries the uncertainty of the cost
   and carbon models. Multiplying it by a frequency estimate that is itself a
   lower bound of unknown tightness produces a headline number whose real
   uncertainty GreenCI cannot state — which is precisely the failure mode ADR
   0003 exists to prevent.
3. **It could not be validated live.** Every run in the validation repository was
   created within the same day, so the observed window is far too short to
   extrapolate from. Shipping a feature whose only live-exercised path is its own
   "insufficient history" fallback is not shipping the feature.
4. **Raising the sample cap to fix this is the wrong trade.** It would multiply
   API calls per analysis to serve one derived figure, against ADR 0001's
   constraint of staying cheap enough to install without thinking about it.

## What the user gets instead

The counterfactual section reports the estimated per-run change to runner time,
cost, and carbon. Multiplying by a repository's own known run frequency is a
one-line calculation the reader can do with a number they actually trust, and
the JSON report exposes the per-run deltas for anyone who wants to automate it.

## Revisit if

GreenCI gains a cheap, trustworthy source of workflow run frequency — for
example a single `GET /repos/{owner}/{repo}/actions/workflows/{id}/runs` call
with `per_page=1` and a total count, spanning a window long enough to be
meaningful — and the projection can be published with an honest interval rather
than a point estimate.
