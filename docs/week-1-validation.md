# Week 1 exit validation

The local verification suite covers the Week 1 calculation and integration contract:

- the parallel acceptance fixture produces 8 minutes wall-clock, 15 minutes runner time, peak concurrency 3, and average concurrency 1.875;
- normalized jobs and steps receive correct non-negative durations;
- the current analyzer job is excluded by name or by a disclosed single-running-job heuristic;
- the Action orchestration writes and uploads `greenci-report.json` and writes a Job Summary;
- the CLI replays the same sanitized fixture without GitHub access.
- repository visibility is fetched from `repos.get`, never required from the event payload, and normalizes `public`, `private`, and `internal` directly;
- missing, unexpected, or unavailable repository visibility becomes `unknown` with a structured non-fatal warning, without inferring from the repository `private` boolean;
- repository metadata API failure does not interrupt workflow-run/job collection or runtime analysis.

A live repository run cannot be proven by a local test. That exit criterion requires pushing the generated bundle to a GitHub repository, pinning it by a full commit SHA from a separate test workflow, and observing the Action run. Later-phase features remain gated until that live check succeeds.
