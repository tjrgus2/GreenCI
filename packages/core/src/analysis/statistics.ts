/**
 * Robust statistics used for baseline comparison.
 *
 * Every exported function is total: it never returns `NaN`, `Infinity`, or a
 * value produced by dividing by zero, because report rendering and policy
 * evaluation consume these numbers directly.
 */

/** Consistency constant that makes MAD a robust estimator of sigma. */
export const MAD_CONSISTENCY = 0.6745;

/** Consistency constant that makes the IQR a robust estimator of sigma. */
export const IQR_CONSISTENCY = 1.349;

/** Upper bound applied to modified z-scores so reports stay finite. */
export const MAX_ABSOLUTE_Z_SCORE = 1_000_000;

/** Robust summary of a baseline sample. */
export interface Distribution {
  readonly sampleCount: number;
  readonly median: number;
  readonly mad: number;
  readonly normalizedMad: number;
  readonly p25: number;
  readonly p75: number;
  readonly iqr: number;
  readonly min: number;
  readonly max: number;
}

/** How the robust scale used by the modified z-score was obtained. */
export type ScaleMethod = 'mad' | 'iqr' | 'unavailable';

/** Result of comparing one observation against a baseline distribution. */
export interface RobustComparison {
  readonly current: number;
  readonly distribution: Distribution;
  readonly percentChange: number | undefined;
  readonly modifiedZScore: number;
  readonly scaleMethod: ScaleMethod;
}

function clampFinite(value: number, bound: number): number {
  if (!Number.isFinite(value)) {
    return value > 0 ? bound : -bound;
  }
  return Math.min(bound, Math.max(-bound, value));
}

function finiteSorted(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

/**
 * Linear-interpolation percentile over an already sorted, non-empty array.
 * Returns 0 for an empty input so callers never observe `NaN`.
 */
export function percentile(
  sorted: readonly number[],
  fraction: number,
): number {
  if (sorted.length === 0) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(0, fraction));
  const position = clamped * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

/** Median of an unsorted sample; returns 0 for an empty sample. */
export function median(values: readonly number[]): number {
  return percentile(finiteSorted(values), 0.5);
}

/** Median absolute deviation of an unsorted sample. */
export function medianAbsoluteDeviation(
  values: readonly number[],
  center = median(values),
): number {
  if (values.length === 0) {
    return 0;
  }
  return median(values.map((value) => Math.abs(value - center)));
}

/** Summarize a numeric sample, or return `undefined` when it is empty. */
export function summarize(values: readonly number[]): Distribution | undefined {
  const sorted = finiteSorted(values);
  if (sorted.length === 0) {
    return undefined;
  }
  const centre = percentile(sorted, 0.5);
  const mad = medianAbsoluteDeviation(sorted, centre);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    sampleCount: sorted.length,
    median: centre,
    mad,
    normalizedMad: centre > 0 ? mad / centre : 0,
    p25,
    p75,
    iqr: Math.max(0, p75 - p25),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * Percentage change against a baseline median. Returns `undefined` when the
 * baseline median is not strictly positive, because the ratio is undefined.
 */
export function percentChange(
  current: number,
  baselineMedian: number,
): number | undefined {
  if (!Number.isFinite(current) || !(baselineMedian > 0)) {
    return undefined;
  }
  return clampFinite(((current - baselineMedian) / baselineMedian) * 100, 1e9);
}

/**
 * Compare an observation with a baseline distribution using the modified
 * z-score. MAD is preferred; a zero MAD falls back to the interquartile range
 * and finally reports that no robust scale was available.
 */
export function compareToDistribution(
  current: number,
  distribution: Distribution,
): RobustComparison {
  const deviation = current - distribution.median;
  let modifiedZScore = 0;
  let scaleMethod: ScaleMethod = 'unavailable';

  if (distribution.mad > 0) {
    scaleMethod = 'mad';
    modifiedZScore = (MAD_CONSISTENCY * deviation) / distribution.mad;
  } else if (distribution.iqr > 0) {
    scaleMethod = 'iqr';
    modifiedZScore = deviation / (distribution.iqr / IQR_CONSISTENCY);
  }

  return {
    current,
    distribution,
    percentChange: percentChange(current, distribution.median),
    modifiedZScore: clampFinite(modifiedZScore, MAX_ABSOLUTE_Z_SCORE),
    scaleMethod,
  };
}

/** Configurable regression thresholds. */
export interface RegressionThresholds {
  readonly regressionPercent: number;
  readonly modifiedZScore: number;
  readonly minimumSamples: number;
  readonly shapeSimilarityThreshold: number;
}

/** Context that decides whether a comparison may be trusted at all. */
export interface RegressionContext {
  readonly sampleCount: number;
  readonly shapeSimilarity: number;
}

/** Outcome of a single regression decision. */
export type RegressionVerdict =
  'regression' | 'improvement' | 'stable' | 'inconclusive';

/** Qualitative trust in a regression decision. */
export type ComparisonConfidence = 'high' | 'medium' | 'low';

/** A regression decision plus the reasons behind it. */
export interface RegressionDecision {
  readonly verdict: RegressionVerdict;
  readonly confidence: ComparisonConfidence;
  readonly reasons: string[];
}

function decideConfidence(
  comparison: RobustComparison,
  context: RegressionContext,
  thresholds: RegressionThresholds,
): ComparisonConfidence {
  if (
    comparison.scaleMethod === 'mad' &&
    context.sampleCount >= 5 &&
    context.shapeSimilarity >= 0.95
  ) {
    return 'high';
  }
  if (
    comparison.scaleMethod !== 'unavailable' &&
    context.sampleCount >= thresholds.minimumSamples &&
    context.shapeSimilarity >= thresholds.shapeSimilarityThreshold
  ) {
    return 'medium';
  }
  return 'low';
}

/**
 * Decide whether an observation is a regression. When no robust scale exists
 * the decision falls back to percentage change with lowered confidence, as
 * required by the design contract for a zero MAD.
 */
export function evaluateRegression(
  comparison: RobustComparison,
  context: RegressionContext,
  thresholds: RegressionThresholds,
): RegressionDecision {
  const reasons: string[] = [];
  const confidence = decideConfidence(comparison, context, thresholds);

  if (context.sampleCount < thresholds.minimumSamples) {
    reasons.push('insufficient-samples');
  }
  if (context.shapeSimilarity < thresholds.shapeSimilarityThreshold) {
    reasons.push('workflow-shape-changed');
  }
  if (comparison.percentChange === undefined) {
    reasons.push('baseline-median-not-positive');
  }
  if (reasons.length > 0) {
    return { verdict: 'inconclusive', confidence: 'low', reasons };
  }

  const change = comparison.percentChange ?? 0;
  const meetsScale =
    comparison.scaleMethod === 'unavailable'
      ? true
      : Math.abs(comparison.modifiedZScore) >= thresholds.modifiedZScore;

  if (comparison.scaleMethod === 'unavailable') {
    reasons.push('robust-scale-unavailable');
  }

  if (change >= thresholds.regressionPercent && meetsScale) {
    return { verdict: 'regression', confidence, reasons };
  }
  if (change <= -thresholds.regressionPercent && meetsScale) {
    return { verdict: 'improvement', confidence, reasons };
  }
  return { verdict: 'stable', confidence, reasons };
}
