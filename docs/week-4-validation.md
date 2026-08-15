# Week 4 exit validation

Week 4 turned GreenCI from a validated analyzer into a releasable open-source
tool: its own CI, supply-chain controls, a reproducible release with an SBOM and
attested provenance, counterfactual analysis, and a documentation set a new user
can install from.

## Local verification

| Gate                                          | Result                                           |
| --------------------------------------------- | ------------------------------------------------ |
| Prettier                                      | pass                                             |
| ESLint                                        | pass                                             |
| Strict TypeScript (`tsc -b` and test project) | pass                                             |
| Vitest                                        | 289 / 289                                        |
| Line coverage                                 | 97.27% (threshold 85%)                           |
| Branch coverage                               | 85.48% (threshold 80%)                           |
| `pnpm versions:verify`                        | all manifests agree with `GREENCI_VERSION` 1.0.0 |
| `pnpm data:verify`                            | pass                                             |
| `pnpm schemas:verify`                         | pass                                             |
| `pnpm audit`                                  | **no known vulnerabilities** (was 9)             |
| Action bundle generation                      | pass                                             |
| Independent dist byte comparison              | pass                                             |
| `pnpm demo`                                   | reproduces the before/after story offline        |
| `pnpm benchmark`                              | recorded in [performance.md](performance.md)     |
| `pnpm sbom:generate`                          | 152 components, deterministic                    |

The whole gate is one command: `pnpm verify:all`.

## GreenCI's own CI, running for the first time

Before Week 4 there was no `.github/` directory at all — every gate had only ever
run on one developer's machine. Four passed immediately; the fifth only ran for
the first time once the repository had a pull request, and needed a repository
setting before it could work at all:

