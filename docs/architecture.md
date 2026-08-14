# Architecture

GreenCI uses ports and adapters. `packages/core` contains API-independent domain
schemas, pure timing, concurrency, shape, statistics, cost, and carbon analysis,
plus Markdown rendering. It has no `@actions/*` dependency and performs no
network, filesystem, clock, or unseeded random access. `packages/github-action`
validates GitHub responses at the adapter boundary and owns every side effect:
GitHub API calls, the Job Summary, the pull-request comment, Action outputs, and
artifact upload. `packages/cli` accepts only sanitized normalized fixtures and
reuses the same core engine.

```text
packages/cli ──┐
               ├──▶ packages/core (pure analysis + rendering)
packages/github-action ──┘        ▲
        │                          │
        └── GitHub REST API        └── data/ (versioned datasets, embedded)
```

## Determinism

Every current-run analysis receives `generatedAt` explicitly. Configuration is
resolved to a canonical object and hashed; the carbon Monte Carlo simulation is
seeded from `sha256(runId | configHash | modelVersion)`. Identical inputs
therefore produce a byte-identical report, which fixture replay asserts.

## Boundaries

The GitHub adapter maps unknown conclusion strings to `unknown` but rejects
malformed required fields. Workflow-run payloads, repository configuration, and
comment listings are all parsed from `unknown` with Zod. Persisted fixture and
report objects reject unknown keys.

## Analyzer exclusion

The analyzer excludes itself first by normalized `GITHUB_JOB`/API-name equality.
If that cannot match, it excludes exactly one in-progress job and marks the
method as heuristic. It refuses to guess when multiple jobs are still running.

## Runtime metrics

Wall-clock time is the latest job completion minus the earliest job start.
Active interval time and idle gaps are reported separately. Total runner time is
the sum of non-negative job durations. A grouped sweep-line computes concurrency
without an artificial spike when one job ends exactly as another begins.

## Baseline pipeline

```text
listWorkflowRuns(branch, status=success)      adapter, concurrency ≤ 3
        ↓ exclude current run and duplicates
listJobsForWorkflowRunAttempt(run)            adapter
        ↓ normalize + recalculate durations
buildWorkflowShape → compareWorkflowShapes    core
        ↓ drop runs below the shape threshold
median / MAD / modified z-score               core
        ↓
regression verdict + confidence               core
```

Historical jobs are recalculated with exactly the same duration logic as the
current run, because the jobs API returns timestamps rather than durations.

## Degraded modes

Every optional input has a documented fallback that produces a structured
warning instead of failing the job: missing repository metadata, missing or
invalid `.greenci.yml`, unavailable history, structurally incompatible history,
unknown runner class, unknown carbon region, denied pull-request comment
permission, failed Job Summary, and failed artifact upload.

## Generated artifacts

Two committed outputs are generated and verified in the same way the Action
bundle is:

- `packages/core/src/datasets/generated.ts` and `data/manifest.json` come from
  `data/*.json` (`pnpm data:write` / `pnpm data:verify`);
- `schemas/report-v1.schema.json` and `schemas/config.schema.json` come from the
  Zod contracts (`pnpm schemas:write` / `pnpm schemas:verify`).
