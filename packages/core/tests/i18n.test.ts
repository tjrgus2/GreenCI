import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  en,
  ko,
  locales,
} from '../src/reporting/i18n/index.js';

describe('internationalization', () => {
  it('defines every English key in every other locale and nothing more', () => {
    const englishKeys = Object.keys(en).sort();
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(Object.keys(bundle).sort(), locale).toEqual(englishKeys);
      for (const [key, value] of Object.entries(bundle)) {
        expect(value.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the same placeholder set in every locale', () => {
    const placeholders = (value: string): string[] =>
      [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)]
        .map((match) => match[1] ?? '')
        .sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('interpolates named parameters and leaves unknown ones untouched', () => {
    const translate = createTranslator('en');
    expect(
      translate('headline.insufficient', { samples: 2, minimum: 3 }),
    ).toContain('Only 2 comparable baseline runs');
    expect(translate('headline.insufficient')).toContain('{samples}');
    expect(translate('headline.insufficient', { samples: 2 })).toContain(
      '{minimum}',
    );
    expect(translate('report.title')).toBe(en['report.title']);
  });

  it('renders Korean report text while keeping identifiers English', () => {
    const translate = createTranslator('ko');
    expect(translate('metric.runnerTime')).toBe('🖥 러너 시간');
    expect(translate('confidence.high')).toBe('높음');
  });
});
