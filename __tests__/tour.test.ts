import { buildMarkerScene } from "../src/components/markerScene";
import { NIGHT_PALETTE } from "../src/components/palette";
import { createTourTargets } from "../src/components/tourTargets";
import { PersistentStore } from "../src/data/persistentStore";
import { LOCALES, setLocaleForTesting } from "../src/i18n";
import {
  FIGURE_MARK_SCALE,
  MARK_TILE,
  MarkSample,
  markSampleFrame
} from "../src/onboarding/markSamples";
import {
  availableSteps,
  BUBBLE_GAP,
  BUBBLE_MARGIN,
  HOLE_PADDING,
  placeBubble,
  stepAfter,
  stepAt,
  tourSteps
} from "../src/onboarding/tourSteps";
import {
  clearTourSeen,
  hasSeenTour,
  markTourSeen,
  setTourStoreForTesting
} from "../src/onboarding/tourStore";
import type { View } from "react-native";

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

afterEach(() => {
  setTourStoreForTesting(undefined);
  setLocaleForTesting(undefined);
});

describe("the steps", () => {
  test("start on the key to the marks, then point at each control in turn", () => {
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      const steps = tourSteps();

      expect(steps.map((step) => step.target)).toEqual([
        null,
        "count",
        "filter",
        "freeze",
        "passes",
        "settings"
      ]);
      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(1);
        expect(step.body.length).toBeGreaterThan(10);
      }
    }
  });

  test("stay short: a sentence or two beside the thing, not a page", () => {
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      for (const step of tourSteps()) {
        expect(step.body.length).toBeLessThan(90);
        for (const mark of step.marks ?? []) expect(mark.meaning.length).toBeLessThan(90);
      }
    }
  });

  test("leave out a control that is not on screen, and move past it", () => {
    const steps = tourSteps();
    // No passes card: nothing is coming, or a satellite's card has its place.
    const available = availableSteps(steps, (target) => target !== "passes");

    expect(available.map((step) => step.id)).toEqual(["marks", "count", "filter", "freeze", "settings"]);
    expect(stepAfter(steps, available, "freeze")?.id).toBe("settings");
    // Sitting on the passes step when the card goes: the tour moves on.
    expect(stepAt(steps, available, "passes")?.id).toBe("settings");
    expect(stepAfter(steps, available, "settings")).toBeNull();
  });
});

describe("where the bubble goes", () => {
  const PHONE = { width: 390, height: 844 };

  test("under a control at the top, with the arrow pointing up at it", () => {
    const filter = { x: 334, y: 53, width: 40, height: 40 };
    const placed = placeBubble(filter, PHONE);

    expect(placed.top).toBe(filter.y + filter.height + HOLE_PADDING + BUBBLE_GAP);
    expect(placed.bottom).toBeUndefined();
    expect(placed.arrow.side).toBe("top");
    // Kept on the screen, and the arrow still under the button's middle.
    expect(placed.left + placed.width).toBeLessThanOrEqual(PHONE.width - BUBBLE_MARGIN);
    expect(placed.left + placed.arrow.left).toBeCloseTo(filter.x + filter.width / 2);
    // A round button gets a round hole.
    expect(placed.hole.radius).toBe(placed.hole.width / 2);
  });

  test("over a control at the bottom, with the arrow pointing down at it", () => {
    const settingsTab = { x: 260, y: 770, width: 130, height: 44 };
    const placed = placeBubble(settingsTab, PHONE);

    expect(placed.bottom).toBe(PHONE.height - (settingsTab.y - HOLE_PADDING) + BUBBLE_GAP);
    expect(placed.top).toBeUndefined();
    expect(placed.arrow.side).toBe("bottom");
    expect(placed.left).toBeGreaterThanOrEqual(BUBBLE_MARGIN);
    // The tab reaches the edge of the screen; its ring does not run off it.
    expect(placed.hole.x + placed.hole.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("never wider than a small phone allows", () => {
    const small = { width: 320, height: 568 };
    const placed = placeBubble({ x: 18, y: 40, width: 150, height: 18 }, small);

    expect(placed.left).toBe(BUBBLE_MARGIN);
    expect(placed.width).toBe(small.width - BUBBLE_MARGIN * 2);
    // The arrow stays off the bubble's rounded corner.
    expect(placed.arrow.left).toBeGreaterThan(16);
  });
});

test("a control's view is found while mounted and forgotten after", () => {
  const targets = createTourTargets();
  const first = {} as View;
  const second = {} as View;

  targets.attach("passes", first);
  expect(targets.node("passes")).toBe(first);

  // A remount attaches the new view before the old one is cleaned up.
  targets.attach("passes", second);
  targets.detach("passes", first);
  expect(targets.node("passes")).toBe(second);

  targets.detach("passes", second);
  expect(targets.node("passes")).toBeNull();
});

describe("the key to the marks is drawn rather than described", () => {
  const SAMPLES: readonly MarkSample[] = ["moving", "parked", "shadow", "landmark"];

  /** A tile as the sky's renderer draws it. */
  function drawn(sample: MarkSample) {
    return buildMarkerScene(markSampleFrame(sample), MARK_TILE, NIGHT_PALETTE, null, FIGURE_MARK_SCALE);
  }

  test("every kind of mark has a picture and a meaning, in every language", () => {
    for (const locale of LOCALES) {
      setLocaleForTesting(locale);
      const marks = tourSteps().flatMap((step) => step.marks ?? []);

      expect(marks.map((mark) => mark.sample)).toEqual(SAMPLES);
      for (const mark of marks) {
        expect(mark.name.length).toBeGreaterThanOrEqual(2);
        expect(mark.meaning.length).toBeGreaterThan(10);
      }
    }
  });

  test("each picture is the mark its row names", () => {
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

        const tail = glyph.tail?.runs.flat() ?? [];
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

test("the tour is shown once, and not again after the app is closed", () => {
  const device = fakeDevice();
  setTourStoreForTesting(device);

  expect(hasSeenTour()).toBe(false);
  markTourSeen();
  expect(hasSeenTour()).toBe(true);

  // Closing and reopening the app: everything held in memory is gone, the
  // device's storage is not.
  setTourStoreForTesting(undefined);
  setTourStoreForTesting(device);
  expect(hasSeenTour()).toBe(true);

  clearTourSeen();
  expect(hasSeenTour()).toBe(false);
});

test("an unreadable device shows the tour again rather than failing", () => {
  const device = fakeDevice();
  device.contents = "{ not json";
  setTourStoreForTesting(device);
  expect(hasSeenTour()).toBe(false);

  device.contents = JSON.stringify({ seenAtMs: "yesterday" });
  expect(hasSeenTour()).toBe(false);

  setTourStoreForTesting(null);
  expect(hasSeenTour()).toBe(false);
  // And a write that goes nowhere is not a crash on the way out of the tour.
  expect(() => markTourSeen()).not.toThrow();
});
