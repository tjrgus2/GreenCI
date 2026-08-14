# ADR 0001: No GreenCI server, database, or account

- Status: accepted
- Date: 2026-07-20

## Context

A CI analyzer needs history to detect a regression. The obvious design stores
run history in a service the vendor operates, which is how most commercial CI
analytics work.

## Decision

GreenCI stores nothing. History is read back from the GitHub Actions API at
analysis time, and every model it needs — runner prices, runner power envelopes,
grid carbon intensity — is bundled as a version-pinned dataset inside the Action.

There is no GreenCI server, no database, no account, and no telemetry. The only
outbound destination is the GitHub API of the repository being analyzed.

## Consequences

- Installing GreenCI is adding one job to a workflow. Nothing to sign up for,
  nothing to authorize beyond the workflow token.
- An open-source maintainer can adopt it without introducing data collection
  into their project, which is the single biggest adoption barrier for
  vendor-hosted CI analytics.
- Baselines are limited to what the Actions API retains and to the runs GreenCI
  can afford to fetch (default 7, hard cap 20). Long-horizon trend analysis is
  therefore out of scope; see ADR 0007.
- Reproducibility has to be engineered rather than assumed: configuration is
  canonically hashed, the carbon simulation is seeded, and datasets carry
  SHA-256 digests, so the same run always yields the same report.
