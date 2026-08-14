# Demonstration

Two ways to see GreenCI work: real GitHub runs anyone can open, and a one-command
offline reproduction for when the network is not available.

## Offline, in one command

```bash
pnpm install --frozen-lockfile
pnpm demo
```

No network access, no GitHub token. It replays two committed fixtures through the
same engine the Action uses and prints the comparison:

```text
Metric                 Before         After          Change
Wall-clock time        2m 34s         1m 49s         ▼ 29.2%
Runner time            4m 40s         2m 32s         ▼ 45.7%
Critical path          2m 34s         1m 48s         ▼ 29.9%
List-price equivalent  $0.0560        $0.0320        ▼ 42.9%
Carbon p50             0.4395 gCO₂eq  0.2399 gCO₂eq  ▼ 45.4%
Recommendations        4              2              —
Policy                 pass           pass           —
```

Write the two full JSON reports out with `pnpm demo -- --out ./reports`.

The fixtures live in [`fixtures/demo/`](../fixtures/demo) and mirror the
structure and durations of the live runs below, which is why the offline
percentages land within a point of the live ones. They are regenerated with
`pnpm demo -- --write-fixtures` and asserted by
[`packages/cli/tests/demo.test.ts`](../packages/cli/tests/demo.test.ts), so the
demonstration cannot drift silently.

## The scenario

A deliberately inefficient pipeline in
[`tjrgus2/greenci-demo`](https://github.com/tjrgus2/greenci-demo):

```text
Build ──▶ Unit test ──▶ Integration test      the critical path
Security (3-way matrix)                       a parallel resource hotspot
```

Three jobs install dependencies from scratch. A three-way security matrix runs in
parallel and gates nothing. This is the shape most real pipelines drift into.

## Before — the inefficient pipeline

Run [31775992270](https://github.com/tjrgus2/greenci-demo/actions/runs/31775992270)

|                            |                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Wall-clock time            | 160 s                                                                                      |
| Runner time                | 281 s                                                                                      |
| Peak / average concurrency | 4 / 1.756                                                                                  |
| Critical path (`dag`)      | `Build` 38 s → `Unit test` 43 s → `Integration test` 73 s = **154 s**, 96.3% of wall-clock |
| Non-critical hotspot       | `Security` matrix, **127 s** of runner time — 45.2% of the run, delaying nobody            |
| List-price equivalent      | $0.056                                                                                     |
| Carbon p50                 | 0.4427 gCO₂eq, data quality `high`                                                         |
| Recommendations            | `GCI-CACHE-001`, `GCI-CRITICAL-001`, `GCI-DUP-001`, `GCI-MATRIX-001`                       |
| Policy                     | `pass` (both configured rules evaluated)                                                   |
| JUnit                      | 5 cases parsed, slowest `handles a large document`                                         |

This is the point of the DAG analysis. `Security` is the single largest consumer
of runner time, cost, and carbon — and optimizing it would not save a developer
one second of waiting. `Integration test` is half the wait and a third of the
consumption.

The counterfactual section makes that explicit before anyone changes anything:

```text
Integration test -50% (on critical path):  critical path ▼ 23.7%, runner ▼ 13.0%
Security         -50% (off critical path): critical path ▬  0.0%, runner ▼ 22.5%
```

## Failure path

Run [31776564882](https://github.com/tjrgus2/greenci-demo/actions/runs/31776564882) ·
[pull request 2](https://github.com/tjrgus2/greenci-demo/pull/2)

`Integration test` fails late, after printing two TypeScript errors, with
failed-log parsing explicitly enabled.

- Failed job `Integration test`, failed step `Run integration tests`, 66 s before
  failure, first failure at **98.7%** of the wall-clock window — so
  `GCI-ORDER-001` fires.
- Policy moves to `warn` on `failed-jobs`.
- Diagnostics: two located TypeScript errors at confidence 0.92, one generic
  exit-code finding at 0.45.
- Exactly two annotations, at `src/checkout.ts:84` and `src/checkout.ts:91`,
  verifiable through the check-runs API.
- The GreenCI job still concludes `success`. Annotations are information, not a
  gate.

## After — the optimized pipeline

[Pull request 3](https://github.com/tjrgus2/greenci-demo/pull/3) acts on the
recommendations: the dependency cache populated by `Build` now hits in the two
downstream jobs, and the full security matrix moves off pull requests.

Run [31776834036](https://github.com/tjrgus2/greenci-demo/actions/runs/31776834036) ·
[comment 5290307344](https://github.com/tjrgus2/greenci-demo/pull/3#issuecomment-5290307344)

| Metric                | Baseline median (before) | Current (after) |  Change |
| --------------------- | -----------------------: | --------------: | ------: |
| Wall-clock time       |                   2m 41s |          1m 53s | ▼ 29.6% |
| Runner time           |                   4m 42s |          2m 32s | ▼ 46.1% |
| List-price equivalent |                  $0.0560 |         $0.0320 | ▼ 42.9% |
| Carbon p50            |            0.4447 gCO₂eq |   0.2395 gCO₂eq | ▼ 46.1% |
| Critical path         |                  154.5 s |           109 s | ▼ 29.4% |

- Every metric verdict: `improvement`.
- Recommendations drop from 5 to 2 — `GCI-DUP-001` and `GCI-MATRIX-001` stop
  firing because the duplication and the fan-out are gone.
- Policy moves from `warn` to `pass`.
- Critical-path confidence rises from `medium` to `high`: with one matrix variant
  there is nothing left to aggregate.
- Workflow-shape match stays at **100.0%** with **0** exact fingerprint matches.
  The matrix cardinality changed, so the fingerprints differ — but it is still the
  same pipeline, so the comparison remains valid. This is the shape analysis
  working as designed.
- Carbon interval p05 0.2067 – p95 0.2757 gCO₂eq, data quality `high`.

## GreenCI analyzing GreenCI

GreenCI runs against its own repository in a separate, non-blocking workflow
([`.github/workflows/greenci-self.yml`](../.github/workflows/greenci-self.yml)).
The first self-analysis reported:

```text
runner_seconds=71  carbon_p50_g=0.1231  list_price_usd=0.024
critical_path_seconds=49  recommendations=2  policy=skipped
```

It reconstructed its own `needs` graph (`critical_path=dag`) and flagged the
duplicated `pnpm install` across its three jobs — which is a genuine
inefficiency in that workflow, not a contrived one.

The workflow is restricted to the default branch because it resolves the Action
with `uses: ./`; on a fork pull request that checkout would be untrusted
contributor code, and the analyzer must never execute untrusted code.

## Reproducing the numbers yourself

Every figure above is attached to a run id. Open any run, read the Job Summary, or
download the `greenci-report` artifact and inspect `greenci-report.json` — it
carries the GreenCI version, the report schema version, the configuration hash,
the dataset digests, and the Monte Carlo seed, which is everything needed to
reproduce the analysis.

## Talking track

1. **Install.** One job, three permissions, no server and no signup.
2. **The inefficient run.** The biggest job on the report is not the one to fix —
   here is why, and here is what fixing each one would buy.
3. **The failure.** Failed 98.7% of the way in; two annotations land on the exact
   lines; logs never leave the runner.
4. **Optimize and re-run.** −29.6% wait, −46.1% runner time, −42.9% cost, −46.1%
   carbon; two recommendations retire; the policy clears.
5. **Trust.** Open the details: interval not point estimate, data-quality grade,
   dataset digests, seed, SBOM, attested provenance — and an explicit list of what
   GreenCI refuses to claim.
