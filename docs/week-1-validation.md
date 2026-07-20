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

## Live repositories and tested revision

- Action repository: `tjrgus2/GreenCI`
- Validation repository: `tjrgus2/greenci-demo`
- Tested GreenCI commit: `75d37da9dec25152b17ff1083ab764bfd60e7be4`
- Trigger: `workflow_dispatch`
- Demo workflow restored commit: `58db1b0713aede5127d9b82a6c7cfc691691b808`

The runner log confirms that GitHub downloaded and executed
`tjrgus2/GreenCI@75d37da9dec25152b17ff1083ab764bfd60e7be4`.

## Normal path

- Workflow run: [29738767101](https://github.com/tjrgus2/greenci-demo/actions/runs/29738767101)
- Result: Build, Test, Lint, and GreenCI succeeded.
- Analyzed jobs: 3 (`Test`, `Lint`, `Build`)
- Analyzed steps: 9
- Analyzer exclusion: succeeded by name; excluded job `88340426339`
- Wall-clock time: 23 seconds
- Total runner time: 44 seconds
- Peak concurrency: 3
- Average concurrency: 1.9130434782608696
- Job Summary: written successfully
- JSON report: schema `1.0.0`, uploaded successfully as `greenci-report` artifact `8459447043`
- Repository visibility: `public`, obtained from canonical repository metadata

## Failure path

- Temporary failure commit: `b13a3a754d82d4f77fdfbe1950ca9038c9c4346c`
- Workflow run: [29738888307](https://github.com/tjrgus2/greenci-demo/actions/runs/29738888307)
- Expected overall result: failure caused by the intentionally failing Test job
- GreenCI result: success because the analyzer job uses `if: always()`
- Reported failed job: `Test`
- Reported failed step: `Simulate tests`
- Analyzed jobs: 3; GreenCI excluded by name as job `88340804818`
- Wall-clock time: 24 seconds
- Total runner time: 44 seconds
- Peak concurrency: 3
- Average concurrency: 1.8333333333333333
- Job Summary and JSON report artifact: both succeeded
- Restoration: the intentional failure was removed and the normal workflow was pushed in commit `58db1b0713aede5127d9b82a6c7cfc691691b808`

## Bugs discovered and fixed

The first live `workflow_dispatch` run exposed an invalid assumption that
`repository.visibility` was always present in the workflow-run/event payload.
GreenCI now fetches canonical repository metadata with `repos.get`, accepts
`public`, `private`, `internal`, and `unknown`, and continues with a structured
warning when metadata is missing, unexpected, or unavailable. It never infers
an internal repository as private from the `private` boolean.

The regression suite covers all four visibility values, missing and unexpected
values, and repository metadata API failure. The verified suite has 31 passing
tests with 95.93% line coverage and 81.94% branch coverage. Formatting, ESLint,
strict type checking, bundle generation, and independent byte-for-byte dist
verification all pass. No additional GreenCI implementation bug appeared in
the successful normal-path or intentional failure-path run.

All Week 1 exit criteria are now satisfied. Week 2 work remains gated from this
validation change and was not started.
