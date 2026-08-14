import { en, type MessageKey, type Messages } from './en.js';
import { ko } from './ko.js';

/** Supported report locales. Console logs and JSON fields stay English. */
export type Locale = 'en' | 'ko';

/** Every bundled locale, keyed by its identifier. */
export const locales: Readonly<Record<Locale, Messages>> = { en, ko };

/** Resolve one message key with `{name}` placeholder interpolation. */
export type Translator = (
  key: MessageKey,
  parameters?: Readonly<Record<string, string | number>>,
) => string;

/** Build a translator for one locale, falling back to English keys. */
export function createTranslator(locale: Locale): Translator {
  const bundle = locales[locale];
  return (key, parameters) => {
    const template = bundle[key];
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
  };
}

export { en, ko };
export type { MessageKey, Messages };
