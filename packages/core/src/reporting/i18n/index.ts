import { en, type MessageKey, type Messages } from './en.js';
import { ko } from './ko.js';

/** Supported report locales. Console logs and JSON fields stay English. */
export type Locale = 'en' | 'ko';

/** Every bundled locale, keyed by its identifier. */
export const locales: Readonly<Record<Locale, Messages>> = { en, ko };

/** Interpolate `{name}` placeholders, leaving unknown ones untouched. */
function interpolate(
  template: string,
  parameters?: Readonly<Record<string, string | number>>,
): string {
  if (parameters === undefined) {
    return template;
  }
  return template.replaceAll(
    /\{([a-zA-Z0-9_]+)\}/gu,
    (match: string, name: string) => {
      const value = parameters[name];
      return value === undefined ? match : String(value);
    },
  );
}

/** Resolve a message key with `{name}` placeholder interpolation. */
export interface Translator {
  (
    key: MessageKey,
    parameters?: Readonly<Record<string, string | number>>,
  ): string;

  /**
   * Resolve a key that is only known at runtime — a rule id, a warning code, an
   * evidence source — falling back to the text the analyzer produced.
   *
   * The JSON report is deliberately locale-independent, so prose generated
   * during analysis is English. Rendering translates it back through a stable
   * key. An unrecognized key falls back rather than throwing, because a custom
   * rule or an upstream error message has no translation to find.
   */
  optional(
    key: string,
    fallback: string,
    parameters?: Readonly<Record<string, string | number>>,
  ): string;
}

/** Build a translator for one locale. */
export function createTranslator(locale: Locale): Translator {
  const bundle = locales[locale];
  const translate = ((key: MessageKey, parameters) =>
    interpolate(bundle[key], parameters)) as Translator;
  translate.optional = (key, fallback, parameters) =>
    interpolate(
      key in bundle ? bundle[key as MessageKey] : fallback,
      parameters,
    );
  return translate;
}

export { en, ko };
export type { MessageKey, Messages };
