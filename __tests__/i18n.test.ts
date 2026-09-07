import fs from "node:fs";
import path from "node:path";
import appJson from "../app.json";
import { BRIEFING_IDS, briefingFor } from "../src/satellite/briefing";
import { BRIEFING_TEXTS } from "../src/i18n/briefings";
import { kilometres, lookDirection, orbitPeriod, speed } from "../src/i18n/format";
import { introPages } from "../src/onboarding/introPages";
import {
  FALLBACK_LOCALE,
  Locale,
  LOCALES,
  resolveLocale,
  setLocaleForTesting,
  stringsFor,
  strings
} from "../src/i18n";
import { SATELLITE_CATEGORIES } from "../src/satellite/categories";

afterEach(() => setLocaleForTesting(undefined));

/**
 * Roughly how wide a string draws, in layout points.
 *
 * There is no text measurement in a Node test runner, and there does not need
 * to be: what these checks are for is catching a translation that has grown
 * past the pill it sits in, and a per-character estimate catches that a long
 * way before the error bars matter. The three classes are the ones that differ
 * enough to matter — a Han character is about one em where a Latin one is a
 * little over half — and the coefficients are the conservative end of what the
 * system font actually measures.
 */
function width(text: string, fontSize: number, letterSpacing = 0): number {
  let ems = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x2e80 && code <= 0xa4cf) ems += 1; // CJK and kana
    else if (code >= 0xac00 && code <= 0xd7af) ems += 1; // Hangul syllables
    else if (code >= 0xff00 && code <= 0xff60) ems += 1; // fullwidth forms
    else ems += 0.62;
  }
  return ems * fontSize + [...text].length * letterSpacing;
}

describe("which language the app opens in", () => {
  test("the phone's own preference, matched on the language and not the region", () => {
    expect(resolveLocale(["pt-BR"])).toBe("pt");
    expect(resolveLocale(["zh-Hans-CN"])).toBe("zh");
    // Apple's underscore form, which is what `AppleLocale` reports.
    expect(resolveLocale(["de_DE"])).toBe("de");
  });

  test("the first supported entry in the list, not the first entry", () => {
    // A phone set to Catalan with Spanish behind it should read Spanish, not
    // English: walking the whole preference list is the point of having one.
    expect(resolveLocale(["ca-ES", "es-ES", "en"])).toBe("es");
  });

  test("English when the phone asks for something the app does not speak", () => {
    expect(resolveLocale(["is-IS"])).toBe(FALLBACK_LOCALE);
    expect(resolveLocale([])).toBe(FALLBACK_LOCALE);
  });
});

describe("every language says everything", () => {
  /** Every leaf path in a table, so two tables can be compared key for key. */
  function paths(value: unknown, prefix = ""): string[] {
    if (typeof value === "string") return [prefix];
    if (Array.isArray(value)) return value.flatMap((item, index) => paths(item, `${prefix}[${index}]`));
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([key, child]) =>
        paths(child, prefix ? `${prefix}.${key}` : key)
      );
    }
    return [];
  }

  /** The values at those paths, in the same order. */
  function leaves(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(leaves);
    if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
    return [];
  }

  const english = stringsFor("en");

  test.each(LOCALES)("%s carries the same keys as English", (locale) => {
    expect(paths(stringsFor(locale))).toEqual(paths(english));
  });

  test.each(LOCALES)("%s leaves nothing blank", (locale) => {
    for (const value of leaves(stringsFor(locale))) {
      expect(value.trim()).not.toBe("");
    }
  });

  test.each(LOCALES)("%s keeps every placeholder it was given", (locale) => {
    // A `{count}` dropped in translation is a sentence with the number missing
    // from it, which reads as a bug rather than as a translation.
    const table = stringsFor(locale);
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    const englishLeaves = leaves(english);

    leaves(table).forEach((value, index) => {
      expect(placeholders(value)).toEqual(placeholders(englishLeaves[index]));
    });
  });

  test.each(LOCALES)("%s has a compass with eight distinct points", (locale) => {
    const compass = stringsFor(locale).compass;
    expect(compass).toHaveLength(8);
    expect(new Set(compass).size).toBe(8);
  });
});

