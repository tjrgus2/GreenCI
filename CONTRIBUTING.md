# Contributing to GreenCI

Thanks for looking. GreenCI is a small, deliberately constrained codebase, and
the constraints are the interesting part — please read them before a large
change.

## Getting set up

Node.js 24 and pnpm 11.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm verify:all
```

`pnpm verify:all` runs the entire gate CI runs: formatting, lint, strict types,
version consistency, dataset and schema verification, tests with coverage, the
Action bundle, byte-identical distribution verification, and the offline demo. If
it passes locally, CI should agree.

Individual steps:

| Command                                 | Purpose                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `pnpm test`                             | Unit, property, and security tests                         |
| `pnpm test:coverage`                    | The above with coverage thresholds                         |
| `pnpm typecheck`                        | Strict TypeScript over source, tests, and scripts          |
| `pnpm bundle`                           | Regenerate `packages/github-action/dist/index.js`          |
| `pnpm verify:dist`                      | Rebuild into a temp directory and compare byte for byte    |
| `pnpm data:write` / `data:verify`       | Regenerate or check the dataset manifest and embedded copy |
| `pnpm schemas:write` / `schemas:verify` | Regenerate or check the published JSON Schemas             |
| `pnpm benchmark`                        | Measure analysis cost                                      |
| `pnpm demo`                             | Reproduce the before/after demonstration offline           |

## The constraints

These are not style preferences. Breaking one is a design change and needs an ADR
in [`docs/adr/`](docs/adr/README.md).

1. **`packages/core` is pure.** No `@actions/*` import, no network, no
   filesystem, no `Date.now()`, no unseeded randomness. Everything it needs is
   passed in. This is what makes fixture replay and reproducibility possible.
2. **Untrusted input is `unknown` until Zod validates it.** No `any` in core.
   Every API response, config file, artifact, and log is parsed at the boundary.
3. **Calculations are deterministic.** The same input must produce a
   byte-identical report. If you need randomness, seed it.
4. **Unknown data lowers confidence; it never gets guessed.** An unmodeled runner
   class is excluded and named in a warning — it does not inherit a price from a
   similar-looking runner.
5. **Optional data degrades, it does not fail.** Only an unidentifiable current
   run is fatal. Everything else produces a structured warning and a useful
   report.
6. **Never claim measurement.** Carbon is modeled. Cost is a list-price
   equivalent. Counterfactuals are estimates. The renderer enforces the wording.
7. **Never hand-edit `packages/github-action/dist/index.js`.** Run `pnpm bundle`.
   CI verifies the bundle byte for byte.
8. **New behaviour needs a test.** Numeric invariants need a property test.
   Anything parsing untrusted input needs a hostile-input test.

## Where things live

```text
packages/core/src/
  domain/        Zod contracts: config, datasets, report, base types
  analysis/      runtime, shape, statistics, baseline, dag, critical-path,
                 failures, what-if, and the orchestrator
  estimation/    cost, carbon, seeded randomness
  recommendation/ the rule engine and rule catalog
  policy/        the CI budget evaluator
  artifacts/     hardened ZIP reader and JUnit parser
  diagnostics/   log parsers, redaction, annotation selection
  reporting/     Markdown renderers and i18n
packages/github-action/src/
  adapters/      GitHub API, comments, baseline, artifacts, logs, workflow
  config/        Action inputs and repository configuration
  run.ts         orchestration and every side effect
packages/cli/    offline fixture replay
data/            versioned datasets (source of truth)
schemas/         generated from the Zod contracts
scripts/         bundle, verify, datasets, schemas, versions, benchmark, demo, sbom
```

## Good first contributions

**A new recommendation rule.** Add it to
`packages/core/src/recommendation/rules.ts` and register it in
`BUILT_IN_RULES`. A rule must return a stable `ruleId`, a severity, a confidence
in `[0, 1]`, and at least one piece of evidence naming its metric, observed
value, and source. Phrase it as a suggestion, never a guarantee. Add a test that
proves it fires _and_ one that proves it does not fire on a healthy run.

**A new failure-log parser.** Add it to
`packages/core/src/diagnostics/parsers.ts`. Implement `canParse` as a score, not
a boolean, so the best parser wins. Only report a file and line when the path is
repository-relative — `isRepositoryRelative` enforces this and gates annotations.
Add a test with realistic tool output, including the `##[group]Run` block GitHub
prepends.

**A dataset correction.** Edit `data/*.json`, bump its `version`,
`effectiveDate`, and `retrievedAt`, then run `pnpm data:write` and commit the
regenerated manifest and embedded copy together. A correction needs a citable
source, because GreenCI prints the source in every report that uses the value.
Use the [dataset correction issue template](.github/ISSUE_TEMPLATE/dataset_update.yml).

**A translation.** `packages/core/src/reporting/i18n/en.ts` is the source locale;
its keys are enforced at compile time for every other bundle. Console logs and
JSON field names stay English — only report text is translated.

## Pull requests

- Conventional commits: `feat(scope):`, `fix(scope):`, `docs:`, `chore(deps):`.
- One concern per pull request. A dataset update, a new rule, and a refactor are
  three pull requests.
- If you changed a calculation, update [`docs/methodology.md`](docs/methodology.md).
- If you changed the report shape, run `pnpm schemas:write` and commit the schema.
  Prefer an optional field and a minor schema version over a breaking change; the
  CLI must keep replaying older fixtures.
- If you changed the Action, run `pnpm bundle` and commit `dist/index.js`.

## Reporting a vulnerability

Privately, through [Security Advisories](https://github.com/tjrgus2/GreenCI/security/advisories/new).
See [SECURITY.md](SECURITY.md). Do not attach unredacted logs.

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under [Apache-2.0](LICENSE).
