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
run on one developer's machine. All five workflows now pass:

| Workflow                                                                                        | Result                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [CI](https://github.com/tjrgus2/GreenCI/actions/workflows/ci.yml)                               | pass                                                               |
| [CodeQL](https://github.com/tjrgus2/GreenCI/actions/workflows/codeql.yml)                       | pass, `security-and-quality` queries                               |
| [Dependency review](https://github.com/tjrgus2/GreenCI/actions/workflows/dependency-review.yml) | configured, `fail-on-severity: moderate` with a copyleft deny-list |
| [OpenSSF Scorecard](https://github.com/tjrgus2/GreenCI/actions/workflows/scorecard.yml)         | pass, results published to the Security tab                        |
| [GreenCI self-analysis](https://github.com/tjrgus2/GreenCI/actions/workflows/greenci-self.yml)  | pass, non-blocking                                                 |

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

- Release: <https://github.com/tjrgus2/GreenCI/releases/tag/v1.0.0-rc.2>
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

`v1.0.0-rc.1` exists as a tag with no release attached. Its run failed
verification, so the workflow refused to promote it. That is the gate behaving
correctly and the tag is left in place as evidence.

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

Findings 3, 4, and 5 all came from security tooling that did not exist before
Week 4, which is the strongest argument for having added it.

## Remaining Scorecard findings

Not defects, and each is recorded rather than silently ignored:

| Check                | Score | Status                                                                                                                                                       |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Vulnerabilities`    | was 3 | **fixed** — now clean                                                                                                                                        |
| `Branch-Protection`  | 0     | Not enabled on `main`. Recommended before accepting outside contributions; deliberately left off while a single maintainer is pushing release work directly. |
| `Code-Review`        | 0     | 0 of 16 changesets reviewed — inherent to solo development on `main`.                                                                                        |
| `Maintained`         | 0     | Repository is under 90 days old. Resolves with time.                                                                                                         |
| `CII-Best-Practices` | 0     | Requires registering for an OpenSSF badge, which is an external account action and not taken automatically.                                                  |

## Marketplace readiness

| Requirement                                         | Status                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `action.yml` with `name`, `description`, `branding` | Yes — description rewritten to describe what GreenCI actually does |
| `LICENSE`                                           | Yes — Apache-2.0, and GitHub now detects it                        |
| README with installation                            | Yes, English and Korean                                            |
| Published release tag                               | Yes — `v1.0.0-rc.2`                                                |
| Repository description and topics                   | Yes — set, with ten topics                                         |
| Floating major tag `v1`                             | Created only by a final release, not by a prerelease               |

Listing is deliberately **not** published: it is a public change to the owner's
account and is left as an explicit decision.

## Remaining external blockers

None. Every Week 4 exit criterion was verified against live GitHub.
