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

  it('names the unknown key it rejected and degrades to defaults', () => {
    const result = resolveConfig({ verison: 1 });
    expect(result.config).toEqual(DEFAULT_CONFIG);
    expect(result.warnings[0]?.code).toBe('CONFIG_INVALID');
    expect(result.warnings[0]?.message).toContain('unknown key(s) `verison`');
    expect(result.warnings[0]?.message).toContain('did you mean `version`?');
    expect(result.warnings[0]?.message).toContain('(root)');
  });

  it('suggests the intended key inside a nested section', () => {
    expect(
      resolveConfig({ carbon: { regoin: 'KR' } }).warnings[0]?.message,
    ).toContain('did you mean `region`?');
    expect(
      resolveConfig({ baseline: { 'workflow-shape-threshhold': 0.9 } })
        .warnings[0]?.message,
    ).toContain('did you mean `workflow-shape-threshold`?');
    expect(
      resolveConfig({ baseline: { statistics: { 'regresion-percent': 20 } } })
        .warnings[0]?.message,
    ).toContain('did you mean `regression-percent`?');
  });

  it('suggests an optional key that has no default', () => {
    expect(
      resolveConfig({ baseline: { brnach: 'main' } }).warnings[0]?.message,
    ).toContain('did you mean `branch`?');
  });

  it('suggests a key inside an array element', () => {
    expect(
      resolveConfig({
        policy: { rules: [{ metrik: 'failed-jobs', value: 0 }] },
      }).warnings[0]?.message,
    ).toContain('did you mean `metric`?');
  });

  it('offers no suggestion for a key that resembles nothing', () => {
    const message =
      resolveConfig({ zzzzqqqwwww: true }).warnings[0]?.message ?? '';
    expect(message).toContain('`zzzzqqqwwww`');
    expect(message).not.toContain('did you mean');
  });

  it('locates a nested value error by path', () => {
    const result = resolveConfig({ baseline: { 'successful-runs': 999 } });
    expect(result.warnings[0]?.message).toContain('baseline.successful-runs');
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
