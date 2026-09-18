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
import { LABEL_BOX_PX } from "../src/components/markerScene";
import { MARK_TILE } from "../src/onboarding/markSamples";
import { BUBBLE_MARGIN, BUBBLE_MAX_WIDTH, tourSteps } from "../src/onboarding/tourSteps";
import {
  FALLBACK_LOCALE,
  fill,
  Locale,
  LOCALES,
  resolveLocale,
  setLocaleForTesting,
  stringsFor
} from "../src/i18n";
import { SATELLITE_CATEGORIES, SUBCATEGORIES_OF } from "../src/satellite/categories";

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
    expect(resolveLocale(["it-CH"])).toBe("it");
    expect(resolveLocale(["en-GB"])).toBe("en");
    // Apple's underscore form, which is what `AppleLocale` reports.
    expect(resolveLocale(["it_IT"])).toBe("it");
  });

  test("the first supported entry in the list, not the first entry", () => {
    // A phone set to Catalan with Italian behind it should read Italian, not
    // English: walking the whole preference list is the point of having one.
    expect(resolveLocale(["ca-ES", "it-IT", "en"])).toBe("it");
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

    // The title shares its row with the `9/12` count and the gap after it.
    expect(width(t.title, 10, 1.4)).toBeLessThan(COLUMN - 36);
    // The label column of a row, less its swatch and margin, the label's own
    // margin and the switch. Rows may grow, but every point of growth is sky
    // the panel covers.
    for (const category of SATELLITE_CATEGORIES) {
      expect(width(t.categories[category], 11, 0.3)).toBeLessThan(COLUMN - 10 - 9 - 8 - 36);
      // A subcategory's row is stepped in by 14 and its label set tighter.
      for (const part of SUBCATEGORIES_OF[category]) {
        expect(width(t.subcategories[part], 11)).toBeLessThan(COLUMN - 14 - 10 - 9 - 8 - 36);
      }
    }
    expect(width(t.showAll, 10, 1.2)).toBeLessThan(COLUMN);
    // Wraps to a second line if it has to, so this is two lines of the column
    // the key rows keep, less the swatch that heads them.
    expect(width(t.ringKey, 8, 0.4)).toBeLessThan(2 * (COLUMN - 19));
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

  test.each(LOCALES)("%s fits the settings tab", (locale) => {
    const t = stringsFor(locale);
    // The settings list: 375 less the sheet's 18 either side, less a row's own
    // 14 either side, less the chevron and the gap before it.
    const ROW = 375 - 18 * 2 - 14 * 2 - 16 - 12;
    expect(width(t.tabs.settings, 27)).toBeLessThan(375 - 18 * 2);
    // A row's label, and — on the language row — the value beside it. The
    // longest endonym is the one this has to leave room for.
    expect(width(t.tour.open, 14)).toBeLessThan(ROW / 2);
    expect(width(t.language.title, 14) + width("Português", 13)).toBeLessThan(ROW);
    // The alerts row carries a value beside its label too — the longer of the
    // two words the permission can be in.
    const state = Math.max(width(t.alerts.on, 13), width(t.alerts.off, 13));
    expect(width(t.alerts.title, 14) + state).toBeLessThan(ROW);
    // The line under a row's label, which wraps rather than being cut off. The
    // alerts row has three of them, one per state the permission can be in.
    for (const detail of [
      t.tour.about,
      t.console.detail,
      t.alerts.granted,
      t.alerts.undetermined,
      t.alerts.denied
    ]) {
      expect(width(detail, 11)).toBeLessThan(3 * ROW);
    }
  });

  test.each(LOCALES)("%s fits the catalog", (locale) => {
    const t = stringsFor(locale).catalog;
    // The sheet's own column: 375 less 18 either side.
    const PAGE = 375 - 18 * 2;
    // A row inside a group, less the swatch, the chevron and the three gaps.
    const ROW = PAGE - 14 * 2 - 10 - 14 - 11 * 3;

    // The title's own line, which wraps under it rather than being cut off.
    expect(width(t.about, 12)).toBeLessThan(3 * PAGE);
    // The placeholder sits in a 44pt field with 14 of padding either side.
    expect(width(t.search, 14)).toBeLessThan(PAGE - 14 * 2);
    // A fleet row is a name, a count and the chevron on one line, so the count
    // has to leave the name something. The largest fleet is five figures.
    expect(width(fill(t.objects, { count: "8,192" }), 12)).toBeLessThan(ROW / 2);
    // An opened fleet's own line, under a name set at 19 beside the back
    // button: the head is the page less that button and the gap after it.
    expect(
      width(fill(t.above, { count: "412", total: "8,192" }), 12)
    ).toBeLessThan(2 * (PAGE - 34 - 10));
    // The lines that stand on their own, above or instead of a list. They wrap.
    for (const note of [t.noneAbove, t.highest, t.working, t.noMatch]) {
      expect(width(note, 12)).toBeLessThan(2 * PAGE);
    }
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
    // Either shape it takes: a split category and its part, or a part and the
    // note that the object holds station (`purposeLabel`).
    const filter = stringsFor(locale).filter;
    for (const category of SATELLITE_CATEGORIES) {
      for (const part of SUBCATEGORIES_OF[category]) {
        for (const purpose of [
          `${filter.categories[category]} · ${filter.subcategories[part]}`,
          `${filter.subcategories[part]} · ${t.holdsStation}`
        ]) {
          expect(width(purpose, 10, 0.7)).toBeLessThan(375 - 12 * 2 - 14 - 8 - 38 - 12 - 12 - 38);
        }
      }
      if (SUBCATEGORIES_OF[category].length > 0) continue;
      expect(width(`${filter.categories[category]} · ${t.holdsStation}`, 10, 0.7)).toBeLessThan(
        375 - 12 * 2 - 14 - 8 - 38 - 12 - 12 - 38
      );
    }
  });

  test.each(LOCALES)("%s fits the reason line under a name on the sky", (locale) => {
    // One line, clipped rather than wrapped, in the box a label is set in.
    for (const reason of Object.values(stringsFor(locale).scene.notable)) {
      expect(width(reason, 9, 0.3)).toBeLessThan(LABEL_BOX_PX);
    }
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
    // The tour's two buttons share a row in a bubble of at most 320, less 16
    // either side: Skip on the left, Next or Done on the right with its own 16
    // of padding either side.
    for (const label of [t.tour.next, t.tour.done]) {
      expect(width(t.tour.skip, 13) + width(label, 13, 0) + 32).toBeLessThan(320 - 32 - 24);
    }
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
    // an Italian one. Getting this backwards is a factor of a thousand.
    setLocaleForTesting("it");
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
    ).toBe("In the Earth's shadow, with no light to reflect");
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
    setLocaleForTesting("it");
    expect(lookDirection({ azimuthDeg: 143.2, elevationDeg: 27.4 })).toBe("SE 143° · 27° sopra");
    expect(lookDirection({ azimuthDeg: 143.2, elevationDeg: -8.2 })).toContain("sotto");
  });

  test("a row about a pass says where to stand before it says anything else", () => {
    setLocaleForTesting("en");
    // The rise rather than the peak: the two questions a list answers are when
    // to be outside and which way to face, and the way to face is the way the
    // object appears from. The height beside it is what the pass is worth.
    expect(passDirection({ riseAzimuthDeg: 247, peakElevationDeg: 68 })).toBe("SW · 68° up");
    // The local compass, as everywhere else: Italian turns west into O.
    setLocaleForTesting("it");
    expect(passDirection({ riseAzimuthDeg: 270, peakElevationDeg: 12 })).toBe("O · 12° sopra");
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

    setLocaleForTesting("it");
    // A 24-hour clock, a comma for the decimal, and the Italian short verdict.
    expect(seeingOnPass(pass)).toContain("Quando passerà");
    expect(seeingOnPass(pass)).toContain("visibile a occhio nudo");
    expect(seeingOnPass(pass)).toContain("magnitudine -2,2");
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
    // Minus one point eight to an English reader, minus one comma eight to an
    // Italian one — the same argument as the speeds and distances above.
    setLocaleForTesting("it");
    expect(
      seeing({ nakedEye: "visible", apparentMagnitude: -1.83, magnitudeMeasured: true })
    ).toContain("magnitudine -1,8");
  });

  test("the compass is the one that language uses", () => {
    setLocaleForTesting("it");
    // Italian turns west into O, so N/E/S/W would be read as north/east/south/?.
    expect(lookDirection({ azimuthDeg: 270, elevationDeg: 10 })).toContain("O 270°");
  });

  test("the clock written on the sky is the one the phone keeps", () => {
    // The time a landmark's next pass begins is set on the frame beside its
    // path, and whether that reads as 22:13 or 10:13 PM is regional rather than
    // linguistic — `LOCALES` has one entry for the English of both London and
    // Chicago. Pinning a language leaves it as the only tag there is, which is
    // what these assert against.
    const when = new Date(2026, 7, 29, 22, 13, 0);

    setLocaleForTesting("it");
    expect(clockTime(when)).toBe("22:13");

    setLocaleForTesting("en");
    expect(clockTime(when)).toMatch(/^\d{1,2}:13\s?(AM|PM)$/i);
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
    // The table is partial by design: a fleet added to `briefing.ts` should
    // reach every language the same day, in English, rather than leaving a
    // blank space in Italian until someone gets round to it.
    setLocaleForTesting("it");
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


/**
 * How tall the tour's bubbles come out, per language.
 *
 * The key to the marks is the tallest of them — a title, a sentence and four
 * rows beside their tiles — and it is laid over the middle of the screen, so it
 * has the whole height of the smallest phone less the status bar and a margin.
 * The others sit beside a control and have to fit in what is left beside it,
 * which on the passes card is still most of the screen: they are held to a
 * third of it, which is what keeps them a sentence rather than a page.
 */
describe("the tour fits the smallest screen", () => {
  /** Layout points of text, wrapped into a column of `column` points. */
  function blockHeight(text: string, fontSize: number, lineHeight: number, column: number): number {
    return Math.max(1, Math.ceil(width(text, fontSize) / column)) * lineHeight;
  }

  const SCREEN = { width: 375, height: 667 };
  /** The bubble's own text column: its width, less 16 of padding either side. */
  const COLUMN = Math.min(BUBBLE_MAX_WIDTH, SCREEN.width - BUBBLE_MARGIN * 2) - 16 * 2;
  /** The same, less a tile and the 10 after it. */
  const MARK_COLUMN = COLUMN - MARK_TILE.width - 10;
  /** Padding, the title row, and the row of buttons under everything. */
  const FRAME = 16 * 2 + 20 + (14 + 36);

  test.each(LOCALES)("%s", (locale) => {
    setLocaleForTesting(locale);
    for (const step of tourSteps()) {
      let height = FRAME + 6 + blockHeight(step.body, 13, 18, COLUMN);
      for (const mark of step.marks ?? []) {
        const words = 14 + 1 + blockHeight(mark.meaning, 11.5, 15, MARK_COLUMN);
        height += 10 + Math.max(MARK_TILE.height, words);
      }

      if (step.marks) expect(height).toBeLessThan(SCREEN.height - 20 - BUBBLE_MARGIN * 2);
      else expect(height).toBeLessThan(SCREEN.height / 3);
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
 * translated screen.
 */
describe("the prompts the operating system shows", () => {
  const DIRECTORY = path.join(__dirname, "..", "locales");

  /** The keys iOS reads, matching the English pair in `app.json`. */
  const KEYS = ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"];

  function read(locale: Locale): Record<string, string> {
    return JSON.parse(fs.readFileSync(path.join(DIRECTORY, `${locale}.json`), "utf8")) as Record<
      string,
      string
    >;
  }

  test("app.json points at one file per language the app speaks", () => {
    const declared = (appJson as { expo: { locales: Record<string, string> } }).expo.locales;

    expect(Object.keys(declared).sort()).toEqual([...LOCALES].sort());
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
