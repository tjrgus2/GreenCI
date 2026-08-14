# Week 4 entry audit

Audit of `51d3d9146be7d9e22d214908a1b44069a56c7367` before any Week 4 change.
Findings are ordered by severity, and the plan that follows is derived from
them.

## What is already sound

- **Architecture.** Ports and adapters holds: `packages/core` has no
  `@actions/*` import and performs no network, filesystem, clock, or unseeded
  random access. Every side effect lives in `packages/github-action`.
- **Determinism.** Configuration is canonically hashed, the carbon simulation is
  seeded from run identity plus config hash plus model version, and fixture
  replay proves byte-identical output.
- **Data provenance.** `data/*.json` is the single source of truth, the manifest
  carries SHA-256 digests, and `pnpm data:verify` fails on drift.
- **Schema discipline.** Both JSON Schemas are generated from the Zod contracts
  and verified by `pnpm schemas:verify`; ajv validates a real report in tests.
- **Reproducible distribution.** `pnpm verify:dist` rebuilds with ncc into a
  temporary directory and compares byte for byte.
- **Test suite.** 250 tests, 97.30% line and 85.26% branch coverage, including
  property-based invariants and a full hostile-archive matrix.
- **Hygiene.** No `TODO`/`FIXME`/`HACK` in source, no dead modules found, the
  largest fixture is 18 KB, and `greenci-report.json` is untracked.

## Findings

### F1 — Critical: the project has no CI of its own

There is no `.github/` directory at all. No workflow, no CodeQL, no dependency
review, no Dependabot, no Scorecard, no release automation, no CODEOWNERS, no
issue or pull-request templates. Every Week 1–3 quality gate has only ever run
on one developer's machine. Nothing prevents a contributor from breaking the
dist verification, the data manifest, or the schemas.

### F2 — Critical: no LICENSE file

`package.json` and the README both claim Apache-2.0, but no licence text
exists. GitHub reports `licenseInfo: null`. This is a legal defect and it blocks
GitHub Marketplace listing.

### F3 — High: three different version numbers

`package.json` files say `0.1.0`, `GREENCI_VERSION` says `0.3.0`, and the CLI
reports `0.1.0`. A release cannot be cut from three sources of truth, and the
report embeds the version a consumer would use to reproduce it.

### F4 — High: dependencies declared as `latest`

Every dependency is `"latest"`. The lockfile pins real versions, so CI is
reproducible _if_ it always installs frozen — but an ordinary `pnpm install`
silently upgrades the whole tree, including the bundled dist inputs. For a
released Action this is a supply-chain weakness.

### F5 — High: SECURITY.md is factually stale

It states that analysis "does not download job logs or workflow artifacts".
Both are implemented as of Week 3, opt-in and bounded. A security policy that
misdescribes the software is worse than none, and there is no threat model.

### F6 — Medium: open-source documentation set is incomplete

Missing: `README.ko.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
`CHANGELOG.md`, `docs/demo.md`, and any ADR. The README also leads with
mechanism rather than with the value a reviewer needs in thirty seconds.

### F7 — Medium: repository metadata is not release-ready

The repository description is "Open Source Developer Contest" and there are no
topics. `action.yml` still describes GreenCI as analyzing "current-run CI
efficiency", which understates every Week 2–3 capability and is the text a
Marketplace listing would show.

### F8 — Medium: no performance evidence

Nothing measures GreenCI's own analysis cost. The design sets targets (≤ 30 s
for 50 jobs and 7 baselines, ≤ 256 MB) that have never been checked.

### F9 — Medium: the demo depends on a live network

The before/after evidence exists only as GitHub run URLs. A network failure
during judging leaves no way to reproduce the numbers.

### F10 — Low: configuration errors are not actionable enough

A mistyped key now names itself, but offers no correction. `carbon.regoin`
should suggest `carbon.region`.

### F11 — Low: documentation is not verified against the implementation

The README configuration example is hand-maintained. Nothing fails when it
drifts from `schemas/config.schema.json`.

## Plan

| Priority | Work                                                                                                                 | Finding       |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1        | Apache-2.0 `LICENSE`                                                                                                 | F2            |
| 2        | Full `.github/`: CI, CodeQL, dependency review, Scorecard, Dependabot, release, self-analysis, CODEOWNERS, templates | F1            |
| 3        | Single version source with a consistency check; pin dependency ranges                                                | F3, F4        |
| 4        | SBOM and artifact attestation in a least-privilege release workflow                                                  | F1            |
| 5        | Rewrite `SECURITY.md` with a threat model                                                                            | F5            |
| 6        | Counterfactual what-if engine (critical path versus resource optimization)                                           | product value |
| 7        | Savings projection, guarded by observed run history                                                                  | product value |
| 8        | `pnpm benchmark` with recorded results                                                                               | F8            |
| 9        | `pnpm demo` offline before/after reproduction                                                                        | F9            |
| 10       | Did-you-mean suggestions for configuration keys                                                                      | F10           |
| 11       | README rewrite, `README.ko.md`, contributing, conduct, changelog, demo doc, ADRs                                     | F6            |
| 12       | Test that every documented configuration example validates                                                           | F11           |
| 13       | Repository description and topics; `action.yml` metadata                                                             | F7            |
| 14       | Live validation and a release candidate                                                                              | —             |

A CI efficiency score was considered and rejected; see
[adr/0005-no-composite-efficiency-score.md](adr/0005-no-composite-efficiency-score.md).
