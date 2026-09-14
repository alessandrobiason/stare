import type { BriefingId } from "../../satellite/briefing";
import { activeLocale, Locale } from "../locale";
import { it } from "./it";

/**
 * The satellite descriptions, in Italian besides the English they were
 * written in.
 *
 * Separate from the interface strings for two reasons. This is by far the most
 * text in the app — around a hundred paragraphs a language — and it is the
 * only text that is *incomplete by design*: the catalogue grows new fleets,
 * each arrives as an English paragraph in `briefing.ts`, and it should show up
 * in every language the same day rather than waiting on a translation.
 * So the table is partial and falls back per entry.
 *
 * What is *not* here is the operator's link, which is the same URL in every
 * language, and the object's name, which is the catalogue's.
 */
export type BriefingTexts = Partial<Record<BriefingId, string>>;

/** English is not a table: it is the text in `briefing.ts`, which is the original. */
export const BRIEFING_TEXTS: Record<Locale, BriefingTexts> = {
  en: {},
  it
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