/**
 * The panels are pills over a camera picture, sized for the English in them.
 *
 * Every budget below is the space the component actually gives the string, in
 * layout points, read off the stylesheet beside it. These are the checks that
 * a translation has to pass to ship: a word that overruns its pill does not
 * wrap gracefully over a photograph of the sky, it covers the sky.
 */
describe("and says it in the space it is given", () => {
  test.each(LOCALES)("%s fits the filter panel", (locale) => {
    const t = stringsFor(locale).filter;

    // The closed pill: title, an optional count and a chevron, at `right: 12`.
    expect(width(t.title, 10, 1)).toBeLessThan(90);
    // The label column of a 164pt row, less the swatch and the toggle. Rows
    // may grow, but every point of growth is sky the panel covers.
    for (const category of SATELLITE_CATEGORIES) {
      expect(width(t.categories[category], 10)).toBeLessThan(135);
    }
    expect(width(t.showAll, 9, 1)).toBeLessThan(130);
    // Wraps to a second line if it has to, so this is two lines of the panel.
    expect(width(t.ringKey, 8, 0.4)).toBeLessThan(260);
  });

  test.each(LOCALES)("%s fits the satellite card", (locale) => {
    const t = stringsFor(locale).card;

    // The card is the screen's width less 8 either side; the label column of a
    // fact row leaves room for the figure it is labelling.
    for (const label of Object.values(t.facts)) {
      expect(width(label, 10)).toBeLessThan(130);
    }
    // The purpose line: a category, a separator and this, beside a 38pt close
    // button on a 375pt screen.
    const purpose = `${stringsFor(locale).filter.categories.COMMS} · ${t.holdsStation}`;
    expect(width(purpose, 9, 0.6)).toBeLessThan(290);
  });

  test.each(LOCALES)("%s fits the buttons", (locale) => {
    const t = stringsFor(locale);
    // Full-width buttons inside a card of at most 380, less 20 either side.
    expect(width(t.boot.tryAgain, 11, 1.5)).toBeLessThan(320);
    expect(width(t.intro.next, 11, 1.5)).toBeLessThan(320);
    expect(width(t.intro.allowAccess, 11, 1.5)).toBeLessThan(320);
  });

  test.each(LOCALES)("%s fits the compass notice", (locale) => {
    // The notice runs from `left: 12` to `right: 112` — the console pill keeps
    // the rest of that row — so on the narrowest phone this ships to it is
    // 251pt wide, less 10 of padding either side.
    const t = stringsFor(locale).compassNotice;
    expect(width(t.calibrate.title, 11)).toBeLessThan(231);
    expect(width(t.magnetic.title, 11)).toBeLessThan(231);
  });

  test.each(LOCALES)("%s fits the figures on one line", (locale) => {
    setLocaleForTesting(locale);
    // The widest reading the card ever shows: a full compass point, a bearing
    // and an elevation, against the figure column of the card.
    // The figure column of a fact row on the narrowest phone this ships to:
    // a 375pt screen gives the card 359, less 20 of padding, less the widest
    // label any language puts beside this row and the 12pt gap after it.
    const look = lookDirection({ azimuthDeg: 225, elevationDeg: -8.2 });
    expect(width(look, 12)).toBeLessThan(246);
    expect(width(kilometres(35786), 12)).toBeLessThan(120);
    expect(width(orbitPeriod(1436), 12)).toBeLessThan(150);
    expect(width(speed(7.58), 12)).toBeLessThan(120);
  });
});

