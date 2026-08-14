/**
 * Did-you-mean suggestions for rejected configuration keys.
 *
 * A strict configuration schema exists to catch typos, so the warning it
 * produces has to be actionable: naming the offending key is the minimum, and
 * naming the key the author probably meant is what actually saves them time.
 */
import { createTranslator, type Translator } from '../reporting/i18n/index.js';

/** Levenshtein edit distance, bounded so a long pair exits early. */
export function editDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left.length === 0 || right.length === 0) {
    return Math.max(left.length, right.length);
  }
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row, ...new Array<number>(right.length).fill(0)];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution =
        (previous[column - 1] ?? 0) +
        (left[row - 1] === right[column - 1] ? 0 : 1);
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (current[column - 1] ?? 0) + 1;
      current[column] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

/**
 * The closest candidate to `key`, or `undefined` when nothing is close enough
 * to be worth suggesting. The tolerance grows with key length so that
 * `workflow-shape-threshhold` still matches, while a genuinely unrelated key
 * produces no misleading advice.
 */
export function closestKey(
  key: string,
  candidates: readonly string[],
): string | undefined {
  const normalized = key.trim().toLocaleLowerCase('en-US');
  const tolerance = Math.max(2, Math.floor(normalized.length / 3));
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(
      normalized,
      candidate.toLocaleLowerCase('en-US'),
    );
    if (
      distance <= tolerance &&
      (best === undefined || distance < best.distance)
    ) {
      best = { candidate, distance };
    }
  }
  return best?.candidate;
}

/**
 * Format one unknown key with a suggestion when a plausible one exists.
 *
 * The translator defaults to English so that callers with no locale in hand —
 * and the reported `message` a machine consumer might read — keep the wording
 * they had before locales existed.
 */
export function describeUnknownKey(
  key: string,
  candidates: readonly string[],
  translate: Translator = createTranslator('en'),
): string {
  const suggestion = closestKey(key, candidates);
  return suggestion === undefined
    ? `\`${key}\``
    : translate('config.didYouMean', { key, suggestion });
}
