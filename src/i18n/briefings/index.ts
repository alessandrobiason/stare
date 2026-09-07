import type { BriefingId } from "../../satellite/briefing";
import { activeLocale, Locale } from "../locale";
import { ar } from "./ar";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { nl } from "./nl";
import { pt } from "./pt";
import { ru } from "./ru";
import { zh } from "./zh";

/**
 * The satellite descriptions, in eleven languages besides the one they were
 * written in.
 *
 * Separate from the interface strings for two reasons. This is by far the most
 * text in the app — around a hundred paragraphs a language — and it is the
 * only text that is *incomplete by design*: the catalogue grows new fleets,
 * each arrives as an English paragraph in `briefing.ts`, and it should show up
 * in every language the same day rather than waiting for eleven translations.
 * So the tables are partial and fall back per entry.
 *
 * What is *not* here is the operator's link, which is the same URL in every
 * language, and the object's name, which is the catalogue's.
 */
export type BriefingTexts = Partial<Record<BriefingId, string>>;

/** English is not a table: it is the text in `briefing.ts`, which is the original. */
export const BRIEFING_TEXTS: Record<Locale, BriefingTexts> = {
  en: {},
  it,
  es,
  fr,
  de,
  pt,
  nl,
  ru,
  zh,
  ja,
  ko,
  ar
};

/**
 * The translated text for one entry, or `undefined` to fall back to English.
 *
 * Takes a plain `string` rather than a `BriefingId` so that `briefing.ts` can
 * call it while still being the module the id union is derived from; the
 * tables it reads are typed, which is where the checking actually happens.
 */
export function briefingText(id: string): string | undefined {
  return BRIEFING_TEXTS[activeLocale()][id as BriefingId];
}