describe("the figures follow the reader's conventions", () => {
  test("English is unchanged: a comma for the thousands, a point for the decimal", () => {
    setLocaleForTesting("en");
    expect(kilometres(35786)).toBe("35,786 km");
    expect(speed(7.58)).toBe("7.6 km/s");
    expect(orbitPeriod(1436)).toBe("23h 56m");
    expect(orbitPeriod(95.6)).toBe("96 min");
    expect(lookDirection({ azimuthDeg: 143.2, elevationDeg: 27.4 })).toBe("SE 143° · 27° up");
  });

  test("and the other way round where that is what a number means", () => {
    // `1.240` is one and a quarter to an English reader and twelve hundred to
    // a German one. Getting this backwards is a factor of a thousand.
    setLocaleForTesting("de");
    expect(kilometres(35786)).toBe("35.786 km");
    expect(speed(7.58)).toBe("7,6 km/s");
  });

  test("the compass is the one that language uses", () => {
    setLocaleForTesting("de");
    // German turns east into O, so N/E/S/W would be read as north/?/south/west.
    expect(lookDirection({ azimuthDeg: 90, elevationDeg: 10 })).toContain("O 90°");
    setLocaleForTesting("nl");
    expect(lookDirection({ azimuthDeg: 180, elevationDeg: 10 })).toContain("Z 180°");
  });

  test("digits stay Latin, including in Arabic", () => {
    // The marker count in the corner is a bare number and always will be; one
    // screen counting in 12 while its card measures in ١٢٤٠ is worse than
    // either convention held to throughout.
    setLocaleForTesting("ar");
    expect(kilometres(35786)).toMatch(/35.786/);
  });

  test("an orbit with no period is a dash rather than a wrong figure", () => {
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      expect(orbitPeriod(Number.NaN)).toBe(stringsFor(locale).units.unknown);
    }
  });
});

describe("the satellite descriptions", () => {
  test.each(LOCALES.filter((locale) => locale !== "en"))(
    "%s describes every object the catalogue can produce",
    (locale) => {
      const table = BRIEFING_TEXTS[locale as Locale];
      const missing = BRIEFING_IDS.filter((id) => !table[id]);
      expect(missing).toEqual([]);
    }
  );

  test("a description with no translation still says something", () => {
    // The tables are partial by design: a fleet added to `briefing.ts` should
    // reach every language the same day, in English, rather than leaving a
    // blank space in eleven of them until someone gets round to it.
    setLocaleForTesting("fr");
    const briefing = briefingFor({
      name: "SOMETHING UNRECOGNISED 3",
      noradId: 99999,
      category: "OTHER",
      parked: false
    });
    expect(briefing.text.length).toBeGreaterThan(20);
  });

  test("the operator's own page is not translated, because there is no translation of it", () => {
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      const iss = briefingFor({ name: "ISS", noradId: 25544, category: "LANDMARK", parked: false });
      expect(iss.url).toBe("https://www.nasa.gov/international-space-station/");
      expect(iss.text.length).toBeGreaterThan(40);
    }
  });
});

test("the console is the one thing that stays in English", () => {
  // Its rows are the names of things in this codebase, read against the source
  // by whoever is diagnosing a phone that is drawing the sky in the wrong
  // place. The intro says as much on the page that keys the panels.
  setLocaleForTesting("ja");
  expect(strings().intro.screen.console.meaning).toMatch(/英語/);
});

/**
 * How tall the intro's third page comes out, per language.
 *
 * The one page in the app whose height is not bounded by its own design: it
 * is a title, a paragraph and four explained badges, and every one of those is
 * a translated string that can run a line longer than the English it replaced.
 * The card is bottom-aligned and grows upwards into the sky, so a page that
 * outgrows the screen does not scroll — it walks off the top.
 *
 * The figures are read off `IntroScreen`'s stylesheet. The card now scrolls if
 * it has to (see `styles.card`), so overrunning this is a degraded page rather
 * than a broken one — which is why the budget is the *smallest* screen the app
 * ships to rather than the one it is designed on.
 */
