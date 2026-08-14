/** Redaction and normalization applied before any log text is reported. */

const SECRET_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/gu,
  /github_pat_[A-Za-z0-9_]{20,}/gu,
  /AKIA[0-9A-Z]{16}/gu,
  /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/gu,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
  /\b(?:token|secret|password|passwd|api[_-]?key|authorization)\b\s*[:=]\s*["']?[^\s"']{8,}/giu,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gu,
];

/** Replacement written in place of anything that looks like a credential. */
export const REDACTION = '[redacted]';

/** Strip ANSI escape sequences produced by coloured CI output. */
export function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replaceAll(/\[[0-9;?]*[ -/]*[@-~]/gu, '');
}

/** Remove the ISO timestamp prefix GitHub adds to every log line. */
export function stripLogTimestamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/u, '');
}

/** Remove control characters that could corrupt a report surface. */
export function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join('');
}

/** Replace anything resembling a credential with a fixed marker. */
export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replaceAll(pattern, REDACTION),
    value,
  );
}

/**
 * Full sanitization pipeline for a single reported line: decolour, strip the
 * runner timestamp, remove control characters, redact credentials, and bound
 * the length. Markdown escaping happens later, at render time.
 */
export function sanitizeLine(value: string, maxLength = 300): string {
  const cleaned = redactSecrets(
    stripControlCharacters(stripAnsi(stripLogTimestamp(value))),
  ).trim();
  return cleaned.length <= maxLength
    ? cleaned
    : `${cleaned.slice(0, maxLength - 1)}…`;
}
