import {
  blendPalettes,
  DAYLIGHT_BAND,
  DAYLIGHT_PALETTE,
  daylightFraction,
  daylightFractionAt,
  MARK_COLOR,
  MARK_EDGE,
  NIGHT_PALETTE,
  skyPalette
} from "../src/components/palette";
import { ObserverLocation } from "../src/types";

const LONDON: ObserverLocation = { latitudeDeg: 51.5, longitudeDeg: -0.13, heightM: 0 };
const SYDNEY: ObserverLocation = { latitudeDeg: -33.87, longitudeDeg: 151.21, heightM: 0 };

/** Relative luminance, for "which of these two is the lighter". */
function luminance(color: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

test("reads the sky from where the observer is, not from the clock", () => {
  // The same instant. It is the middle of a June afternoon in London and the
  // middle of a winter night in Sydney, and a clock alone cannot tell them
  // apart — which is why the palette is chosen from the sun's own altitude.
  const instant = new Date("2026-06-21T12:00:00Z");

  expect(skyPalette(LONDON, instant)).toBe(DAYLIGHT_PALETTE);
  expect(skyPalette(SYDNEY, instant)).toBe(NIGHT_PALETTE);
});

test("follows the season as well as the hour", () => {
  // 21:00 UTC is daylight in London in June and the middle of the night there
  // in December.
  expect(skyPalette(LONDON, new Date("2026-06-21T19:00:00Z"))).toBe(DAYLIGHT_PALETTE);
  expect(skyPalette(LONDON, new Date("2026-12-21T19:00:00Z"))).toBe(NIGHT_PALETTE);
});

test("changes over twilight rather than at an instant", () => {
  const { nightBelowDeg, daylightAboveDeg } = DAYLIGHT_BAND;
  const midpoint = (nightBelowDeg + daylightAboveDeg) / 2;

  expect(daylightFraction(nightBelowDeg - 1)).toBe(0);
  expect(daylightFraction(daylightAboveDeg + 1)).toBe(1);
  expect(daylightFraction(midpoint)).toBeCloseTo(0.5);
  // Monotonic across the band, and eased at both ends rather than cornered.
  let previous = -1;
  for (let altitude = nightBelowDeg; altitude <= daylightAboveDeg; altitude += 0.1) {
    const fraction = daylightFraction(altitude);
    expect(fraction).toBeGreaterThanOrEqual(previous);
    previous = fraction;
  }
});

test("blends the two sets while it does, and lands exactly on them", () => {
  const half = blendPalettes(0.5);

  // The ends are the palettes themselves, not a blend that rounds to them.
  expect(blendPalettes(0)).toBe(NIGHT_PALETTE);
  expect(blendPalettes(1)).toBe(DAYLIGHT_PALETTE);

  // What turns over is the light around a mark and the names; halfway through
  // it, each is between its two ends.
  const between = (value: number, one: number, other: number) =>
    value > Math.min(one, other) && value < Math.max(one, other);
  expect(between(half.glow, NIGHT_PALETTE.glow, DAYLIGHT_PALETTE.glow)).toBe(true);
  expect(
    between(
      luminance(half.label),
      luminance(NIGHT_PALETTE.label),
      luminance(DAYLIGHT_PALETTE.label)
    )
  ).toBe(true);
});

test("quantises the fade, so it has a fixed number of states", () => {
  // A palette is a set of colour strings and the Skia backend caches a parsed
  // colour per string; an unquantised fade would hand it a new set every time.
  const steps = new Set<number>();
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const when = new Date(Date.UTC(2026, 2, 20, 0, minute));
    const fraction = daylightFractionAt(LONDON, when);
    expect(Number.isInteger(fraction * 32)).toBe(true);
    steps.add(fraction);
  }
  expect(steps.size).toBeLessThanOrEqual(33);
  // And the day really does pass through the fade rather than jumping it.
  expect(steps.size).toBeGreaterThan(2);
});

describe("the marks themselves", () => {
  test("are white on a near-black edge at every point of the day", () => {
    // Not two ladders any more: one mark, the same object at noon and midnight.
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const palette = blendPalettes(fraction);
      expect(palette.mark).toBe(MARK_COLOR);
      expect(palette.outline).toEqual(MARK_EDGE);
    }
    expect(luminance(MARK_COLOR)).toBe(1);
  });

  test("put the whole scale between the fill and its edge", () => {
    // What makes one mark legible on both skies: whichever of the two a sky is
    // close to, the other is far from it.
    expect(luminance(MARK_EDGE.color)).toBeLessThan(0.005);
    expect(MARK_EDGE.alpha).toBeGreaterThan(0.8);
  });

  test("glow at night and not by day, where a glow would wash out the edge", () => {
    expect(NIGHT_PALETTE.glow).toBe(1);
    expect(DAYLIGHT_PALETTE.glow).toBe(0);
  });

  test("are edged by day and not at night, where an edge makes a light a disc", () => {
    expect(NIGHT_PALETTE.edge).toBe(0);
    expect(DAYLIGHT_PALETTE.edge).toBe(1);
    const half = blendPalettes(0.5);
    expect(half.edge).toBeGreaterThan(0);
    expect(half.edge).toBeLessThan(1);
  });

  test("leave the names to flip: light on dark at night, dark on light by day", () => {
    expect(luminance(NIGHT_PALETTE.label)).toBeGreaterThan(
      luminance(NIGHT_PALETTE.labelShadow.color)
    );
    expect(luminance(DAYLIGHT_PALETTE.label)).toBeLessThan(
      luminance(DAYLIGHT_PALETTE.labelShadow.color)
    );
  });
});
