import fs from "node:fs";
import path from "node:path";
import appJson from "../app.json";
import { BRIEFING_IDS, briefingFor } from "../src/satellite/briefing";
import { BRIEFING_TEXTS } from "../src/i18n/briefings";
import {
  clockTime,
  kilometres,
  lookDirection,
  orbitPeriod,
  passDirection,
  passSeeing,
  seeing,
  seeingOnPass,
  speed,
  sunlightSummary,
  timeUntil
} from "../src/i18n/format";
import { MARK_TILE, PATH_FIGURE_HEIGHT, SAMPLE_PASSES } from "../src/onboarding/introFigures";
import { introPages } from "../src/onboarding/introPages";
import {
  FALLBACK_LOCALE,
  fill,
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
    // The panel hangs from the header's button: 248 wide, less 14 of padding
    // either side.
    const COLUMN = 248 - 14 * 2;

    // The title shares its row with the `3/6` count and the gap after it.
    expect(width(t.title, 10, 1.4)).toBeLessThan(COLUMN - 36);
    // The label column of a row, less the switch and a swatch's width of
    // margin — the rows carry none now, but the key rows under them do.
    // Rows may grow, but every point of growth is sky the panel covers.
    for (const category of SATELLITE_CATEGORIES) {
      expect(width(t.categories[category], 11, 0.3)).toBeLessThan(COLUMN - 10 - 9 - 8 - 36);
    }
    expect(width(t.showAll, 10, 1.2)).toBeLessThan(COLUMN);
    // Wraps to a second line if it has to, so this is two lines of the column
    // the key rows keep, less the swatch that heads them.
    expect(width(t.ringKey, 8, 0.4)).toBeLessThan(2 * (COLUMN - 19));
    // The other key row, the same size and in the same column: why half the
    // marks on a clear night sky are drawn faintly.
    expect(width(t.shadowKey, 8, 0.4)).toBeLessThan(2 * (COLUMN - 19));
  });

  test.each(LOCALES)("%s fits the header and the tab bar", (locale) => {
    const t = stringsFor(locale);
    // The line under the app's name, on the narrowest screen this ships to:
    // 375 less the layer's 18 and 16, less the filter button and its gap,
    // less the chevron that says the line opens.
    const COUNT_COLUMN = 375 - 18 - 16 - 40 - 12 - 12 - 5;
    expect(width(fill(t.scene.visibleSatellites, { count: 188 }), 13)).toBeLessThan(
      COUNT_COLUMN
    );

    // One word under an icon, in a bar of three equal tabs.
    for (const tab of Object.values(t.tabs)) {
      expect(width(tab, 10, 0.2)).toBeLessThan(375 / 3);
    }
  });

  test.each(LOCALES)("%s fits the two tabs that are not the sky", (locale) => {
    const t = stringsFor(locale);
    // The settings list: 375 less the sheet's 18 either side, less a row's own
    // 14 either side, less the chevron and the gap before it.
    const ROW = 375 - 18 * 2 - 14 * 2 - 16 - 12;
    expect(width(t.tabs.settings, 27)).toBeLessThan(375 - 18 * 2);
    // A row's label, and — on the language row — the value beside it. The
    // longest endonym is the one this has to leave room for.
    expect(width(t.guide.open, 14)).toBeLessThan(ROW / 2);
    expect(width(t.language.title, 14) + width("Português", 13)).toBeLessThan(ROW);
    // The line under a row's label, which wraps rather than being cut off.
    for (const detail of [t.intro.corners.guide.meaning, t.intro.corners.console.meaning]) {
      expect(width(detail, 11)).toBeLessThan(3 * ROW);
    }

    // The catalog's one line, centred in a 36pt-margined page and wrapping.
    expect(width(t.catalog.soon, 13)).toBeLessThan(4 * (375 - 36 * 2));
  });

  test.each(LOCALES)("%s fits the satellite card", (locale) => {
    const t = stringsFor(locale).card;
    // The card is the screen's width less 12 either side, less its own 14 of
    // padding either side.
    const COLUMN = 375 - 12 * 2 - 14 * 2;

    // The label column of a fact row leaves room for the figure it labels.
    for (const label of Object.values(t.facts)) {
      expect(width(label, 11)).toBeLessThan(COLUMN - 150 - 12);
    }
    // The purpose line under the name: a category, a separator and this,
    // between the mark's badge and the close button. One line — it is clipped
    // rather than wrapped — so this is the whole of the room it has.
    const purpose = `${stringsFor(locale).filter.categories.COMMS} · ${t.holdsStation}`;
    expect(width(purpose, 10, 0.7)).toBeLessThan(375 - 12 * 2 - 14 - 8 - 38 - 12 - 12 - 38);
  });

  test.each(LOCALES)("%s fits the sunlight line in the count panel", (locale) => {
    // The longest run of words the overlay puts over the sky. It wraps inside
    // the 150pt column the fleet rows below it keep, so what is checked is that
    // it wraps rather than that it fits on one line — three lines of that
    // column, past which the pill has become the thing on screen.
    for (const line of Object.values(stringsFor(locale).scene.sunlight)) {
      expect(width(line.replace("{count}", "12"), 10)).toBeLessThan(3 * 150);
    }
  });

  test.each(LOCALES)("%s fits the upcoming-passes card", (locale) => {
    setLocaleForTesting(locale);
    const t = stringsFor(locale).scene.passes;
    // The card is the screen less 12 either side, less 14 of padding either
    // side, less the badge, the chevron and the two gaps between them.
    const COLUMN = 375 - 12 * 2 - 14 * 2 - 38 - 12 - 12 - 16;

    // Shut, the top line is the name and the countdown, and the countdown is
    // the half that grows with the language — `1 Std. 22 Min.` is half again
    // the English. The name shrinks before it does, so what is checked is that
    // there is still a name's worth of room left beside it.
    for (const countdown of [timeUntil(82 * 60_000), timeUntil(14 * 60_000), t.now]) {
      expect(width(countdown, 12)).toBeLessThan(COLUMN - 80);
    }
    // Open, the title heads the same column.
    expect(width(t.title, 10, 1.4)).toBeLessThan(COLUMN);
    // And the line under each name: where to stand, how high it gets, and
    // whether it can be seen. It wraps to a second line rather than being cut
    // off, so what is checked is that two lines are enough.
    for (const verdict of Object.values(t.seeing)) {
      const line = `${passDirection({ riseAzimuthDeg: 247, peakElevationDeg: 68 })} · ${verdict}`;
      expect(width(line, 11)).toBeLessThan(2 * COLUMN);
    }
  });

  test.each(LOCALES)("%s fits the pass line on the card", (locale) => {
    setLocaleForTesting(locale);
    // The same column the card's own seeing line keeps, and the same bound: it
    // is prose over a photograph, so what is checked is that it wraps to two
    // lines rather than that it fits on one. This one is the longer of the two
    // shapes — a clause, a clock time, a verdict and a magnitude.
    const CARD_COLUMN = 375 - 12 * 2 - 14 * 2;
    for (const verdict of ["visible", "binoculars", "tooFaint"] as const) {
      const line = seeingOnPass({
        nakedEye: verdict,
        apparentMagnitude: -2.24,
        magnitudeMeasured: false,
        peakAtMs: Date.UTC(2026, 7, 29, 19, 31, 0)
      });
      // Three lines rather than two: this is the longer of the card's two
      // shapes — a clause, a clock time, a verdict and a magnitude — and in
      // Russian it runs past two lines of a card set 12.5 points.
      expect(width(line, 12.5)).toBeLessThan(3 * CARD_COLUMN);
    }
  });

  test.each(LOCALES)("%s fits the seeing line on the card", (locale) => {
    // The verdict and, where there is one, the magnitude after it. The card is
    // inset 12 either side by the stack that lays it out, and this line keeps
    // 14 more — and it is prose, so what is checked is that it wraps to two
    // lines rather than that it fits on one.
    const CARD_COLUMN = 375 - 12 * 2 - 14 * 2;
    const t = stringsFor(locale).card.seeing;
    const magnitude = fill(t.aboutMagnitude, { value: "-1.8" });
    // Only the three verdicts that rest on a brightness carry one; the other
    // three are the whole line on their own. See `seeing`.
    for (const verdict of [t.visible, t.binoculars, t.tooFaint]) {
      expect(width(`${verdict} · ${magnitude}`, 12.5)).toBeLessThan(2 * CARD_COLUMN);
    }
    for (const verdict of [t.eclipsed, t.daylight, t.unknown]) {
      expect(width(verdict, 12.5)).toBeLessThan(2 * CARD_COLUMN);
    }
  });

  test.each(LOCALES)("%s fits the buttons", (locale) => {
    const t = stringsFor(locale);
    // Full-width buttons inside a card of at most 380, less 20 either side.
    expect(width(t.boot.tryAgain, 11, 1.5)).toBeLessThan(320);
    expect(width(t.intro.next, 11, 1.5)).toBeLessThan(320);
    expect(width(t.intro.allowAccess, 11, 1.5)).toBeLessThan(320);
    // The guide's last button, in the same place on the same card.
    expect(width(t.guide.done, 11, 1.5)).toBeLessThan(320);
  });

  test.each(LOCALES)("%s fits the language picker", (locale) => {
    // The heading over the list the corner of the intro opens: a 150pt menu,
    // less 12 of padding either side. The languages under it are endonyms and
    // the same in every locale, so this line is the only one that can grow.
    expect(width(stringsFor(locale).language.title, 10, 1)).toBeLessThan(126);
  });

  test.each(LOCALES)("%s fits the compass notice", (locale) => {
    // The notice is a strip in the stack at the bottom of the sky: the screen
    // less 12 either side, less its own 12 of padding either side, less the
    // warning bar down its left-hand edge and the gap after it.
    const t = stringsFor(locale).compassNotice;
    const COLUMN = 375 - 12 * 2 - 12 * 2 - 3 - 10;
    expect(width(t.calibrate.title, 12)).toBeLessThan(COLUMN);
    expect(width(t.magnetic.title, 12)).toBeLessThan(COLUMN);
    // The sentence under it wraps rather than being cut off.
    for (const notice of [t.calibrate, t.magnetic]) {
      expect(width(notice.detail, 11)).toBeLessThan(4 * COLUMN);
    }
  });

  test.each(LOCALES)("%s fits the figures on one line", (locale) => {
    setLocaleForTesting(locale);
    // The widest reading the card ever shows: a full compass point, a bearing
    // and an elevation, against the figure column of a fact row — the card on
    // the narrowest phone this ships to, less what the label beside it takes.
    // A bound on each figure rather than on the pair, because the two columns
    // shrink against each other and the row the longest of them lands in is
    // the one that ellipsises rather than the one that overflows.
    const look = lookDirection({ azimuthDeg: 225, elevationDeg: -8.2 });
    expect(width(look, 12.5)).toBeLessThan(250);
    expect(width(kilometres(35786), 12.5)).toBeLessThan(130);
    expect(width(orbitPeriod(1436), 12.5)).toBeLessThan(160);
    expect(width(speed(7.58), 12.5)).toBeLessThan(130);
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

  test("whether it can be seen is said before how bright it is", () => {
    setLocaleForTesting("en");
    // The verdict first, because that is the answer; the figure after it, as
    // the thing the answer rests on.
    expect(
      seeing({ nakedEye: "visible", apparentMagnitude: -1.83, magnitudeMeasured: true })
    ).toBe("Bright enough to see now · magnitude -1.8");
    // Hedged where the standard magnitude behind it is an estimate rather than
    // an observation. See `standardMagnitude.ts`.
    expect(
      seeing({ nakedEye: "binoculars", apparentMagnitude: 5.24, magnitudeMeasured: false })
    ).toBe("In sunlight, but you would want binoculars · around magnitude 5.2");
  });

  test("and no figure is offered where the answer does not rest on one", () => {
    setLocaleForTesting("en");
    // An object in the Earth's shadow is reflecting nothing, so its magnitude
    // runs off to infinity and there is nothing to print. In daylight the sky
    // rules out every object overhead whatever its own brightness.
    expect(
      seeing({
        nakedEye: "eclipsed",
        apparentMagnitude: Number.POSITIVE_INFINITY,
        magnitudeMeasured: true
      })
    ).toBe("In the Earth's shadow, with no sunlight on it to see");
    expect(
      seeing({ nakedEye: "daylight", apparentMagnitude: -1.8, magnitudeMeasured: true })
    ).toBe("The sun is still up here — nothing in orbit can be seen yet");
    expect(
      seeing({ nakedEye: "unknown", apparentMagnitude: null, magnitudeMeasured: false })
    ).toBe("In sunlight, though how brightly it shines is not recorded");
  });

  test("how long there is, in the units someone would wait in", () => {
    setLocaleForTesting("en");
    // Minutes up to an hour and hours past it, which is the same split the
    // orbit period makes: an hour and a half is a wait to plan around and
    // ninety minutes is arithmetic to do.
    expect(timeUntil(14 * 60_000)).toBe("14 min");
    expect(timeUntil(82 * 60_000)).toBe("1h 22m");
    // A pass already under way. The plan is remade once a minute, so its rise
    // is up to a minute in the past by the time the panel reads it — and there
    // is nothing to count down to either way.
    expect(timeUntil(0)).toBe("now");
    expect(timeUntil(-45_000)).toBe("now");
    // Rounded rather than truncated: forty seconds off is closer to a minute.
    expect(timeUntil(100_000)).toBe("2 min");
  });

  test("and in the reader's own units", () => {
    setLocaleForTesting("de");
    expect(timeUntil(14 * 60_000)).toBe("14 Min.");
    setLocaleForTesting("ja");
    expect(timeUntil(14 * 60_000)).toBe("14 分");
  });

  test("a row about a pass says where to stand before it says anything else", () => {
    setLocaleForTesting("en");
    // The rise rather than the peak: the two questions a list answers are when
    // to be outside and which way to face, and the way to face is the way the
    // object appears from. The height beside it is what the pass is worth.
    expect(passDirection({ riseAzimuthDeg: 247, peakElevationDeg: 68 })).toBe("SW · 68° up");
    // The local compass, as everywhere else: German turns east into O.
    setLocaleForTesting("de");
    expect(passDirection({ riseAzimuthDeg: 90, peakElevationDeg: 12 })).toBe("O · 12° hoch");
  });

  test("the row's verdict is the card's, in the space a row has", () => {
    setLocaleForTesting("en");
    // The same six answers `seeing` gives in a sentence, short enough to sit
    // under a name and a countdown — and no magnitude, because a figure is
    // worth showing where there is room for what it supports.
    expect(passSeeing("visible")).toBe("visible to the eye");
    expect(passSeeing("eclipsed")).toBe("in the Earth's shadow");
    expect(passSeeing("daylight")).toBe("daylight — nothing to see");
    for (const verdict of ["visible", "binoculars", "tooFaint"] as const) {
      expect(passSeeing(verdict)).not.toMatch(/magnitude/i);
    }
  });

  test("a pass that has not begun is answered in the future tense", () => {
    setLocaleForTesting("en");
    // The bug this exists for: the card resolved everything at the instant it
    // was drawn, so a pass at half past nine in the evening was answered with
    // the sky at two in the afternoon — "the sun is still up here", about an
    // object that would be crossing a dark sky.
    const evening = Date.UTC(2026, 7, 29, 19, 31, 0);
    const line = seeingOnPass({
      nakedEye: "visible",
      apparentMagnitude: -2.2,
      magnitudeMeasured: true,
      peakAtMs: evening
    });

    // The clock time is what makes the tense readable rather than merely
    // correct: it says which sky is being talked about.
    expect(line).toMatch(/^When it comes over at \d{1,2}:31/);
    expect(line).toContain("visible to the eye");
    expect(line).toContain("magnitude -2.2");
    // And none of the card's own present-tense sentences, which are what was
    // wrong with the line before.
    expect(line).not.toContain("now");
    expect(line).not.toContain("still up here");
  });

  test("and carries a figure only where the answer rests on one", () => {
    setLocaleForTesting("en");
    const atMs = Date.UTC(2026, 7, 29, 19, 31, 0);
    // In the Earth's shadow it is reflecting nothing, so the magnitude runs off
    // to infinity and there is no figure to print — as on the card's own line.
    const eclipsed = seeingOnPass({
      nakedEye: "eclipsed",
      apparentMagnitude: Number.POSITIVE_INFINITY,
      magnitudeMeasured: true,
      peakAtMs: atMs
    });
    expect(eclipsed).toContain("in the Earth's shadow");
    expect(eclipsed).not.toMatch(/magnitude/i);

    // A pass that is still in daylight when it comes over says so, which is the
    // other half of the fix: the answer can be "no" for the pass's own sky.
    const daylight = seeingOnPass({
      nakedEye: "daylight",
      apparentMagnitude: -1.8,
      magnitudeMeasured: true,
      peakAtMs: atMs
    });
    expect(daylight).toContain("daylight — nothing to see");
    expect(daylight).not.toMatch(/magnitude/i);

    // Hedged where the brightness is an estimate rather than an observation.
    expect(
      seeingOnPass({
        nakedEye: "binoculars",
        apparentMagnitude: 5.24,
        magnitudeMeasured: false,
        peakAtMs: atMs
      })
    ).toContain("around magnitude 5.2");
  });

  test("the pass line follows the reader's clock and conventions", () => {
    const atMs = Date.UTC(2026, 7, 29, 19, 31, 0);
    const pass = {
      nakedEye: "visible",
      apparentMagnitude: -2.24,
      magnitudeMeasured: true,
      peakAtMs: atMs
    } as const;

    setLocaleForTesting("de");
    // A 24-hour clock, a comma for the decimal, and the German short verdict.
    expect(seeingOnPass(pass)).toContain("Beim Überflug um");
    expect(seeingOnPass(pass)).toContain("mit bloßem Auge sichtbar");
    expect(seeingOnPass(pass)).toContain("Magnitude -2,2");
  });

  test("the panel says what the count cannot", () => {
    setLocaleForTesting("en");
    // Daylight first, because it is the answer for the whole sky rather than
    // for any of the objects in it.
    expect(sunlightSummary({ count: 70, sunlit: 70, darkness: "daylight" })).toBe(
      "Daylight — none of these can be seen yet"
    );
    expect(sunlightSummary({ count: 12, sunlit: 0, darkness: "dark" })).toBe(
      "All of these are in the Earth's shadow"
    );
    expect(sunlightSummary({ count: 12, sunlit: 9, darkness: "twilight" })).toBe(
      "9 of these are in sunlight"
    );
    // "All" rather than "12 of these", which reads as a subset of itself.
    expect(sunlightSummary({ count: 12, sunlit: 12, darkness: "dark" })).toBe(
      "All of these are in sunlight"
    );
  });

  test("the magnitude follows the reader's decimal convention", () => {
    // Minus one point eight to an English reader, minus one comma eight to a
    // German one — the same argument as the speeds and distances above.
    setLocaleForTesting("de");
    expect(
      seeing({ nakedEye: "visible", apparentMagnitude: -1.83, magnitudeMeasured: true })
    ).toContain("Magnitude -1,8");
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

  test("the clock written on the sky is the one the phone keeps", () => {
    // The time a landmark's next pass begins is set on the frame beside its
    // path, and whether that reads as 22:13 or 10:13 PM is regional rather than
    // linguistic — `LOCALES` has one entry for the English of both London and
    // Chicago. Pinning a language leaves it as the only tag there is, which is
    // what these assert against.
    const when = new Date(2026, 7, 29, 22, 13, 0);

    setLocaleForTesting("de");
    expect(clockTime(when)).toBe("22:13");

    setLocaleForTesting("en");
    expect(clockTime(when)).toMatch(/^\d{1,2}:13\s?(AM|PM)$/i);

    // And Latin digits in Arabic, as everywhere else.
    setLocaleForTesting("ar");
    expect(clockTime(when)).toMatch(/[0-9]{1,2}:[0-9]{2}/);
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
  expect(strings().intro.corners.console.meaning).toMatch(/英語/);
});

/**
 * How tall the intro's pages come out, per language.
 *
 * The pages in the app whose height is not bounded by their own design: a
 * title, a paragraph, and then rows beside pictures, numbered explanations
 * under them, or explained badges — every one of which is a translated string
 * that can run a line longer than the English it replaced. The card is
 * bottom-aligned and grows upwards into the sky, so a page that outgrows the
 * screen does not stay a card — it walks off the top.
 *
 * The pictures are fixed heights, or the panel's own rows: those are measured
 * the way the panel's own checks measure them.
 *
 * The figures are read off `IntroScreen`'s stylesheet. The card now scrolls if
 * it has to (see `styles.card`), so overrunning this is a degraded page rather
 * than a broken one — which is why the budget is the *smallest* screen the app
 * ships to rather than the one it is designed on.
 */
describe("the intro's pages fit the smallest screen", () => {
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

  /** The callouts' column: the card's, less the 16pt number and the 8 after it. */
  const CALLOUT_COLUMN = CARD_COLUMN - 16 - 8;

  /** Numbered explanations under a picture, each 8 below the one before. */
  function calloutsHeight(callouts: readonly string[]): number {
    return callouts.reduce(
      (sum, text) => sum + 8 + blockHeight(text, 11.5, 16, CALLOUT_COLUMN),
      0
    );
  }

  /**
   * The passes picture: 10 of padding around the panel shut and the panel open,
   * and 10 between them. A panel is its border, a header of 6 above an 11pt
   * line and 6 below it (2, open) — and open, a row per pass: 12 of rule and
   * gap, the name, 2, and the line under it wrapped into the rows' 170pt.
   */
  function passesPictureHeight(): number {
    const LINE = 14;
    const shut = 2 + 6 + LINE + 6;
    const rows = SAMPLE_PASSES.reduce((sum, pass) => {
      const meta = `${passDirection(pass)} · ${passSeeing(pass.nakedEye)}`;
      return sum + 7 + 5 + LINE + 2 + blockHeight(meta, 9, 13, 170);
    }, 0);
    const open = 2 + 6 + LINE + 2 + rows + 10;
    return 10 + shut + 10 + open + 10;
  }

  test.each(LOCALES)("%s", (locale) => {
    setLocaleForTesting(locale);
    // Every page but the last: the permissions page lists what the system will
    // ask for, and that list is two names and two reasons whatever the language.
    for (const page of introPages().filter((one) => !one.access)) {
      let height = 20 * 2; // The card's own padding.
      height += blockHeight(page.title ?? "", 19, 23, CARD_COLUMN);
      height += 10 + blockHeight(page.body, 13, 19, CARD_COLUMN);
      for (const mark of page.marks ?? []) {
        // A tile and its words share a middle, so the row is the taller of them.
        const words =
          blockHeight(mark.name, 10, 13, ELEMENT_COLUMN) +
          2 +
          blockHeight(mark.meaning, 11.5, 16, ELEMENT_COLUMN);
        height += 12 + Math.max(MARK_TILE.height, words);
      }
      if (page.path) {
        height += 14 + PATH_FIGURE_HEIGHT + calloutsHeight(page.path.callouts);
      }
      if (page.passes) {
        height += 14 + passesPictureHeight() + calloutsHeight(page.passes.callouts);
      }
      for (const element of page.elements ?? []) {
        height += 12 + blockHeight(element.where, 10, 13, ELEMENT_COLUMN);
        height += 2 + blockHeight(element.meaning, 11.5, 16, ELEMENT_COLUMN);
      }
      if (page.footnote) height += 16 + blockHeight(page.footnote, 11, 16, CARD_COLUMN);

      expect(height).toBeLessThan(PAGER_HEIGHT);
    }
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
