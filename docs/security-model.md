# Security model

The Week 1 analyzer needs only `actions: read` and `contents: read` for collection; `pull-requests: write` is reserved for the later P0 comment publisher. It does not require checkout, evaluate workflow data, invoke a shell with repository-controlled strings, download logs, or download artifacts.

GitHub API responses, Action inputs, fixture JSON, and persisted reports are validated with Zod. Job and step names are Markdown-escaped before rendering. Tokens, API payloads, raw logs, and raw artifacts are never logged.

Artifact upload and Job Summary failures are treated as non-fatal publication failures. The local JSON report is retained and warnings contain no raw remote data.
