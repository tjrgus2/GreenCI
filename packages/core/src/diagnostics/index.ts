import {
  BUILT_IN_PARSERS,
  type Diagnostic,
  type DiagnosticParser,
  type ParserContext,
} from './parsers.js';
import { sanitizeLine } from './sanitize.js';

export {
  BUILT_IN_PARSERS,
  isRepositoryRelative,
  type Diagnostic,
  type DiagnosticParser,
  type ParserContext,
} from './parsers.js';
export {
  REDACTION,
  redactSecrets,
  sanitizeLine,
  stripAnsi,
  stripControlCharacters,
  stripLogTimestamp,
} from './sanitize.js';

/** Bounds applied to opt-in failed-log parsing. */
export interface DiagnosticLimits {
  readonly maxBytes: number;
  readonly maxLines: number;
  readonly maxDiagnostics: number;
}

/** Conservative defaults taken from the design contract. */
export const DEFAULT_DIAGNOSTIC_LIMITS: DiagnosticLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxLines: 2000,
  maxDiagnostics: 20,
};

/** Diagnostics extracted from one log, plus the bounds that were applied. */
export interface DiagnosticResult {
  readonly parserId: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
  readonly truncatedBytes: boolean;
  readonly truncatedLines: boolean;
  readonly truncatedDiagnostics: boolean;
}

/**
 * Parse a bounded tail of one failed job log.
 *
 * The raw log never leaves this function: only sanitized, redacted, and
 * length-limited diagnostics are returned, and nothing is written to disk.
 */
export function parseFailureLog(
  raw: string,
  context: ParserContext,
  limits: DiagnosticLimits = DEFAULT_DIAGNOSTIC_LIMITS,
  parsers: readonly DiagnosticParser[] = BUILT_IN_PARSERS,
): DiagnosticResult {
  const truncatedBytes = Buffer.byteLength(raw, 'utf8') > limits.maxBytes;
  const bounded = truncatedBytes
    ? raw.slice(-Math.max(0, limits.maxBytes))
    : raw;
  const allLines = bounded.split(/\r?\n/u);
  const truncatedLines = allLines.length > limits.maxLines;
  const text = allLines
    .slice(-limits.maxLines)
    .map((line) => sanitizeLine(line, 2000))
    .join('\n');

  const scored = parsers
    .map((parser) => ({ parser, score: parser.canParse(text, context) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  let parserId: string | undefined;

  for (const { parser } of scored) {
    let produced: Diagnostic[];
    try {
      produced = parser.parse(text, context);
    } catch {
      continue;
    }
    if (produced.length === 0) {
      continue;
    }
    parserId ??= parser.id;
    for (const entry of produced) {
      if (seen.has(entry.fingerprint)) {
        continue;
      }
      seen.add(entry.fingerprint);
      diagnostics.push(entry);
    }
    if (diagnostics.length >= limits.maxDiagnostics) {
      break;
    }
  }

  return {
    parserId,
    diagnostics: diagnostics.slice(0, limits.maxDiagnostics),
    truncatedBytes,
    truncatedLines,
    truncatedDiagnostics: diagnostics.length > limits.maxDiagnostics,
  };
}

/** Diagnostics that are safe and confident enough to become annotations. */
export function selectAnnotations(
  diagnostics: readonly Diagnostic[],
  options: { readonly minConfidence: number; readonly maxCount: number },
): readonly Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics
    .filter(
      (entry) =>
        entry.file !== undefined &&
        entry.line !== undefined &&
        entry.confidence >= options.minConfidence,
    )
    .filter((entry) => {
      if (seen.has(entry.fingerprint)) {
        return false;
      }
      seen.add(entry.fingerprint);
      return true;
    })
    .slice(0, Math.max(0, options.maxCount));
}
