# Performance

GreenCI adds a job to your workflow, so its own cost matters. This is what that
cost actually is.

## Reproducing

```bash
pnpm benchmark          # human-readable table
pnpm benchmark --json   # machine-readable
```

The benchmark drives `analyzeWorkflow` directly over synthetic workloads. That is
the whole core engine — duration normalization, concurrency sweep, workflow-shape
fingerprinting, baseline statistics, DAG reconstruction, critical path, cost,
2000-sample Monte Carlo carbon, counterfactuals, recommendations, and policy —
with no network involved. Each workload runs once to warm up and then five times;
the table reports the median, minimum, maximum, and peak heap.

## Results

Node 24.13.0, win32/x64, 2000 Monte Carlo samples, default configuration.

| Workload                                         | Jobs | Steps | Baselines |    Median |       Min |       Max | Peak heap |
| ------------------------------------------------ | ---: | ----: | --------: | --------: | --------: | --------: | --------: |
| 10 jobs, no baseline                             |   10 |    50 |         0 |  12.96 ms |  12.09 ms |  15.57 ms |   26.6 MB |
| 10 jobs, 7 baselines                             |   10 |    50 |         7 |  43.92 ms |  42.74 ms |  48.41 ms |   37.4 MB |
| 50 jobs, 7 baselines                             |   50 |   250 |         7 | 175.79 ms | 169.43 ms | 176.52 ms |   39.2 MB |
| 50 jobs, 20 baselines                            |   50 |   250 |        20 | 177.78 ms | 175.84 ms | 185.26 ms |   70.8 MB |
| 100 jobs, 20 baselines                           |  100 |   500 |        20 | 344.85 ms | 340.98 ms | 347.17 ms |  115.2 MB |
| Matrix-heavy: 100 jobs in 5 groups, 20 baselines |  100 |   800 |        20 | 352.58 ms | 351.55 ms | 378.51 ms |   98.9 MB |

Against the targets in the design contract:

| Target                                             | Result                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Typical analysis (≤ 50 jobs, 7 baselines) ≤ 30 s   | 0.18 s                                                                              |
| Maximum memory ≤ 256 MB                            | 115 MB at the largest workload                                                      |
| Action cold execution ≤ 15 s excluding API latency | Core analysis is ~0.35 s at 100 jobs; the rest is process start and API round trips |

These are two orders of magnitude inside the budget, so the wall-clock cost of the
GreenCI job in practice is dominated by runner start-up and GitHub API latency,
not by analysis.

## Reading the numbers

**Supplying more baselines than are requested costs nothing.** The 7-baseline and
20-baseline rows at 50 jobs are within noise of each other, because
`baseline.successful-runs` defaults to 7: additional samples are shape-checked and
then not compared. Peak heap does grow, since the samples were still fetched and
normalized. If you raise `successful-runs`, expect analysis time to scale with it.

**Cost is roughly linear in jobs × steps.** Doubling from 50 to 100 jobs roughly
doubles the time. Nothing in the engine is quadratic in job count; the concurrency
sweep is `O(J log J)` and the critical path is `O(V + E)` with memoization.

**Matrix expansion is nearly free.** The matrix-heavy workload has 60% more steps
than the plain 100-job workload for a 2% time difference. Matrix variants
aggregate into one DAG node rather than multiplying the graph.

**Carbon dominates the constant factor.** The simulation is `O(samples × jobs)`,
and it runs once for the current run plus once per compared baseline run to
produce the carbon regression metric, plus once per counterfactual scenario.
Lowering `carbon.simulation-samples` is the effective lever if you ever need to;
2000 is the default because it stabilizes p05 and p95, not because it is cheap.

## Caveats

- A single machine, a single Node version. GitHub-hosted runners are slower and
  noisier than a developer laptop; treat these as relative figures.
- Peak heap is `process.memoryUsage().heapUsed` sampled after each iteration, so
  it reflects post-analysis retention rather than a true high-water mark.
- API latency is excluded by design. In practice GreenCI issues one request for
  the run, one for its jobs, one for the workflow definition, one for
  `.greenci.yml`, one to list history, and one per baseline run's jobs at
  concurrency 3 — that network time is what a user actually waits for.
