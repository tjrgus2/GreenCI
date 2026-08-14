import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  GreenCIConfigFileSchema,
  hashConfig,
  resolveConfig,
} from '../src/domain/config.js';
import { canonicalHash, canonicalJson } from '../src/util/canonical.js';

describe('canonical serialization', () => {
  it('orders keys deterministically and drops unrepresentable values', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(
      '{"a":[2,{"c":3,"d":4}],"b":1}',
    );
    expect(canonicalJson({ a: undefined, b: Number.NaN })).toBe('{"b":null}');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(() => 1)).toBe('null');
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  });
});

describe('configuration resolution', () => {
  it('uses bundled defaults when no file exists', () => {
    const result = resolveConfig(undefined);
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings).toEqual([]);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('applies a valid repository configuration file', () => {
    const result = resolveConfig({
      version: 1,
      locale: 'ko',
      baseline: {
        'successful-runs': 5,
        statistics: { 'regression-percent': 25 },
      },
      carbon: { region: 'kr', 'simulation-samples': 500 },
    });
    expect(result.warnings).toEqual([]);
    expect(result.config.locale).toBe('ko');
    expect(result.config.baseline.successfulRuns).toBe(5);
    expect(result.config.baseline.statistics.regressionPercent).toBe(25);
    expect(result.config.baseline.statistics.modifiedZScore).toBe(3.5);
    expect(result.config.carbon.region).toBe('KR');
    expect(result.config.carbon.simulationSamples).toBe(500);
  });

  it('rejects unknown keys and degrades to defaults with a warning', () => {
    const result = resolveConfig({ verison: 1 });
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings[0]?.code).toBe('CONFIG_INVALID');
    expect(result.warnings[0]?.message).toContain('verison');
  });

  it('rejects an inconsistent triangular range', () => {
    expect(
      GreenCIConfigFileSchema.safeParse({
        carbon: { pue: { min: 2, mode: 1, max: 3 } },
      }).success,
    ).toBe(false);
  });

  it('lets Action inputs win over the configuration file', () => {
    const result = resolveConfig(
      { locale: 'ko', baseline: { 'successful-runs': 5 } },
      { locale: 'en', baselineRuns: 3 },
    );
    expect(result.config.locale).toBe('en');
    expect(result.config.baseline.successfulRuns).toBe(3);
    expect(result.config.baseline.minimumSamples).toBeLessThanOrEqual(3);
  });

  it('hashes equal configurations to the same value', () => {
    expect(hashConfig(DEFAULT_CONFIG)).toBe(
      resolveConfig(undefined).configHash,
    );
    expect(hashConfig(DEFAULT_CONFIG)).not.toBe(
      resolveConfig({ carbon: { region: 'KR' } }).configHash,
    );
  });
});
