import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PassesPicture } from "../src/components/IntroFigures";
import { buildMarkerScene } from "../src/components/markerScene";
import { NIGHT_PALETTE } from "../src/components/palette";
import { PersistentStore } from "../src/data/persistentStore";
import { LOCALES, setLocaleForTesting, strings } from "../src/i18n";
import { clockTime } from "../src/i18n/format";
import {
  FIGURE_MARK_SCALE,
  MARK_TILE,
  MarkSample,
  markSampleFrame,
  PATH_FIGURE_HEIGHT,
  pathFigure,
  SAMPLE_PATH_TIME_MS
} from "../src/onboarding/introFigures";
import {
  clearIntroSeen,
  hasSeenIntro,
  markIntroSeen,
  setIntroStoreForTesting
} from "../src/onboarding/introStore";
import { introButtonLabel, introPages } from "../src/onboarding/introPages";
import { SATELLITE_CATEGORIES } from "../src/satellite/categories";

/** Stands in for the device's file system, and survives a simulated restart. */
function fakeDevice(): PersistentStore & { contents: string | null } {
  return {
    contents: null,
    read() {
      return this.contents;
    },
    write(next: string) {
      this.contents = next;
    },
    remove() {
      this.contents = null;
    }
  };
}

/** The rendered element as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

afterEach(() => {
  setIntroStoreForTesting(undefined);
  setLocaleForTesting(undefined);
});

test("the intro names every access the phone is about to ask for, and why", () => {
  const asked = introPages().flatMap((page) => page.access ?? []);

  // The two prompts a first launch actually produces, in the order boot raises
  // them (`requestAccess`). A prompt not explained here arrives with no reason
  // attached, which is how a permission gets refused.
  expect(asked.map((access) => access.name)).toEqual(["Camera", "Location"]);
  for (const access of asked) {
    expect(access.reason.length).toBeGreaterThan(20);
  }
});

test("and does so in every language, in the same order", () => {
  // The structure is built once in `introPages` and only the words come from
  // the locale, so this is a check that no translation quietly dropped one of
  // the two reasons — an access named with nothing after it is a prompt with
  // no explanation, which is the one thing this screen exists to prevent.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const asked = introPages().flatMap((page) => page.access ?? []);

    expect(asked).toHaveLength(2);
    for (const access of asked) {
      // Two characters is a real name in Chinese and Korean (相机, 위치); the
      // bound is only here to catch an empty or placeholder entry.
      expect(access.name.length).toBeGreaterThanOrEqual(2);
      // Long enough to be a reason rather than a restatement of the name. The
      // Chinese and Japanese pages say the same thing in far fewer characters
      // than the English one, which is why this is not the English bound.
      expect(access.reason.length).toBeGreaterThan(12);
    }
  }
});

test("nothing is listed that the phone never asks about", () => {
  // Motion is read without a prompt on the phone — the sensors this app reads
  // are not behind one, and the "Motion & Fitness" permission that looks like
  // theirs belongs to the pedometer (`readingsNeedPermission`). Listing it here
  // promised a prompt that never arrives, which is a page teaching someone to
  // distrust the next one.
  const asked = introPages().flatMap((page) => page.access ?? []);
  expect(asked.map((access) => access.name)).not.toContain("Motion & Fitness");
});

test("nothing is asked for before the app has said what it is", () => {
  // The permissions are the last page, reached by someone who now knows what
  // the app does with them, and what the screen they are about to see is made
  // of. Same shape in every language: the order is the structure's, not the
  // translation's.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const pages = introPages();

    expect(pages.map((page) => Boolean(page.access))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true
    ]);
    // The first page names the app in the middle of the sky rather than in the
    // card's title — see `wordmark`.
    expect(pages[0].wordmark).toBe(true);
    expect(pages[0].title).toBeUndefined();
    // Every other page is titled, or it is a wall of text with nothing to say
    // what it is about.
    for (const page of pages.slice(1)) expect(page.title).toBeTruthy();
  }
});

describe("the marks are shown rather than described", () => {
  const SAMPLES: readonly MarkSample[] = ["moving", "parked", "shadow", "landmark"];

  /** A tile as the sky's renderer draws it. */
  function drawn(sample: MarkSample) {
    return buildMarkerScene(markSampleFrame(sample), MARK_TILE, NIGHT_PALETTE, null, FIGURE_MARK_SCALE);
  }

  test("every kind of mark has a picture and a meaning, in every language", () => {
    // The complaint these rows answer: five channels in one paragraph — colour,
    // size, a tail, a ring, a fainter mark — is not a vocabulary anyone can
    // take to the sky. Each kind is a row beside a drawing of it instead.
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      const marks = introPages().flatMap((page) => page.marks ?? []);

      expect(marks.map((mark) => mark.sample)).toEqual(SAMPLES);
      for (const mark of marks) {
        expect(mark.name.length).toBeGreaterThanOrEqual(2);
        expect(mark.meaning.length).toBeGreaterThan(10);
      }
    }
  });

  test("the colour key is the filter's own, word for word", () => {
    // Two keys to the same five colours in two different sets of words would be
    // two taxonomies. The intro's is the one in the corner, said early.
    setLocaleForTesting("it");
    const colors = introPages().find((page) => page.colors)?.colors;

    expect(colors?.swatches.map((swatch) => swatch.category)).toEqual([...SATELLITE_CATEGORIES]);
    expect(colors?.swatches.map((swatch) => swatch.name)).toEqual(
      SATELLITE_CATEGORIES.map((category) => strings().filter.categories[category])
    );
  });

  test("each picture is drawn by the sky's renderer, and is the mark its row names", () => {
    const moving = drawn("moving").glyphs;
    expect(moving).toHaveLength(2);
    for (const glyph of moving) {
      expect(glyph.tail).not.toBeNull();
      expect(glyph.core.width).toBeNull();
    }
    // Near first: larger, which is the other half of what the row says.
    expect(moving[0].core.radius).toBeGreaterThan(moving[1].core.radius);

    for (const glyph of drawn("parked").glyphs) {
      expect(glyph.tail).toBeNull();
      expect(glyph.core.width).toBeGreaterThan(0);
    }

    // The same mark twice, and the strength is the only thing that differs.
    const [lit, eclipsed] = drawn("shadow").glyphs;
    expect(eclipsed.core).toEqual(lit.core);
    expect(eclipsed.alpha).toBeCloseTo(lit.alpha / 2);

    const landmark = drawn("landmark");
    expect(landmark.glyphs[0].halo).not.toBeNull();
    expect(landmark.labels.map((label) => label.name)).toEqual(["ISS"]);
  });

  test("and fits its tile, halo and tail included", () => {
    for (const sample of SAMPLES) {
      for (const glyph of drawn(sample).glyphs) {
        const reach = Math.max(glyph.rim.radius + (glyph.rim.width ?? 0) / 2, glyph.halo ?? 0);
        expect(glyph.x - reach).toBeGreaterThanOrEqual(0);
        expect(glyph.x + reach).toBeLessThanOrEqual(MARK_TILE.width);
        expect(glyph.y - reach).toBeGreaterThanOrEqual(0);
        expect(glyph.y + reach).toBeLessThanOrEqual(MARK_TILE.height);

        const tail = glyph.tail?.points ?? [];
        for (let index = 0; index < tail.length; index += 2) {
          expect(tail[index]).toBeGreaterThanOrEqual(0);
          expect(tail[index]).toBeLessThanOrEqual(MARK_TILE.width);
          expect(tail[index + 1]).toBeGreaterThanOrEqual(0);
          expect(tail[index + 1]).toBeLessThanOrEqual(MARK_TILE.height);
        }
      }
    }
  });
});

