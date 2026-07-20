# GreenCI

GreenCI is a GitHub-native CI efficiency analyzer. This repository currently implements the Week 1 foundation: current-run job and step timing, wall-clock versus total runner time, concurrency analysis, a GitHub Job Summary, a versioned JSON report, and deterministic offline fixture replay.

It has no GreenCI server, database, account, telemetry, or source-code upload. The analyzer reads GitHub Actions metadata through GitHub APIs and does not check out or execute pull-request code.

## Install the Action

Run GreenCI last and list every analyzed job in `needs`:

```yaml
greenci:
  name: GreenCI
  if: always()
  needs: [build, test, lint]
  runs-on: ubuntu-latest
  permissions:
    actions: read
    contents: read
    pull-requests: write
  steps:
    - name: Analyze CI efficiency
      uses: greenci-dev/greenci@<FULL_COMMIT_SHA>
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

The Action writes `greenci-report.json`, publishes a Job Summary, and uploads the JSON as the `greenci-report` artifact by default. PR comments, baselines, cost, carbon, policy, and diagnostic analysis intentionally remain outside the Week 1 gate.

## Develop

Requirements: Node.js 24 and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm bundle
pnpm verify:dist
```

Replay the sanitized acceptance fixture:

```bash
pnpm build
node packages/cli/dist/entrypoint.js replay fixtures/workflow-runs/parallel.json
```

The report schema is documented in `schemas/report-v1.schema.json` and enforced at runtime with Zod.

## Estimation scope

The Week 1 report contains runtime data only. It does not claim direct energy measurement or SCI certification. Cost, robust baselines, operational-carbon intervals, and their versioned datasets will be added only after the Week 1 exit gate passes.

## License

Apache-2.0.
