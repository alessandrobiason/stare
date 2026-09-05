import {
  blendPalettes,
  DAYLIGHT_BAND,
  DAYLIGHT_PALETTE,
  daylightFraction,
  daylightFractionAt,
  NIGHT_PALETTE,
  skyPalette
} from "../src/components/palette";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "../src/satellite/categories";
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

/**
 * OKLab, so the separation the two ladders were searched for is checked rather
 * than only asserted in a comment. Perceptually uniform, which is the whole
 * reason a distance in it means anything.
 */
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
      const [firstLab, secondLab] = [oklab(colors[first]), oklab(colors[second])];
      closest = Math.min(
        closest,
        Math.hypot(...firstLab.map((value, axis) => value - secondLab[axis]))
      );
    }
  }
  return closest;
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

  // The ends are the palettes themselves, not a blend that rounds to them, so
  // the overwhelming majority of the day is drawn in the colours that were
  // searched for.
  expect(blendPalettes(0)).toBe(NIGHT_PALETTE);
  expect(blendPalettes(1)).toBe(DAYLIGHT_PALETTE);

  for (const category of SATELLITE_CATEGORIES) {
    const mixed = luminance(half.categories[category]);
    const ends = [
      luminance(NIGHT_PALETTE.categories[category]),
      luminance(DAYLIGHT_PALETTE.categories[category])
    ].sort((first, second) => first - second);
    expect(mixed).toBeGreaterThan(ends[0]);
    expect(mixed).toBeLessThan(ends[1]);
  }
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

test("puts the loudest mark and the quietest at opposite ends of each ladder", () => {
  const night = SATELLITE_CATEGORIES.map((category) =>
    luminance(NIGHT_PALETTE.categories[category])
  );
  const day = SATELLITE_CATEGORIES.map((category) =>
    luminance(DAYLIGHT_PALETTE.categories[category])
  );
  const [landmark, ...rest] = SATELLITE_CATEGORIES;
  expect(landmark).toBe("LANDMARK");
  expect(rest[rest.length - 1]).toBe("OTHER");

  // Against a night sky the landmark tier is the lightest thing drawn and the
  // residual the darkest; against a daylit one both swap, because what is loud
  // on a bright background is ink rather than light.
  expect(Math.max(...night)).toBe(night[0]);
  expect(Math.min(...night)).toBe(night[night.length - 1]);
  expect(Math.min(...day)).toBe(day[0]);
  expect(Math.max(...day)).toBe(day[day.length - 1]);

  // The rim inverts with them: darker than every mark at night, lighter than
  // every mark by day.
  expect(luminance(NIGHT_PALETTE.outline.color)).toBeLessThan(Math.min(...night));
  expect(luminance(DAYLIGHT_PALETTE.outline.color)).toBeGreaterThan(Math.max(...day));
});

test("keeps the five categories apart in both sets", () => {
  // Five is about the limit of what colour alone can separate, and both ladders
  // were searched numerically against it. Below roughly 0.15 in OKLab two
  // swatches start to be guessed at rather than read.
  expect(closestPair(NIGHT_PALETTE.categories)).toBeGreaterThan(0.15);
  expect(closestPair(DAYLIGHT_PALETTE.categories)).toBeGreaterThan(0.15);
});