describe("the landmark's line", () => {
  const CARD = { width: 295, height: PATH_FIGURE_HEIGHT };

  test("is the line the sky draws: arrowheads along it, and a name with the time it is there", () => {
    const scene = buildMarkerScene(pathFigure(CARD).frame, CARD, NIGHT_PALETTE, null, FIGURE_MARK_SCALE);

    expect(scene.paths).toHaveLength(1);
    expect(scene.paths[0].arrows.length).toBeGreaterThanOrEqual(4);
    expect(scene.labels.map((label) => label.name)).toEqual([
      `ISS\n${clockTime(new Date(SAMPLE_PATH_TIME_MS))}`
    ]);
    // No mark on it: the pass has not begun, which is the case the line is for
    // — and the only case in which the time is written on it at all.
    expect(scene.glyphs).toHaveLength(0);
  });

  test("comes up from the bottom edge, where the roofs are", () => {
    const figure = pathFigure(CARD);
    const start = figure.frame.paths[0].lines[0][0];

    expect(start.top).toBeGreaterThan(95);
    expect(figure.roofs.every((roof) => roof.height > 0 && roof.height < CARD.height / 2)).toBe(true);
  });

  test("puts every callout on the picture, on a small phone and a large one", () => {
    for (const width of [295, 350]) {
      const figure = pathFigure({ width, height: PATH_FIGURE_HEIGHT });
      for (const callout of figure.callouts) {
        expect(callout.x).toBeGreaterThanOrEqual(8);
        expect(callout.x).toBeLessThanOrEqual(width - 8);
        expect(callout.y).toBeGreaterThanOrEqual(8);
        expect(callout.y).toBeLessThanOrEqual(PATH_FIGURE_HEIGHT - 8);
      }
    }
  });
});