describe("the page that explains the screen fits the screen", () => {
  /** Layout points of text, wrapped into a column of `column` points. */
  function blockHeight(text: string, fontSize: number, lineHeight: number, column: number): number {
    return Math.max(1, Math.ceil(width(text, fontSize) / column)) * lineHeight;
  }

  /**
   * The card's own width on a 375pt phone: the screen, less the page's 20pt
   * gutters and the card's 20pt padding, either side.
   */
  const CARD_COLUMN = 375 - 20 * 2 - 20 * 2;
  /** The same, less the 74pt badge and the 10pt after it. */
  const ELEMENT_COLUMN = CARD_COLUMN - 74 - 10;

  /**
   * What the pager has to spend, on the shortest screen the app runs on.
   *
   * A 375 x 667 phone, less the footer under the pager — 18 of padding, the
   * 6pt dots, the button's 18pt margin, its 28 of padding and 13pt label, and
   * 26 of padding under it — and the status bar inset above.
   */
  const PAGER_HEIGHT = 667 - (18 + 6 + 18 + 28 + 13 + 26) - 20;

  test.each(LOCALES)("%s", (locale) => {
    setLocaleForTesting(locale);
    const page = introPages()[2];

    let height = 20 * 2; // The card's own padding.
    height += blockHeight(page.title ?? "", 19, 23, CARD_COLUMN);
    height += 10 + blockHeight(page.body, 13, 19, CARD_COLUMN);
    for (const element of page.elements ?? []) {
      height += 12 + blockHeight(element.where, 10, 13, ELEMENT_COLUMN);
      height += 2 + blockHeight(element.meaning, 11.5, 16, ELEMENT_COLUMN);
    }

    expect(height).toBeLessThan(PAGER_HEIGHT);
  });
});

/**
 * What iOS itself asks, in `locales/`.
 *
 * These two sentences are read by the operating system out of the app bundle
 * before a line of JavaScript runs — see `locales/README.md` — so they live
 * outside `src/i18n` and nothing in the app can fall back for them. A language
 * the app speaks with no file here gets an English system prompt over a
 * translated screen, seconds after the intro promised the prompt was coming.
 */
describe("the prompts the operating system shows", () => {
  const DIRECTORY = path.join(__dirname, "..", "locales");

  /**
   * Apple names bundle localizations by script, so Simplified Chinese is
   * `zh-Hans` in a `.lproj` and `zh` everywhere else. The one place the two
   * naming schemes have to be reconciled is here.
   */
  const APPLE_CODE: Partial<Record<Locale, string>> = { zh: "zh-Hans" };
  const appleCode = (locale: Locale) => APPLE_CODE[locale] ?? locale;

  /** The keys iOS reads, matching the English pair in `app.json`. */
  const KEYS = ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"];

  function read(locale: Locale): Record<string, string> {
    return JSON.parse(
      fs.readFileSync(path.join(DIRECTORY, `${appleCode(locale)}.json`), "utf8")
    ) as Record<string, string>;
  }

  test("app.json points at one file per language the app speaks", () => {
    const declared = (appJson as { expo: { locales: Record<string, string> } }).expo.locales;

    expect(Object.keys(declared).sort()).toEqual(LOCALES.map(appleCode).sort());
    for (const [code, file] of Object.entries(declared)) {
      expect(file).toBe(`./locales/${code}.json`);
    }
  });

  test.each(LOCALES)("%s says both of them", (locale) => {
    const strings = read(locale);

    expect(Object.keys(strings).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      // Long enough to be a reason. Chinese and Japanese say it in far fewer
      // characters than English, which is why this is not the English bound.
      expect(strings[key].trim().length).toBeGreaterThan(15);
      // And short enough to read in a modal someone is deciding inside.
      expect(strings[key].length).toBeLessThan(140);
    }
  });

  test.each(LOCALES)("%s stays inside what a .strings file can hold", (locale) => {
    // Expo writes these as `KEY = "value";` without escaping anything, so a
    // quotation mark inside a sentence ends the string early and leaves the
    // file unparseable — a build failure at best, and a prompt with no text in
    // it at worst. Use a typographic quote instead.
    for (const value of Object.values(read(locale))) {
      expect(value).not.toMatch(/["\\\n\r]/);
    }
  });
});
