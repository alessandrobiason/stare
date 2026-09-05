import { sunAltitudeDeg } from "../coordinates/sunAltitude";
import { clamp } from "../math/angles";
import {
  CATEGORY_COLORS,
  CATEGORY_COLORS_DAYLIGHT,
  SatelliteCategory
} from "../satellite/categories";
import { ObserverLocation } from "../types";

/**
 * What the overlay is drawn in, and which of the two sets that is right now.
 *
 * The markers sit on a photograph of the sky, and that photograph is either far
 * brighter or far darker than any fill can be — so one palette cannot serve
 * both. A night sky takes light marks in a dark outline; a daylit one takes
 * dark marks in a light outline, which is the same idea with the ink and the
 * paper the other way round. `CATEGORY_COLORS` and `CATEGORY_COLORS_DAYLIGHT`
 * are the two ladders, held to the same numeric separation bar; everything else
 * on the sky — the outline, the landmark halo, the names — flips with them.
 *
 * The phone auto-exposes, which flattens the difference but does not remove it:
 * a daylit sky comes back near white however it is metered, and a night sky
 * runs the exposure into its ceiling and comes back dark and grainy. So the
 * choice is made from the sun rather than from a light meter, and from the sun
 * *here* rather than from a clock — 21:00 is broad daylight in Oslo in June and
 * the middle of the night in Oslo in December, and the app already knows where
 * it is standing to a few metres. See `sunAltitudeDeg`.
 *
 * Nothing here knows about Skia, a browser canvas or React, for the same reason
 * `markerScene` does not: what a marker looks like is decided in one place that
 * a test can read, and the backends only fill shapes.
 */

/** A colour and how much of it: what a canvas takes, rather than a CSS string. */
export type Ink = {
  /** `#rrggbb`. */
  color: string;
  alpha: number;
};

export type MarkerPalette = {
  /** The mark's own colour, by what the satellite is for. */
  categories: Record<SatelliteCategory, string>;
  /**
   * The rim under every mark and the tail behind it.
   *
   * A shape under the colour rather than a border inside it, so the mark keeps
   * its full width. Dark at night and light by day, because what it separates
   * the mark from is whatever the camera happens to be pointed at: at night the
   * bright things (a street lamp, the moon, a lit window), by day the dark ones
   * (a roof line, a tree, a wall in shadow).
   */
  outline: Ink;
  /** The glow that says this one is worth looking up for. Landmarks only. */
  halo: Ink;
  /** The landmark names, which are drawn as text and outlined by `outline`. */
  label: string;
};

export const NIGHT_PALETTE: MarkerPalette = {
  categories: CATEGORY_COLORS,
  outline: { color: "#030911", alpha: 0.85 },
  halo: { color: "#ffffff", alpha: 0.18 },
  label: "#ffffff"
};

export const DAYLIGHT_PALETTE: MarkerPalette = {
  categories: CATEGORY_COLORS_DAYLIGHT,
  outline: { color: "#f4f8fd", alpha: 0.9 },
  halo: { color: "#04121f", alpha: 0.2 },
  label: "#10161c"
};

/**
 * Where the two sets change places, as the sun's altitude in degrees.
 *
 * Centred three degrees below the horizon — inside civil twilight, which is
 * roughly the span in which a sky stops being one thing and becomes the other.
 * Two degrees wide, which is about thirteen minutes at 51°N and eight at the
 * equator: long enough that nothing snaps, short enough that the overlay does
 * not spend the whole of dusk in between.
 *
 * That last point is the reason the band is not the whole of twilight. The two
 * ladders run in opposite directions, so somewhere in the middle of any fade
 * the marks must pass each other, and while they do, two of the ten pairs come
 * closer than either palette allows — at worst the landmark tier and the
 * residual, both of which are near-neutral at the crossing and have no hue left
 * to tell them apart with. Nothing can remove that; only how long it lasts is a
 * choice. At two degrees it is about three minutes twice a day, and the tier it
 * affects is the one that also carries a halo and its own name.
 */
export const DAYLIGHT_BAND = {
  /** Below this altitude the night set is drawn unmixed. */
  nightBelowDeg: -4,
  /** Above it, the daylight set is. */
  daylightAboveDeg: -2
} as const;

/**
 * How far through the fade a given sun altitude is, in `[0, 1]`.
 *
 * Smoothstepped rather than linear so the palette leaves and arrives without a
 * corner; a mark that changes colour at a constant rate and then stops is more
 * noticeable than one that eases.
 */
export function daylightFraction(altitudeDeg: number): number {
  const { nightBelowDeg, daylightAboveDeg } = DAYLIGHT_BAND;
  const along = clamp(
    (altitudeDeg - nightBelowDeg) / (daylightAboveDeg - nightBelowDeg),
    0,
    1
  );
  return along * along * (3 - 2 * along);
}

/**
 * The two palettes mixed, in sRGB, which is the space they were checked in.
 *
 * Returns one of the two ends outright when it lands on one, so the overwhelming
 * majority of the day is drawn in the exact colours that were searched for
 * rather than in a blend that rounds to them.
 */
export function blendPalettes(fraction: number): MarkerPalette {
  if (fraction <= 0) return NIGHT_PALETTE;
  if (fraction >= 1) return DAYLIGHT_PALETTE;

  const night = NIGHT_PALETTE;
  const day = DAYLIGHT_PALETTE;
  const categories = {} as Record<SatelliteCategory, string>;
  for (const category of Object.keys(night.categories) as SatelliteCategory[]) {
    categories[category] = mixColors(
      night.categories[category],
      day.categories[category],
      fraction
    );
  }

  return {
    categories,
    outline: mixInk(night.outline, day.outline, fraction),
    halo: mixInk(night.halo, day.halo, fraction),
    label: mixColors(night.label, day.label, fraction)
  };
}

/**
 * How far through the fade a place is at a given moment, quantised.
 *
 * The quantisation is not a rounding convenience. A palette is a set of colour
 * *strings*, the Skia backend caches one parsed colour per string, and an
 * unquantised fade would hand it a new set every time it was asked. Thirty-two
 * steps over a journey of about 0.5 in OKLab puts the largest step at 0.015,
 * which is under the 0.02 or so at which two swatches side by side begin to
 * look like different colours at all — and it means the fade has 32 states
 * rather than unboundedly many.
 */
export function daylightFractionAt(observer: ObserverLocation, when: Date): number {
  const fraction = daylightFraction(sunAltitudeDeg(observer, when));
  return Math.round(fraction * FRACTION_STEPS) / FRACTION_STEPS;
}

/** The palette for a place and a moment. */
export function skyPalette(observer: ObserverLocation, when: Date): MarkerPalette {
  return blendPalettes(daylightFractionAt(observer, when));
}

const FRACTION_STEPS = 32;

/** An `Ink` as a CSS colour, for the parts of the overlay that are still views. */
export function cssColor(ink: Ink): string {
  const [red, green, blue] = channels(ink.color);
  return `rgba(${red}, ${green}, ${blue}, ${ink.alpha})`;
}

function mixInk(from: Ink, to: Ink, fraction: number): Ink {
  return {
    color: mixColors(from.color, to.color, fraction),
    alpha: from.alpha + (to.alpha - from.alpha) * fraction
  };
}

function mixColors(from: string, to: string, fraction: number): string {
  const start = channels(from);
  const end = channels(to);
  return `#${start
    .map((channel, index) =>
      Math.round(channel + (end[index] - channel) * fraction)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function channels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}