test("every number on a picture is explained, in every language", () => {
  const numbered = pathFigure({ width: 295, height: PATH_FIGURE_HEIGHT }).callouts.length;

  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const pages = introPages();
    const path = pages.find((page) => page.path)?.path;
    const passes = pages.find((page) => page.passes)?.passes;

    expect(path?.callouts).toHaveLength(numbered);
    // Shut and open: the two numbers `PassesPicture` sets beside its panels.
    expect(passes?.callouts).toHaveLength(2);
    for (const text of [...(path?.callouts ?? []), ...(passes?.callouts ?? [])]) {
      expect(text.length).toBeGreaterThan(10);
    }
  }
});

test("the page about what is coming draws the panel itself, shut and then open", () => {
  // The panel's own code over a made-up plan, so the picture reads exactly as
  // the corner will: the next pass shut, and the list with where to stand and
  // whether it can be seen open.
  const text = textOf(React.createElement(PassesPicture));

  expect(text).toContain("ISS");
  expect(text).toContain("14 min");
  expect(text).toContain("COMING UP");
  expect(text).toContain("Tiangong");
  expect(text).toContain("1h 12m");
  expect(text).toContain("visible to the eye");
  expect(text).toContain("shadow");
});

test("and in the reader's language, since it is the panel's own words", () => {
  setLocaleForTesting("de");
  const text = textOf(React.createElement(PassesPicture));

  expect(text).toContain("14 Min.");
  expect(text).toContain("ALS NÄCHSTES");
});

test("the corners page keys the three panels the pictures do not show", () => {
  // A bare number in the corner of a camera view says nothing about what it
  // counts. Each badge is the one the real screen wears, in the language being
  // read — the filter's own title — or the page is a description of a panel
  // rather than a picture of one.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const elements = introPages().flatMap((page) => page.elements ?? []);

    expect(elements.map((element) => element.badge)).toEqual([
      "12",
      strings().filter.title,
      "CONSOLE"
    ]);
    for (const element of elements) {
      expect(element.where.length).toBeGreaterThan(1);
      expect(element.meaning.length).toBeGreaterThan(15);
    }
  }
});

test("the button says what it does: the last page is the one that starts the app", () => {
  expect(introButtonLabel(0)).toBe("NEXT");
  expect(introButtonLabel(introPages().length - 1)).toBe("ALLOW ACCESS");

  // And says something different on the last page in every language, since
  // that is the button the system's own prompts come out from behind.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const last = introPages().length - 1;
    expect(introButtonLabel(last)).not.toBe(introButtonLabel(0));
  }
});

test("the intro is shown once, and not again after the app is closed", () => {
  const device = fakeDevice();
  setIntroStoreForTesting(device);

  expect(hasSeenIntro()).toBe(false);
  markIntroSeen();
  expect(hasSeenIntro()).toBe(true);

  // Closing and reopening the app: everything held in memory is gone, the
  // device's storage is not. This is the case the flag exists for.
  setIntroStoreForTesting(undefined);
  setIntroStoreForTesting(device);
  expect(hasSeenIntro()).toBe(true);

  clearIntroSeen();
  expect(hasSeenIntro()).toBe(false);
});

test("an unreadable device shows the intro rather than skipping the explanation", () => {
  // A half-written entry, or no storage at all. Erring towards showing it again
  // costs a few pages; erring the other way opens straight into two system
  // prompts nobody has been told the reason for.
  const device = fakeDevice();
  device.contents = "{ not json";
  setIntroStoreForTesting(device);
  expect(hasSeenIntro()).toBe(false);

  device.contents = JSON.stringify({ seenAtMs: "yesterday" });
  expect(hasSeenIntro()).toBe(false);

  setIntroStoreForTesting(null);
  expect(hasSeenIntro()).toBe(false);
  // And a write that goes nowhere is not a crash on the way into the app.
  expect(() => markIntroSeen()).not.toThrow();
});
