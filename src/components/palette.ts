import { sunAltitudeDeg } from "../coordinates/sunAltitude";
import { clamp } from "../math/angles";
import { ObserverLocation } from "../types";

/**
 * What the overlay is drawn in, and which of the two sets that is right now.
 *
 * **Every mark is white, day and night.** The markers sit on a photograph of
 * the sky, and that photograph is either far brighter or far darker than any
 * fill can be, so no one fill reads against both. At night that is no problem:
 * a white point on a dark sky is a star, and the mark is drawn as one — a hot
 * centre in light that falls away to nothing, with no outline at all. A dark
 * ring round it read as a white disc cut out and laid on the picture rather
 * than as something giving off light. By day the white would vanish, so the
 * mark gains a near-black edge and loses its light: a dark ring with a light
 * centre, which reads over cloud as well as over blue.
 *
 * The marks used to be coloured by what each satellite is for, in two ladders
 * of five — light marks in a dark rim at night, dark marks in a light rim by
 * day. White was clearer on the sky at both ends of the day than any of the
 * five, and a mark that is the same object at noon and at midnight needs no
 * key. What an object is for is still one tap away, on its card, and still
 * what the filter sorts by.
 *
 * What turns over with the day is therefore everything *around* the white: how
 * much light a mark gives off (`glow`), how strongly its edge is drawn
 * (`edge`), the landmark halo, and the names, which are text
 * rather than marks and read best as dark ink on a bright sky. The phone
 * auto-exposes, which flattens the difference between the two skies but does
 * not remove it, so the choice is made from the sun rather than from a light
 * meter, and from the sun *here* rather than from a clock — 21:00 is broad
 * daylight in Oslo in June and the middle of the night in Oslo in December. See
 * `sunAltitudeDeg`.
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

/** The fill every mark, tail, path and selection ring is drawn in. */
export const MARK_COLOR = "#ffffff";

/**
 * The edge under every mark, tail, path and selection ring.
 *
 * Near-black rather than the night sky's own dark blue, which by day is close
 * enough to a blue sky to lose most of what the edge is for. At night the two
 * cannot be told apart.
 */
export const MARK_EDGE: Ink = { color: "#05070a", alpha: 0.9 };

/**
 * The outer bloom around a mark's light: a cool, faint blue-white.
 *
 * A star photographed at night is not a white disc but a white centre in a halo
 * that goes slightly blue as it thins, and a little of that colour is most of
 * what makes a point read as light rather than as paint. Faint enough that the
 * mark itself is still white.
 */
export const MARK_BLOOM = "#a9c9ff";

export type MarkerPalette = {
  /** The mark's fill: `MARK_COLOR`, whatever the sky. */
  mark: string;
  /**
   * The edge under every mark: `MARK_EDGE`, whatever the sky.
   *
   * A shape under the fill rather than a border inside it, so the mark keeps
   * its full width.
   */
  outline: Ink;
  /** The glow that says this one is worth looking up for. Landmarks only. */
  halo: Ink;
  /**
   * How much light a mark gives off, in `[0, 1]`: the glow around it.
   *
   * All of it at night, where a satellite *is* a point of light and the marks
   * are drawn as one. None by day, where what is read is a mark's dark edge
   * and a white glow over a bright sky would only wash that edge out.
   */
  glow: number;
  /**
   * How strongly a mark's dark edge is drawn, in `[0, 1]`, on top of
   * `outline`'s own alpha.
   *
   * None at night, where a dark ring round a point of light turns it back into
   * a disc; all of it by day, where the edge is what is read. The same goes for
   * the landmarks' paths and the selection ring, which are white on the same
   * edge.
   */
  edge: number;
  /** The landmark names, which are drawn as text. */
  label: string;
  /**
   * The shadow under a name. Dark at night and light by day, the other way
   * round from the name itself: text is not a mark, and on a bright sky the
   * readable name is the dark one.
   */
  labelShadow: Ink;
};

export const NIGHT_PALETTE: MarkerPalette = {
  mark: MARK_COLOR,
  outline: MARK_EDGE,
  halo: { color: "#ffffff", alpha: 0.18 },
  glow: 1,
  edge: 0,
  label: "#ffffff",
  labelShadow: { color: "#030911", alpha: 0.85 }
};

export const DAYLIGHT_PALETTE: MarkerPalette = {
  mark: MARK_COLOR,
  outline: MARK_EDGE,
  halo: { color: "#04121f", alpha: 0.2 },
  glow: 0,
  edge: 1,
  label: "#10161c",
  labelShadow: { color: "#f4f8fd", alpha: 0.9 }
};

/**
 * Where the two sets change places, as the sun's altitude in degrees.
 *
 * Centred three degrees below the horizon — inside civil twilight, which is
 * roughly the span in which a sky stops being one thing and becomes the other.
 * Two degrees wide, which is about thirteen minutes at 51°N and eight at the
 * equator: long enough that nothing snaps, short enough that the overlay does
 * not spend the whole of dusk in between. What crosses over in it is the
 * glow, the edge, the halo and the names; the white itself is the same
 * throughout.
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
 * corner; a name that changes colour at a constant rate and then stops is more
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
 * The two palettes mixed, in sRGB.
 *
 * Returns one of the two ends outright when it lands on one, so the overwhelming
 * majority of the day is drawn in exactly those rather than in a blend that
 * rounds to them.
 */
export function blendPalettes(fraction: number): MarkerPalette {
  if (fraction <= 0) return NIGHT_PALETTE;
  if (fraction >= 1) return DAYLIGHT_PALETTE;

  const night = NIGHT_PALETTE;
  const day = DAYLIGHT_PALETTE;
  return {
    mark: MARK_COLOR,
    outline: MARK_EDGE,
    halo: mixInk(night.halo, day.halo, fraction),
    glow: night.glow + (day.glow - night.glow) * fraction,
    edge: night.edge + (day.edge - night.edge) * fraction,
    label: mixColors(night.label, day.label, fraction),
    labelShadow: mixInk(night.labelShadow, day.labelShadow, fraction)
  };
}

/**
 * How far through the fade a place is at a given moment, quantised.
 *
 * The quantisation is not a rounding convenience. A palette is a set of colour
 * *strings*, the Skia backend caches one parsed colour and one gradient per
 * string, and an unquantised fade would hand it a new set every time it was
 * asked. Thirty-two steps is too fine for any one of them to be seen — and it
 * means the fade has 32 states rather than unboundedly many.
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
