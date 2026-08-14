import { describe, expect, it } from 'vitest';
import {
  closestKey,
  describeUnknownKey,
  editDistance,
} from '../src/domain/suggest.js';

const keys = ['region', 'simulation-samples', 'enabled', 'utilization'];

describe('edit distance', () => {
  it('measures the documented cases', () => {
    expect(editDistance('region', 'region')).toBe(0);
    expect(editDistance('regoin', 'region')).toBe(2);
    expect(editDistance('', 'region')).toBe(6);
    expect(editDistance('region', '')).toBe(6);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });
});

describe('closest key', () => {
  it('finds a plausible correction', () => {
    expect(closestKey('regoin', keys)).toBe('region');
    expect(closestKey('Region', keys)).toBe('region');
    expect(closestKey('  enabled  ', keys)).toBe('enabled');
    expect(closestKey('simulation-sample', keys)).toBe('simulation-samples');
  });

  it('refuses to guess when nothing is close', () => {
    expect(closestKey('zzzzqqqwwww', keys)).toBeUndefined();
    expect(closestKey('region', [])).toBeUndefined();
  });

  it('prefers the closest of several candidates', () => {
    expect(closestKey('enable', ['enabled', 'disabled'])).toBe('enabled');
  });
});

describe('unknown key description', () => {
  it('includes a suggestion only when one exists', () => {
    expect(describeUnknownKey('regoin', keys)).toBe(
      '`regoin` (did you mean `region`?)',
    );
    expect(describeUnknownKey('zzzzqqqwwww', keys)).toBe('`zzzzqqqwwww`');
  });
});
