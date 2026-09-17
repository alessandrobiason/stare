import {
  blendPalettes,
  DAYLIGHT_BAND,
  DAYLIGHT_PALETTE,
  daylightFraction,
  daylightFractionAt,
  MARK_EDGE,
  NIGHT_PALETTE,
  skyPalette
} from "../src/components/palette";
import {
  CATEGORY_BLOOMS,
  CATEGORY_COLORS,
  CATEGORY_EDGES,
  SATELLITE_CATEGORIES,
  SatelliteCategory
} from "../src/satellite/categories";
import { ObserverLocation } from "../src/types";

/** OKLab, so separation and chroma are measured rather than asserted. */
function oklab(color: string): [number, number, number] {
  const [red, green, blue] = [1, 3, 5].map((index) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short
  ];
}

function closestPair(colors: Record<SatelliteCategory, string>): number {
  let closest = Infinity;
  for (const [index, first] of SATELLITE_CATEGORIES.entries()) {
    for (const second of SATELLITE_CATEGORIES.slice(index + 1)) {
      const [one, other] = [oklab(colors[first]), oklab(colors[second])];
      closest = Math.min(closest, Math.hypot(...one.map((value, axis) => value - other[axis])));
    }
  }
  return closest;
}

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
  test("keep their colours on a near-black edge at every point of the day", () => {
    // Not two ladders any more: one colour per purpose, the same at noon and
    // at midnight.
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const palette = blendPalettes(fraction);
      expect(palette.categories).toEqual(CATEGORY_COLORS);
      expect(palette.blooms).toEqual(CATEGORY_BLOOMS);
      expect(palette.edges).toEqual(CATEGORY_EDGES);
      expect(palette.outline).toEqual(MARK_EDGE);
    }
  });

  test("are pastels: light enough to read on a night sky and inside the daytime edge", () => {
    for (const category of SATELLITE_CATEGORIES) {
      const fill = luminance(CATEGORY_COLORS[category]);
      // Over seven to one against the night sky's own dark, and over four to
      // one against their own edge, which is the contrast body text is held to.
      expect((fill + 0.05) / (luminance("#0b1422") + 0.05)).toBeGreaterThan(7);
      expect((fill + 0.05) / (luminance(CATEGORY_EDGES[category]) + 0.05)).toBeGreaterThan(4.3);
      // And none of them a signal colour: well short of full chroma.
      const [, a, b] = oklab(CATEGORY_COLORS[category]);
      expect(Math.hypot(a, b)).toBeLessThan(0.13);
    }
  });

  test("are edged in a deep shade of their own hue, which holds against a daylit sky", () => {
    for (const category of SATELLITE_CATEGORIES) {
      const [fillL, fillA, fillB] = oklab(CATEGORY_COLORS[category]);
      const [edgeL, edgeA, edgeB] = oklab(CATEGORY_EDGES[category]);
      expect(edgeL).toBeLessThan(0.42);
      expect(edgeL).toBeLessThan(fillL - 0.3);
      // The same hue, for every category with a hue to keep.
      if (Math.hypot(fillA, fillB) > 0.03) {
        const turn = Math.atan2(edgeB, edgeA) - Math.atan2(fillB, fillA);
        expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.2);
      }
      // Five to one against a pale blue daytime sky.
      expect((luminance("#9fc3e6") + 0.05) / (luminance(CATEGORY_EDGES[category]) + 0.05)).toBeGreaterThan(5);
    }
  });

  test("keep the six categories apart", () => {
    // Pastels give up distance for softness: every pair is still at least
    // 0.135 apart in OKLab, which reads as a different colour side by side and
    // at a glance.
    expect(closestPair(CATEGORY_COLORS)).toBeGreaterThan(0.135);
  });

  test("keep every category clear of the Starlinks' lavender, which is most of any sky", () => {
    // Half the catalogue is one constellation, so the colour the eye has to
    // pick the rest out of is the internet category's, and each of the others
    // is held further from it than the pairs are from each other.
    const [one, other, third] = oklab(CATEGORY_COLORS.INTERNET);
    for (const category of SATELLITE_CATEGORIES) {
      if (category === "INTERNET") continue;
      const [l, a, b] = oklab(CATEGORY_COLORS[category]);
      expect(Math.hypot(l - one, a - other, b - third)).toBeGreaterThan(0.145);
    }
  });

  test("bloom in their own hue, deeper than the fill", () => {
    for (const category of SATELLITE_CATEGORIES) {
      const [fillL, fillA, fillB] = oklab(CATEGORY_COLORS[category]);
      const [bloomL, bloomA, bloomB] = oklab(CATEGORY_BLOOMS[category]);
      expect(bloomL).toBeLessThan(fillL);
      expect(Math.hypot(bloomA, bloomB)).toBeGreaterThan(Math.hypot(fillA, fillB));
      // The same hue, to within a few degrees.
      const turn = Math.atan2(bloomB, bloomA) - Math.atan2(fillB, fillA);
      expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.15);
    }
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
