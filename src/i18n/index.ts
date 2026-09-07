import { activeLocale, FALLBACK_LOCALE, Locale } from "./locale";
import { ar } from "./strings/ar";
import { de } from "./strings/de";
import { en } from "./strings/en";
import { es } from "./strings/es";
import { fr } from "./strings/fr";
import { it } from "./strings/it";
import { ja } from "./strings/ja";
import { ko } from "./strings/ko";
import { nl } from "./strings/nl";
import { pt } from "./strings/pt";
import { ru } from "./strings/ru";
import { zh } from "./strings/zh";
import type { Strings } from "./types";

export * from "./locale";
export type { Strings } from "./types";

/**
 * Every language, statically. Nothing is loaded on demand.
 *
 * The alternative would be a dynamic import per locale, which React Native has
 * no code splitting for: the whole bundle ships to the phone either way, so a
 * lazy table would buy nothing but a screen of English while it resolved.
 */
export const STRINGS: Record<Locale, Strings> = { en, it, es, fr, de, pt, nl, ru, zh, ja, ko, ar };

/** What the app says, in the language the app is currently set to. */
export function strings(): Strings {
  return STRINGS[activeLocale()] ?? STRINGS[FALLBACK_LOCALE];
}

export function stringsFor(locale: Locale): Strings {
  return STRINGS[locale] ?? STRINGS[FALLBACK_LOCALE];
}

/**
 * Fills `{placeholders}` in a string from the tables above.
 *
 * Deliberately tiny. The app's messages take one or two values and never a
 * plural or a date, so what a real message formatter buys here is a dependency
 * and a syntax; a name in braces is legible in twelve files at once.
 *
 * A placeholder with nothing to fill it is left standing rather than blanked,
 * because `27° up` losing its number reads as a rendering bug, while
 * `{degrees}° up` reads as the missing value it is.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  );
}
