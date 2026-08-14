# ADR 0004: Run as the final job in the analyzed workflow

- Status: accepted
- Date: 2026-07-20

## Context

Two placements are possible. GreenCI can run as the last job of the workflow it
analyzes (embedded), or as a separate workflow triggered by `workflow_run` after
the first one finishes (post-workflow).

Post-workflow can see a fully completed run, including GreenCI's own job. It also
runs with the base repository's token on a fork pull request, which is precisely
the trigger GitHub documents as dangerous.

## Decision

Embedded mode is the only supported default. GreenCI runs with
`if: always()` and `needs: [<every analyzed job>]`.

Post-workflow mode is documented as an experimental possibility and is not
implemented.

## Consequences

- No privileged trigger, no checkout, and the analyzed jobs are guaranteed
  complete because `needs` waits for them.
- GreenCI's own job is still running while it analyzes, so it must exclude
  itself. Exclusion is by `GITHUB_JOB` name first, then by a single-in-progress
  heuristic that is disclosed in the report when used.
- Historical runs contain a _completed_ GreenCI job, so the analyzer job must be
  filtered out of baseline samples too. Missing this was a real bug, found in
  Week 2 live validation.
- A fork pull request may have a read-only token, so comment publication has to
  degrade to the Job Summary rather than fail.
- Users must list their jobs in `needs`. This is the one piece of installation
  friction the design accepts.
