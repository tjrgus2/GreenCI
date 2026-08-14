# ADR 0005: No composite CI efficiency score

- Status: accepted (rejected feature)
- Date: 2026-08-14

## Context

A single "CI efficiency score" out of 100 — folding regression health,
critical-path efficiency, parallel resource efficiency, failure timing, and
workflow stability into one number — was considered for v1.0.0. It is
attractive: easy to screenshot, easy to track, easy to put in a badge.

## Decision

Not implemented.

## Rationale

1. **The weights would be invented.** There is no defensible reason to say
   critical-path efficiency is worth 30% and stability 20%. Every weighting
   encodes an opinion about a trade-off that belongs to the repository owner, not
   to GreenCI.
2. **It contradicts the project's central claim.** GreenCI's differentiator is
   that it shows uncertainty honestly: intervals, confidence grades, data-quality
   reasons, and "inconclusive" verdicts. Collapsing that into one integer throws
   away exactly the information that makes the tool trustworthy.
3. **A score invites the wrong behaviour.** Once a number exists, teams optimize
   the number. Wall-clock time and runner time genuinely trade off against each
   other; a score would hide that a "worse" score might be the right engineering
   decision.
4. **Every component is already reported.** Regression verdicts with confidence,
   critical-path share, non-critical runner share, failure position, and
   normalized MAD are all in the report and the Job Summary today, each with its
   own units and its own caveats.
5. **Misreading risk is asymmetric.** A reader who sees `62/100` will act on it
   without reading the components. A reader who sees "runner time up 88%,
   confidence high, driven by `Test`" has to engage with the actual finding.

## Alternative delivered instead

The counterfactual what-if engine (ADR 0006) answers the question a score is
usually a proxy for — "is this worth fixing, and which fix helps?" — without
inventing a scale.

## Revisit if

A published, externally maintained standard for CI efficiency scoring emerges
that GreenCI could implement rather than invent.