| Workflow                                                                                        | Result                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [CI](https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml)                               | pass                                                                     |
| [CodeQL](https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml)                       | pass, `security-and-quality` queries                                     |
| [Dependency review](https://github.com/tjrgus2/GreenCI/actions/workflows/dependency-review.yml) | pass, `fail-on-severity: moderate` with a copyleft deny-list — see below |
| [OpenSSF Scorecard](https://github.com/tjrgus2/GreenCI/actions/workflows/scorecard.yml)         | pass, results published to the Security tab                              |
| [GreenCI self-analysis](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)  | pass, non-blocking                                                       |

CI immediately earned its keep by catching two bugs that a clean checkout exposes
and a warm working tree hides. See "Bugs found" below.

## GreenCI analyzing GreenCI

Run [31797197184](https://github.com/tjrgus2/GreenCI/actions/runs/31797197184)

```text
runner_seconds=63  carbon_p50_g=0.1092  list_price_usd=0.024
critical_path_seconds=41  recommendations=1  policy=skipped
```

It reconstructed its own `needs` graph (`critical_path=dag`) and flagged the
duplicated `pnpm install` across its three jobs — a real inefficiency in that
workflow, not a contrived one. The workflow is restricted to the default branch
because it resolves the Action with `uses: ./`, which on a fork pull request
would be untrusted contributor code.

## Live validation of the release candidate

Analyzer code and the committed bundle are byte-identical between
`d15bc009041ac36bf77ef1699938cdeb5938edb2` and the tagged
`7c8f4ac36dda3f2066eb8fea358ac1b4ea25c7f7`; the only differences are the release
workflow, the README pin, and one npm script. Both were exercised live.

### Counterfactual what-if — the new feature

Run [31797623417](https://github.com/tjrgus2/greenci-demo/actions/runs/31797623417)

| Scenario                | On critical path |           Critical path | Runner time | Carbon p50 |
| ----------------------- | ---------------- | ----------------------: | ----------: | ---------: |
| `Integration test` −50% | yes              | 156 s → 120 s (▼ 23.4%) |     ▼ 12.9% |    ▼ 12.8% |
| `Security` −50%         | no               |  156 s → 156 s (▬ 0.0%) |     ▼ 22.4% |    ▼ 22.6% |

This is the distinction the feature exists for, produced from live data: the job
that halves the wait frees the least runner time, and the job that frees the most
runner time saves nobody any waiting.

An honest artifact worth noting: the `Security` scenario shows **no** cost change,
because halving a 42-second job still rounds up to one billable minute. Per-job
rounding is working correctly, and the counterfactual reports it rather than
smoothing it over.

### Pull-request paths

| Path                          | Run                                                                             | Result                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Normal, on `main`             | [31797623417](https://github.com/tjrgus2/greenci-demo/actions/runs/31797623417) | `ready`, 5 samples, `dag`, 4 recommendations, policy `pass`                              |
| Optimized pull request        | [31797865113](https://github.com/tjrgus2/greenci-demo/actions/runs/31797865113) | `ready`, 6 samples, comment **updated**, all five metrics `improvement`                  |
| Late failure with diagnostics | [31797926302](https://github.com/tjrgus2/greenci-demo/actions/runs/31797926302) | `ready`, 6 samples, 5 recommendations, policy `warn`, 2 annotations, comment **updated** |
| Install by release tag        | [31798529462](https://github.com/tjrgus2/greenci-demo/actions/runs/31798529462) | `@v1.0.0-rc.2` resolved to `7c8f4ac3…`, `ready`, 7 samples                               |

Optimized-run figures against the same baseline:

| Metric                |  Change | Verdict     | Confidence |
| --------------------- | ------: | ----------- | ---------- |
| wall-clock-seconds    | ▼ 26.5% | improvement | high       |
| runner-seconds        | ▼ 45.4% | improvement | high       |
| critical-path-seconds | ▼ 27.5% | improvement | high       |
| carbon-p50-grams      | ▼ 45.6% | improvement | high       |
| list-price-usd        | ▼ 42.9% | improvement | low        |

JUnit analysis, policy evaluation, annotations, and comment idempotency were all
re-verified. Every pull request carries exactly one comment per workflow.

## Release candidate

- Release: `v1.0.0-rc.2` — since deleted, see the note at the end of this section
- Workflow run: [31798300618](https://github.com/tjrgus2/GreenCI/actions/runs/31798300618)
- Jobs: verify → attest → publish, with `major-tag` correctly **skipped** for a
  prerelease

| Artifact                       | Verified                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| `greenci-1.0.0-rc.2.tar.gz`    | SHA-256 `dd18c255…` matches the published digest           |
| `greenci-1.0.0-rc.2-sbom.json` | CycloneDX 1.5, 152 components, deterministic serial number |
| `dist-index.js.sha256`         | `f2d54f0e…`, identical to the committed bundle             |
| Build provenance               | `gh attestation verify` succeeds                           |

The attestation's SLSA predicate binds the archive to commit
`7c8f4ac36dda3f2066eb8fea358ac1b4ea25c7f7`, workflow
`.github/workflows/release.yml@refs/tags/v1.0.0-rc.2`, and a GitHub-hosted
runner — which is exactly the "what commit, built by what workflow" question the
release engineering was meant to answer.

`v1.0.0-rc.1` was a tag with no release attached: its run failed verification, so
the workflow refused to promote it. That is the gate behaving correctly.

Both `rc.1` and `rc.2` have since been deleted. They were the last refs holding
the pre-rewrite history — the commits that still carried `Co-Authored-By`
trailers — and every identifier in this section belongs to that history. The runs,
digests and predicates recorded here are what those runs actually produced; the
commit SHAs no longer resolve in the repository. What shipped is
[v1.0.0](https://github.com/tjrgus2/GreenCI/releases/tag/v1.0.0), built from
`545fcc230d574851cdb50484ad09beceeb37c2ea`, which is on `main`.

### v1.0.0-rc.3

Cut after Week 4 to carry the report translation and the localized configuration
errors, and to put a release back on `main`: rewriting history to drop the
co-author trailers left rc.2's commit reachable only through its tag, so the
attestation named a commit that was no longer part of the branch. Run
[31829779786](https://github.com/tjrgus2/GreenCI/actions/runs/31829779786).

| Artifact                       | Verified                                       |
| ------------------------------ | ---------------------------------------------- |
| `greenci-1.0.0-rc.3.tar.gz`    | SHA-256 `41aa9f14…`                            |
| `greenci-1.0.0-rc.3-sbom.json` | CycloneDX 1.5, deterministic serial number     |
| `dist-index.js.sha256`         | `2320b448…`, identical to the committed bundle |
| Build provenance               | `gh attestation verify` succeeds               |

The predicate binds to `3c5ead811321207fc9add6abe74755ca8f9ce88a`, which is on
`main`, and `major-tag` skipped again for the prerelease.

### v1.0.0

Run [31877195900](https://github.com/tjrgus2/GreenCI/actions/runs/31877195900),
built from `545fcc230d574851cdb50484ad09beceeb37c2ea`. This is the first release
where `major-tag` ran rather than skipped, so the floating `v1` tag now resolves
to that commit — `gh attestation verify` succeeds against the archive.

The demo repository exercises both supported installation paths against it at
once: `greenci-live.yml` installs by the `v1` tag and `greenci-intelligence.yml`
by the released commit SHA. Its `main` stays on `locale: en`;
[PR #4](https://github.com/tjrgus2/greenci-demo/pull/4) changes exactly one line
to `locale: ko` and both comments then render fully in Korean, which is the whole
of what switching language takes.

`Review dependency changes` was promoted to a required status check at the same
time, so a moderate-or-higher advisory now blocks a merge instead of only
reporting.

## Bugs found and fixed during Week 4

1. **`eslint` could not resolve workspace types on a clean checkout.** The CLI
   package's types come from `@greenci/core`'s emitted declarations, which do not
   exist until something builds. Locally `dist/` was always present from an
   earlier build, so lint passed; in CI it failed with 30 spurious
   `no-unsafe-*` errors. `lint` now builds first, like `test`.
   _Regression guard:_ CI itself, running from a clean checkout on every push.

2. **`versions:verify` had the same latent dependency.** It imports
   `GREENCI_VERSION` from the built core. CI happened to run it after
   `typecheck`, so it passed; the release workflow runs it right after install,
   and `v1.0.0-rc.1` was correctly refused. The script now builds first.
   _Regression guard:_ the release workflow, which runs it before any build step.

3. **ReDoS in job-name parsing.** Found by GreenCI's first CodeQL run
   (`js/polynomial-redos`, high). `deriveLogicalJobId` matched names with
   `^(.*?)\s*\((...)\)\s*$`, which backtracks polynomially on a name containing
   many spaces — and job names come from the Actions API, so a pull-request
   author controls them. Replaced with a linear hand-written scan.
   _Regression guard:_ a test asserting a 20 000-token pathological name parses
   in under 250 ms, plus cases for unbalanced and nested parentheses.

4. **An incomplete HTML-comment-end filter in a test.** Also from CodeQL
   (`js/bad-tag-filter`, high). The marker test counted `-->` occurrences, which
   misses `--!>`. Rewritten to assert the actual control — the character
   allowlist — which is a strictly stronger property.
   _Regression guard:_ the rewritten test asserts no `<`, `>`, `!`, `"`, or space
   can appear in the embedded path.

5. **Nine dependency advisories, three reachable from the shipped bundle.**
   Reported by Scorecard's `Vulnerabilities` check: `brace-expansion` and
   `undici` reach the Action bundle through `@actions/artifact`, while `postcss`
   and `nanoid` were dev-only. Resolved with pnpm overrides pinning each forward
   within its own major.
   _Regression guard:_ `pnpm audit` now reports no known vulnerabilities, and
   dependency review blocks a new moderate-or-higher advisory in a pull request.

6. **Dependency review was configured but could not run.** It only triggers on a
   pull request, and the repository had none until branch protection forced one,
   so the workflow sat unexercised while the validation record described it as
   "configured" — accurate, and easy to mistake for working. Its first real run
   failed outright: `Dependency review is not supported on this repository`,
   because the repository's Dependency graph was disabled. Enabling it in
   repository settings fixed it; the setting is not reachable through the REST
   API, so it needed the owner.
   _Regression guard:_ the workflow now runs on every pull request, and a failure
   there is visible rather than silent. Note it is not in the required-status-check
   set, so it reports rather than blocks.

Findings 3 through 6 all came from security tooling that did not exist before
Week 4, which is the strongest argument for having added it. Finding 6 is the
sharpest of them: the tool had been counted as working purely because it had been
written.

## Remaining Scorecard findings

Not defects, and each is recorded rather than silently ignored:

| Check                | Score | Status                                                                                                                                                                         |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Vulnerabilities`    | was 3 | **fixed** — now clean                                                                                                                                                          |
| `Branch-Protection`  | was 0 | **fixed** — `main` now requires a pull request, blocks force-push and deletion, and gates on `Verify` and `Analyze JavaScript and TypeScript` with a strict up-to-date policy. |
| `Code-Review`        | 0     | Pull requests are required, but zero approvals are, so a solo maintainer still self-merges. Expected to stay low until someone else reviews.                                   |
| `Maintained`         | 0     | Repository is under 90 days old. Resolves with time.                                                                                                                           |
| `CII-Best-Practices` | 0     | Requires registering for an OpenSSF badge, which is an external account action and not taken automatically.                                                                    |

Secret scanning and push protection are still off. Both are free on a public
repository and worth enabling.

## Marketplace readiness

| Requirement                                         | Status                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `action.yml` with `name`, `description`, `branding` | Yes — description rewritten to describe what GreenCI actually does |
| `LICENSE`                                           | Yes — Apache-2.0, and GitHub now detects it                        |
| README with installation                            | Yes, English and Korean                                            |
| Published release tag                               | Yes — `v1.0.0`, with the floating `v1` tag moved to it             |
| Repository description and topics                   | Yes — set, with ten topics                                         |
| Floating major tag `v1`                             | Created only by a final release, not by a prerelease               |

Listing is deliberately **not** published: it is a public change to the owner's
account and is left as an explicit decision.

## Remaining external blockers

None. Every Week 4 exit criterion was verified against live GitHub.
