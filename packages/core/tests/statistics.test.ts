import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compareToDistribution,
  evaluateRegression,
  median,
  medianAbsoluteDeviation,
  percentChange,
  percentile,
  summarize,
  type RegressionThresholds,
} from '../src/analysis/statistics.js';

const thresholds: RegressionThresholds = {
  regressionPercent: 15,
  modifiedZScore: 3.5,
  minimumSamples: 3,
  shapeSimilarityThreshold: 0.8,
};

const stableContext = { sampleCount: 7, shapeSimilarity: 1 };

describe('robust summary statistics', () => {
  it('computes median, MAD, and percentiles', () => {
    expect(median([100, 102, 99, 101, 98, 100, 300])).toBe(100);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(medianAbsoluteDeviation([100, 102, 99, 101, 98, 100, 300])).toBe(1);
    expect(medianAbsoluteDeviation([])).toBe(0);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5], 1.5)).toBe(5);
  });

  it('summarizes a sample and rejects an empty one', () => {
    const distribution = summarize([100, 102, 99, 101, 98, 100, 300]);
    expect(distribution?.sampleCount).toBe(7);
    expect(distribution?.median).toBe(100);
    expect(distribution?.min).toBe(98);
    expect(distribution?.max).toBe(300);
    expect(distribution?.iqr).toBeGreaterThan(0);
    expect(summarize([])).toBeUndefined();
    expect(summarize([Number.NaN])).toBeUndefined();
  });

  it('returns no percent change when the baseline median is not positive', () => {
    expect(percentChange(10, 0)).toBeUndefined();
    expect(percentChange(Number.NaN, 10)).toBeUndefined();
    expect(percentChange(125, 100)).toBe(25);
  });
});

describe('modified z-score', () => {
  it('resists a single very slow baseline run', () => {
    const distribution = summarize([100, 102, 99, 101, 98, 100, 300]);
    expect(distribution).toBeDefined();
    if (distribution === undefined) {
      return;
    }
    const comparison = compareToDistribution(125, distribution);
    expect(comparison.scaleMethod).toBe('mad');
    expect(comparison.percentChange).toBe(25);
    expect(comparison.modifiedZScore).toBeGreaterThan(3.5);
    expect(
      evaluateRegression(comparison, stableContext, thresholds).verdict,
    ).toBe('regression');
  });

  it('falls back to the interquartile range when MAD is zero', () => {
    const distribution = summarize([100, 100, 100, 100, 130, 130]);
    expect(distribution?.mad).toBe(0);
    if (distribution === undefined) {
      return;
    }
    const comparison = compareToDistribution(160, distribution);
    expect(comparison.scaleMethod).toBe('iqr');
    expect(Number.isFinite(comparison.modifiedZScore)).toBe(true);
  });

  it('uses percentage change alone when no robust scale exists', () => {
    const distribution = summarize([100, 100, 100, 100, 100]);
    expect(distribution?.mad).toBe(0);
    expect(distribution?.iqr).toBe(0);
    if (distribution === undefined) {
      return;
    }
    const comparison = compareToDistribution(130, distribution);
    expect(comparison.scaleMethod).toBe('unavailable');
    expect(comparison.modifiedZScore).toBe(0);
    const decision = evaluateRegression(comparison, stableContext, thresholds);
    expect(decision.verdict).toBe('regression');
    expect(decision.confidence).toBe('low');
    expect(decision.reasons).toContain('robust-scale-unavailable');
  });

  it('detects improvements and stability symmetrically', () => {
    const distribution = summarize([100, 102, 99, 101, 98, 100, 103]);
    if (distribution === undefined) {
      return;
    }
    expect(
      evaluateRegression(
        compareToDistribution(70, distribution),
        stableContext,
        thresholds,
      ).verdict,
    ).toBe('improvement');
    expect(
      evaluateRegression(
        compareToDistribution(101, distribution),
        stableContext,
        thresholds,
      ).verdict,
    ).toBe('stable');
  });

  it('refuses to decide without enough samples or a comparable shape', () => {
    const distribution = summarize([100, 120]);
    if (distribution === undefined) {
      return;
    }
    const comparison = compareToDistribution(200, distribution);
    expect(
      evaluateRegression(
        comparison,
        { sampleCount: 2, shapeSimilarity: 1 },
        thresholds,
      ).verdict,
    ).toBe('inconclusive');
    expect(
      evaluateRegression(
        comparison,
        { sampleCount: 7, shapeSimilarity: 0.5 },
        thresholds,
      ).reasons,
    ).toContain('workflow-shape-changed');
  });

  it('grades confidence from sample size, shape, and scale method', () => {
    const wide = summarize([100, 102, 99, 101, 98, 100, 103]);
    if (wide === undefined) {
      return;
    }
    expect(
      evaluateRegression(
        compareToDistribution(101, wide),
        { sampleCount: 7, shapeSimilarity: 1 },
        thresholds,
      ).confidence,
    ).toBe('high');
    expect(
      evaluateRegression(
        compareToDistribution(101, wide),
        { sampleCount: 3, shapeSimilarity: 0.85 },
        thresholds,
      ).confidence,
    ).toBe('medium');
  });
});

describe('statistics invariants', () => {
  it('never produces NaN or infinity for arbitrary finite samples', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1e6, noNaN: true }), {
          minLength: 1,
          maxLength: 40,
        }),
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        (samples, current) => {
          const distribution = summarize(samples);
          expect(distribution).toBeDefined();
          if (distribution === undefined) {
            return;
          }
          const comparison = compareToDistribution(current, distribution);
          expect(Number.isFinite(comparison.modifiedZScore)).toBe(true);
          expect(
            comparison.percentChange === undefined ||
              Number.isFinite(comparison.percentChange),
          ).toBe(true);
          expect(distribution.mad).toBeGreaterThanOrEqual(0);
          expect(distribution.iqr).toBeGreaterThanOrEqual(0);
          expect(distribution.min).toBeLessThanOrEqual(distribution.median);
          expect(distribution.median).toBeLessThanOrEqual(distribution.max);
        },
      ),
    );
  });
});
