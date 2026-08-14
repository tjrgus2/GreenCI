# Security policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/tjrgus2/GreenCI/security/advisories/new).
Do not open a public issue.

Include the affected version or commit, the conditions needed to reproduce, and
the impact. **Do not attach unredacted CI logs, tokens, or artifacts** — GreenCI
redacts credential-shaped strings from everything it reports, and a report should
not reintroduce them.

Expect an acknowledgement within a week. Fixes ship as a patch release with the
advisory published once users have a version to move to.

## Supported versions

| Version           | Supported           |
| ----------------- | ------------------- |
| 1.x               | Yes                 |
| 0.x (pre-release) | No — upgrade to 1.x |

## What GreenCI does not do

These are design constraints, verified by tests, not aspirations:

- **No GreenCI server, database, or account.** The only outbound destination is
  the GitHub API of the repository being analyzed. See
  [ADR 0001](docs/adr/0001-no-external-server.md).
- **No telemetry or analytics.** No SDK, no beacon, no usage reporting.
- **No source-code upload.** GreenCI never reads your source. It reads run
  metadata, the workflow definition, `.greenci.yml`, and — only if you enable it
  — a bounded tail of failed job logs.
- **No LLM or external inference.** Recommendations come from a deterministic
  rule engine.
- **No pull-request code execution.** The analyzer does not check out
  pull-request code, does not invoke a shell with repository-controlled strings,
  and does not use `eval` or `new Function`.
- **No elevated permissions.** `actions: read`, `contents: read`, and optionally
  `pull-requests: write`. Never `contents: write`, `packages: write`, or
  `id-token: write`.
- **No claim of measurement.** Carbon figures are modeled operational emissions,
  reported as an interval. GreenCI does not measure electricity and does not know
  which data centre ran your job.

## Threat model

The analyzer runs inside the repository it analyzes, with a workflow token, over
inputs that a pull-request author can control. Each attack surface below has a
specific control.

| Attack surface                                   | Threat                                                                    | Control                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull-request metadata (branch, title, PR number) | Injection into a rendered surface or a shell                              | Never interpolated into a command; Markdown-escaped and truncated before rendering                                                                                                                                     |
| Job and step names                               | Markdown or HTML injection into the comment and Job Summary               | `escapeMarkdown` on every repository-controlled string; `<`/`>`/`` ` ``/`                                                                                                                                              | ` neutralized; verified by tests |
| Workflow path in the comment marker              | Terminating the HTML comment early to inject markup                       | Path sanitized to `[\w./@+-]` and length-bounded before it enters the marker                                                                                                                                           |
| `.greenci.yml`                                   | Alias expansion, oversized file, unknown keys silently changing behaviour | ≤ 64 KiB, YAML aliases and merge disabled, strict schema with unknown keys rejected, invalid file degrades to defaults with a warning                                                                                  |
| Workflow definition YAML                         | Same, plus a malformed graph                                              | ≤ 256 KiB, aliases disabled, converted to a `needs` graph by pure code, cycles detected and reported                                                                                                                   |
| JUnit artifact archive                           | Zip slip, absolute path, symlink, decompression bomb, excessive members   | GreenCI's own in-memory ZIP reader refuses each before allocating; nothing is written to disk. See the table in [docs/security-model.md](docs/security-model.md)                                                       |
| JUnit XML                                        | Entity expansion (billion laughs), oversized document                     | Entity processing disabled, ≤ 5 MiB per file, ≤ 100 000 cases                                                                                                                                                          |
| Failed job logs                                  | Secret leakage into a public comment                                      | Opt-in twice (input _and_ config); bounded bytes, lines, and job count; credential patterns redacted; control characters stripped; raw text never reaches any surface or the JSON report; never persisted              |
| Annotations                                      | Writing an annotation against a path outside the repository               | Only repository-relative paths with a valid line and confidence above threshold; absolute and `..` paths refused                                                                                                       |
| GitHub API failure or rate limit                 | Analysis fails and blocks a merge                                         | Every optional input has a documented degraded mode with a structured warning; only an unidentifiable current run is fatal                                                                                             |
| Another user's pull-request comment              | GreenCI editing a comment it does not own                                 | A comment is only updated when it carries the workflow-scoped GreenCI marker _and_ is authored by the current token identity                                                                                           |
| Policy gate                                      | Blocking a pull request on an uncertain number                            | A `fail` rule is downgraded to `warn` when confidence is below its requirement; the default installation configures no rules                                                                                           |
| Supply chain (dependencies)                      | A compromised transitive dependency shipping inside the bundle            | Lockfile-only installs, pinned ranges, Dependabot, dependency review with a licence deny-list, CodeQL, OpenSSF Scorecard, CycloneDX SBOM, and build-provenance attestation on every release                            |
| Supply chain (the Action itself)                 | A modified `dist/index.js` that does not match the source                 | The bundle is committed and CI rebuilds it into a temporary directory and compares byte for byte; users can pin a full commit SHA                                                                                      |
| Fork pull request                                | Elevated token reaching untrusted code                                    | Embedded mode only, no `workflow_run` trigger; the self-analysis workflow is restricted to the default branch precisely because it resolves the Action locally. See [ADR 0004](docs/adr/0004-embedded-mode-default.md) |

## Out of scope

- Compromise of the GitHub Actions platform or of `GITHUB_TOKEN` itself.
- A repository owner deliberately configuring GreenCI to expose their own logs by
  enabling failed-log parsing on a public repository. This is opt-in twice and
  documented; the redaction is defence in depth, not a guarantee that a log
  contains nothing sensitive.
- Accuracy of the bundled cost and carbon datasets. Errors there are correctness
  issues, not vulnerabilities; report them with the
  [dataset correction template](https://github.com/tjrgus2/GreenCI/issues/new?template=dataset_update.yml).

## Verifying a release

```bash
gh attestation verify greenci-1.0.0.tar.gz --repo tjrgus2/GreenCI
```

Every release also ships a CycloneDX SBOM of the bundled dependency closure and
SHA-256 digests for the archive and for `dist/index.js`.
