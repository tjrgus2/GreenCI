# Week 1 architecture

GreenCI uses ports and adapters. `packages/core` contains API-independent domain schemas, pure timing/concurrency analysis, analyzer exclusion, and Markdown rendering. It has no `@actions/*` dependency. `packages/github-action` validates GitHub responses at the adapter boundary and owns GitHub API, Job Summary, output, and artifact side effects. `packages/cli` accepts only sanitized normalized fixtures and reuses the same core engine.

Every current-run analysis receives `generatedAt` explicitly. This avoids hidden clock state in the core and makes fixture replay deterministic. The GitHub adapter maps unknown conclusion strings to `unknown`, but rejects malformed required fields. Persisted fixture and report objects reject unknown keys.

The analyzer excludes itself first by normalized `GITHUB_JOB`/API name equality. If that cannot match, it excludes exactly one in-progress job and marks the method as heuristic. It refuses to guess when multiple jobs are still running.

Wall-clock time follows the design formula of latest job completion minus earliest job start. Active interval time and idle gaps are also reported. Total runner time is the sum of non-negative job durations. A grouped sweep-line computes concurrency without an artificial spike when one job ends exactly as another begins.
