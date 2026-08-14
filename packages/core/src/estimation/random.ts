import { sha256Hex } from '../util/canonical.js';

/** A deterministic uniform `[0, 1)` source. */
export interface RandomSource {
  next(): number;
}

function seedWordsFromHex(seedHex: string): [number, number, number, number] {
  const normalized = seedHex.length >= 32 ? seedHex : sha256Hex(seedHex);
  const words: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const slice = normalized.slice(index * 8, index * 8 + 8);
    words.push(Number.parseInt(slice, 16) >>> 0);
  }
  return [words[0] ?? 1, words[1] ?? 2, words[2] ?? 3, words[3] ?? 4];
}

/**
 * Create an sfc32 pseudo-random generator seeded from a hexadecimal digest.
 * The generator is fully deterministic, which the carbon model relies on to
 * reproduce identical percentiles for identical inputs.
 */
export function createSeededRandom(seedHex: string): RandomSource {
  let [a, b, c, d] = seedWordsFromHex(seedHex);
  const source: RandomSource = {
    next(): number {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
  };
  for (let index = 0; index < 12; index += 1) {
    source.next();
  }
  return source;
}

/** Bounds of a triangular distribution. */
export interface TriangularBounds {
  readonly min: number;
  readonly mode: number;
  readonly max: number;
}

/**
 * Inverse-CDF sample from a triangular distribution. Degenerate bounds return
 * the single supported value instead of dividing by zero.
 */
export function triangular(
  bounds: TriangularBounds,
  random: RandomSource,
): number {
  const min = Math.min(bounds.min, bounds.max);
  const max = Math.max(bounds.min, bounds.max);
  const mode = Math.min(max, Math.max(min, bounds.mode));
  const span = max - min;
  if (span <= 0) {
    return min;
  }
  const split = (mode - min) / span;
  const uniform = random.next();
  if (uniform < split) {
    return min + Math.sqrt(uniform * span * (mode - min));
  }
  return max - Math.sqrt((1 - uniform) * span * (max - mode));
}
