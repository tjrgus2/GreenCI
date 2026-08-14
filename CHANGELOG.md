# Changelog

All notable changes to GreenCI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and GreenCI follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The published report has its own schema version, recorded in every report as
`schemaVersion` and documented in [`schemas/report-v1.schema.json`](schemas/report-v1.schema.json).

## [Unreleased]

## [1.0.0] — 2026-08-14

First public release. GreenCI installs as one GitHub Action job and reports how a
pull request changed CI wait time, runner consumption, cost, and modeled carbon.

### Added

**Runtime analysis**

- Job and step timing, with durations recalculated from API timestamps.
- Wall-clock time, active time, and idle gaps.
- Total runner time, distinguished from wall-clock throughout.
- Queue time separated from execution time, so a scheduling delay is never
  reported as a code problem.
- Peak and average concurrency from a grouped sweep-line.
- Analyzer self-exclusion by `GITHUB_JOB` name, with a disclosed
  single-in-progress fallback.

**Regression detection**

- Historical baselines from successful base-branch runs (default 7, cap 20),
  collected with bounded concurrency.
- Median, MAD, quartiles, and a modified z-score, with an interquartile fallback
  and a percentage-only fallback when no robust scale exists.
- Workflow-shape fingerprinting and weighted-Jaccard similarity, so structurally
  incompatible history is excluded before any statistic.
- Per-job and per-step comparison on stable structural keys; nodes with no
  baseline counterpart are listed as unmatched, never as regressions.
- Confidence grading on every verdict.

**Workflow intelligence**

- `jobs.<id>.needs` graph reconstructed from the exact workflow definition used
  by the run, with matrix expansion and a mapping-confidence grade.
- Longest weighted path, separating critical-path bottlenecks from non-critical
  resource hotspots.
- Interval-overlap fallback when the definition is unavailable, labelled as an
  estimate everywhere it appears.
- Counterfactual what-if estimates contrasting a critical-path speed-up with a
  hotspot speed-up.

**Cost and carbon**

- Per-job minute rounding against versioned GitHub list prices.
- Gross list-price equivalent, estimated billable cost, and an explicit refusal
  to claim an actual invoice total.
- Deterministic 2000-sample Monte Carlo carbon model producing p05/p50/p95 for
  energy and emissions.
- Weighted data-quality score and grade with machine-readable reasons.
- Versioned datasets for pricing, runner power, and carbon intensity, each with a
  source, effective date, retrieval date, unit, uncertainty note, and SHA-256
  digest in `data/manifest.json`.

**Recommendations and policy**

- Eight deterministic rules — `GCI-CACHE-001`, `GCI-DUP-001`, `GCI-MATRIX-001`,
  `GCI-ORDER-001`, `GCI-CRITICAL-001`, `GCI-REGRESSION-001`, `GCI-FLAKY-001`,
  `GCI-QUEUE-001` — each with a rule id, severity, confidence, evidence, and a
  bounded impact estimate. A rule that throws is isolated and named.
- Policy engine over eight metrics with `report`/`warn`/`fail` modes, which
  refuses to fail on a measurement below the rule's confidence requirement. The
  default installation configures no rules and cannot block a pull request.

**Test and failure analysis**

- JUnit XML analysis: totals, slowest suites, slowest cases, failed cases.
- Failed job and failed step identification with time-before-failure and how late
  in the run the failure landed.
- Opt-in bounded failed-log parsing for TypeScript, ESLint, Jest/Vitest, pytest,
  Python tracebacks, Maven, Gradle, Java, GCC/Clang, and a generic exit code.
- File and line annotations for confident, repository-relative diagnostics.

**Surfaces**

- One pull-request comment per workflow, created once and updated in place.
- Full Job Summary, available even without comment permission.
- Versioned `greenci-report.json` artifact, schema 1.3.0.
- Eight Action outputs.
- English and Korean rendering, with compile-time key completeness.
- Offline fixture replay CLI and a one-command before/after demonstration.

### Security

- Least privilege: `actions: read`, `contents: read`, optional
  `pull-requests: write`. Never `contents: write`, `packages: write`, or
  `id-token: write` in the analyzer.
- No GreenCI server, database, account, telemetry, analytics, LLM call, or
  source-code upload.
- The analyzer does not check out or execute pull-request code, and never
  interpolates repository-controlled strings into a shell.
- Hardened in-memory ZIP reader refusing zip slip, absolute and drive-letter
  paths, symlinks, ZIP64, unsupported compression, oversized members, excessive
  member counts, and compression-ratio bombs.
- JUnit XML parsed with entity processing disabled.
- `.greenci.yml` and workflow definitions parsed with YAML aliases disabled,
  size-bounded, and schema-validated with unknown keys rejected.
- Failed-log parsing off by default, bounded, credential-redacted, in memory
  only, never persisted.
- Every repository-controlled string Markdown-escaped and truncated.
- Comment updates restricted to a workflow-scoped marker authored by the current
  token identity.
- Supply chain: lockfile-only installs, pinned dependency ranges, all third-party
  Actions pinned to full commit SHAs, CodeQL, dependency review with a licence
  deny-list, OpenSSF Scorecard, grouped Dependabot, CODEOWNERS over release-
  critical paths.
- Releases ship a CycloneDX SBOM, SHA-256 digests, and GitHub build-provenance
  attestation, produced by a workflow with per-job least privilege.
- The committed Action bundle is rebuilt in CI and compared byte for byte.

### Notes

- `locale` and `baseline-runs` have no Action-level default so that leaving them
  unset genuinely defers to `.greenci.yml`.
- The report schema reached 1.3.0 during development (1.0.0 → 1.1.0 baselines,
  cost, carbon → 1.2.0 critical path, recommendations, policy → 1.3.0
  counterfactuals). Consumers must ignore unknown optional fields; minor versions
  only add.
- Seven bugs found by live GitHub validation during development are recorded in
  [`docs/week-2-validation.md`](docs/week-2-validation.md) and
  [`docs/week-3-validation.md`](docs/week-3-validation.md).
- Two proposed features were declined with reasoning:
  [ADR 0005](docs/adr/0005-no-composite-efficiency-score.md) (composite score)
  and [ADR 0007](docs/adr/0007-no-savings-projection.md) (monthly projection).

[Unreleased]: https://github.com/tjrgus2/GreenCI/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tjrgus2/GreenCI/releases/tag/v1.0.0
