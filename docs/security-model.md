# Security model

## Least privilege

The analyzer needs only:

```yaml
permissions:
  actions: read
  contents: read
  pull-requests: write # optional
```

`pull-requests: write` is used solely to create or update the single GreenCI
comment; without it the analyzer records a warning and falls back to the Job
Summary. GreenCI never requires `contents: write`, `packages: write`,
`id-token: write`, or any secret beyond the automatically provided token.

## No untrusted code execution

GreenCI does not check out pull-request code, does not run a shell with
repository-controlled strings, and does not use `eval` or `new Function`. The
workflow definition, `.greenci.yml`, artifact contents, and job logs are all
treated as data.

## Untrusted input inventory

| Input                              | Trust boundary                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Workflow-run and job API responses | Validated with Zod; unknown conclusions map to `unknown`, malformed required fields are rejected         |
| `.greenci.yml`                     | ≤ 64 KiB, YAML aliases disabled, `merge` disabled, strict schema, unknown keys rejected                  |
| Workflow definition YAML           | ≤ 256 KiB, YAML aliases disabled, converted to a `needs` graph by pure code                              |
| Test-report artifact (ZIP)         | ≤ 10 MiB compressed, read entirely in memory, hardened reader (below)                                    |
| JUnit XML                          | ≤ 5 MiB per file, ≤ 100 000 test cases, entity processing disabled                                       |
| Failed job logs                    | Opt-in only, ≤ 2 MiB and ≤ 2000 tail lines per job, ≤ 3 jobs, never persisted                            |
| Pull-request comments              | Only a comment carrying the GreenCI marker _and_ authored by the current token identity is ever modified |

## Archive hardening

Artifacts are attacker-controlled on a fork pull request. GreenCI ships its own
ZIP reader (`packages/core/src/artifacts/zip.ts`) rather than extracting to
disk, so every refusal happens before any allocation or filesystem access:

| Attack                           | Defense                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Zip slip / `..` traversal        | Path validated segment by segment; any `..` rejected                                    |
| Absolute path, drive letter, UNC | Rejected                                                                                |
| Backslash path separators        | Normalized before validation                                                            |
| Null byte in a path              | Rejected                                                                                |
| Symbolic link member             | Unix mode read from external attributes; `S_IFLNK` rejected                             |
| Decompression bomb               | Per-entry uncompressed limit, total uncompressed limit, and a maximum compression ratio |
| Declared/actual size mismatch    | `inflateRaw` is given `maxOutputLength`, and a size mismatch is treated as corruption   |
| Excessive file count             | Entry limit, with the truncation reported                                               |
| ZIP64                            | Refused rather than mis-parsed                                                          |
| Unsupported compression method   | Refused rather than guessed                                                             |
| Corrupt archive                  | Reported as a warning; the analysis continues                                           |

XML is parsed with entity processing disabled, so an entity-expansion payload
cannot be amplified, and no value is coerced.

## Log privacy

Failed-log parsing is **off by default** and requires both the
`parse-failure-logs` Action input and `analysis.failure-logs.enabled` in
`.greenci.yml`. When enabled:

- only the logs of failed jobs are requested;
- byte and line budgets are applied before parsing;
- logs are processed in memory and discarded immediately;
- raw log text never reaches the report, the Job Summary, or the JSON artifact;
- ANSI sequences, control characters, and the runner timestamp prefix are
  stripped, and credential-shaped strings (GitHub tokens, AWS keys, JWTs,
  bearer tokens, private-key headers, `password=`/`token=` assignments) are
  replaced with `[redacted]`;
- every message is length-bounded and Markdown-escaped at render time.

## Annotation safety

An annotation is emitted only when the parser produced a repository-relative
path with a valid line number, its confidence is at or above the configured
threshold, the same fingerprint has not already been emitted, and the count is
below the configured limit. Absolute paths and paths containing `..` never
become annotations; those diagnostics stay in the Job Summary.

## Policy safety

A policy can fail the GreenCI job only when the underlying measurement is at
least as confident as the rule requires; otherwise `fail` is downgraded to
`warn` with an explanation. The default installation configures no rules at all
and therefore cannot block a pull request.

## Network policy

The only outbound destination is the GitHub API. Pricing, runner power, and
carbon-intensity data are bundled and version-pinned; there is no runtime call
to a pricing or carbon service, no telemetry, and no analytics SDK.

## Reporting integrity

Job names, step names, branch names, test names, diagnostic messages, and
dataset URLs are Markdown-escaped and truncated before rendering. Tokens, API
payloads, raw logs, and raw artifacts are never logged. Artifact upload, Job
Summary, and comment publication failures are non-fatal, and the local JSON
report is always retained.
