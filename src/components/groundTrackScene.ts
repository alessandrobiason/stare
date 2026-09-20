import { GROUND_TRACK } from "../constants";
import { worldOutline } from "../data/worldOutline";
import { clamp, toDegrees, toRadians, wrapDegrees180 } from "../math/angles";
import {
  footprintRadiusDeg,
  footprintShare,
  GroundSample,
  GroundTrack,
  sampleAt
} from "../satellite/groundTrack";
import { ObserverLocation } from "../types";
import { Ink } from "./palette";

/**
 * The map on a satellite's card, as shapes in layout pixels.
 *
 * Built the way the sky's markers are (`markerScene.ts`), and for the same
 * reason: what the picture looks like is decided once, here, where a test can
 * read it, and the two backends — Skia on the phone, a 2D canvas in the
 * browser harness — only have to know how to stroke a run of points, fill a
 * closed one, and clip to a box.
 *
 * It comes in two halves, because they are redrawn at wildly different rates.
 * The **backdrop** is the world, the graticule and the whole orbit: it changes
 * when the card is opened on a new object or the box is laid out, which is
 * twice a minute at the most. The **moment** is where the satellite is now, the
 * patch of ground that can see it, and the lit wake behind it: that is rebuilt
 * on every animation frame. Splitting them is what keeps 2,400 points of
 * coastline from being reprojected sixty times a second for a dot that moved
 * two pixels.
 *
 * **The projection is equirectangular**: longitude straight across, latitude
 * straight down. The plainest one there is, and here the plainest is also the
 * most legible — it is the projection every ground track anybody has ever seen
 * was drawn in, so the shape is recognised before it is explained.
 *
 * **The date line is handled by repetition rather than by cutting.** A track
 * that goes round the world runs off one edge of the map and back on at the
 * other, and a footprint over the Pacific straddles both edges at once.
 * Clipping those into pieces is fiddly and gets the fills wrong; drawing the
 * same shape again a map-width to the left and to the right, with the map
 * clipped to its own box, is exact and is three lines (`repeatsFor`). It is
 * why the samples carry longitude unwrapped — see `GroundSample.longitudeDeg`.
 */

/** The box the map is drawn in, in layout pixels. */
export type MapBox = { width: number; height: number };

/** A point in that box. */
export type Point = readonly [number, number];

/** A run of points: stroked as a line, or filled as a closed shape. */
export type Polyline = readonly Point[];

/**
 * The map and the orbit: everything that stands still while the dot moves.
 */
export type GroundTrackBackdrop = {
  box: MapBox;
  /**
   * The world's land, as closed rings, filled with the even-odd rule so the one
   * ring that is a hole in another (the Caspian) comes out as water.
   */
  land: Polyline[];
  /** Meridians and parallels, faint, every `graticuleStepDeg`. */
  graticule: Polyline[];
  /**
   * The equator, drawn a shade stronger than the rest.
   *
   * Worth its own line because one of the three shapes the map exists to show
   * is defined by it: a satellite that holds station is a dot *on the equator*,
   * and a line it is visibly sitting on says that without a word.
   */
  equator: Polyline;
  /** The whole orbit, faint, in as many copies as the map's edges need. */
  track: Polyline[];
  /** Where the phone is, or `null` before there is a fix. */
  observer: Point | null;
};

/** Where the satellite is at one instant of the animation. */
export type GroundTrackMoment = {
  /**
   * The ground that can see it, as closed rings to fill. See
   * `footprintRadiusDeg` for what the circle is and why it is the answer to
   * "who is it serving".
   */
  footprint: Polyline[];
  /**
   * The same circle as a line to stroke — which is not the same run of points.
   *
   * A footprint reaching over a pole is closed along the edge of the map
   * (`footprintRing`), and that closure is a fiction of the projection rather
   * than part of the circle: stroked, it draws a line across the top of the
   * world and a spur up to it from wherever the ring happened to end. So the
   * shape is filled with the closure and outlined without it.
   */
  footprintEdge: Polyline[];
  /** The lit piece of track behind the dot, saying which way it is going. */
  wake: Polyline[];
  /** The sub-satellite point, wrapped onto the map. */
  satellite: Point;
  /** The instant this is, in epoch milliseconds: the clock beside the map. */
  atMs: number;
  /** How far into the orbit, in minutes. */
  intoOrbitMinutes: number;
  /** How much of the Earth's surface the footprint covers, in `[0, 1]`. */
  share: number;
};

/**
 * What the map is drawn in.
 *
 * Its own small palette rather than the theme's, because this is the one
 * surface in the app that is a *picture* rather than glass over one: it needs
 * a sea, a land and a coast, and none of those is a panel, a divider or a
 * caption. Dark and low-contrast on purpose — the orbit is the subject and the
 * world is the thing it is read against, so the map is a shade above the card
 * it sits on and no more.
 *
 * The track, the wake, the footprint and the dot are all in the satellite's own
 * category colour instead, which is what ties the map to the mark that was
 * tapped and to the colour the whole app has already been using for what this
 * object is for (`CATEGORY_COLORS`).
 */
export const MAP_INK = {
  sea: { color: "#081422", alpha: 1 },
  land: { color: "#1b2b40", alpha: 1 },
  coast: { color: "#2e4763", alpha: 1 },
  graticule: { color: "#ffffff", alpha: 0.06 },
  equator: { color: "#ffffff", alpha: 0.13 },
  /** Where the phone is: the app's one accent, as everywhere else. */
  observer: { color: "#4da6ff", alpha: 0.95 }
} as const satisfies Record<string, Ink>;

/**
 * How thick the map's lines are, in layout points.
 *
 * Everything here is sub-pixel or close to it. The map is a couple of hundred
 * points wide carrying a continent per twenty of them, so a line a point thick
 * is already a bold line; the coast is drawn at half of that, purely to keep an
 * island from disappearing between two pixels.
 */
export const LINE_WIDTH = {
  /** The coastline, over the land's own fill: an edge rather than an outline. */
  coast: 0.6,
  graticule: 0.5,
  /** The whole orbit, faint: thin, because there is a lot of it. */
  track: 1,
  /** The lit piece behind the dot, which has to read over the track under it. */
  wake: 1.8,
  footprint: 1,
  observer: 1.4
} as const;

/** The satellite itself: the one solid mark on the map. */
export const DOT_RADIUS = 3;

/** And where the phone is, as a ring — smaller, because it is not the subject. */
export const OBSERVER_RADIUS = 2.6;

/**
 * How strongly each part of the orbit is drawn, as a fraction of the
 * satellite's own colour.
 *
 * Four weights of one hue rather than four colours: the map has exactly one
 * subject and these are four views of it — where it goes, where it has just
 * been, where it is, and what it can see.
 */
export const TRACK_ALPHA = {
  /** The whole orbit, under everything: the shape, there to be read at a glance. */
  track: 0.34,
  /** The last tenth of it, behind the dot. */
  wake: 0.95,
  /** The footprint's fill — barely there, because it is large. */
  footprintFill: 0.13,
  /** And its edge, which is what actually says where it ends. */
  footprintEdge: 0.5
} as const;

/** The box a map of `width` points takes, at the projection's own aspect. */
export function mapBoxFor(width: number): MapBox {
  return { width, height: width / GROUND_TRACK.aspect };
}

/** Longitude and latitude, in degrees, as a point in the box. */
export function project(longitudeDeg: number, latitudeDeg: number, box: MapBox): Point {
  return [
    ((longitudeDeg + 180) / 360) * box.width,
    ((90 - latitudeDeg) / 180) * box.height
  ];
}

/** The world, the graticule and the whole orbit, in pixels. */
export function groundTrackBackdrop(
  track: GroundTrack,
  box: MapBox,
  observer: ObserverLocation | null
): GroundTrackBackdrop {
  return {
    box,
    land: worldOutline().map((ring) =>
      ring.map(([longitude, latitude]) => project(longitude, latitude, box))
    ),
    graticule: graticuleOf(box),
    equator: [project(-180, 0, box), project(180, 0, box)],
    track: repeated(track.samples.map(pointOf(box)), box),
    observer: observer
      ? project(wrapDegrees180(observer.longitudeDeg), observer.latitudeDeg, box)
      : null
  };
}

/**
 * Where the satellite is at `phase` through the orbit, and what it can see
 * from there.
 *
 * `phase` runs `[0, 1)` over one orbit — the animation's own clock, not the
 * world's. What makes it a picture of something real rather than a dot going
 * round is that the track underneath was sampled in equal steps of *time*, so
 * a phase is a time: an eccentric orbit's dot hangs at the top of the map and
 * falls through the bottom, because that is what the object does.
 */
export function groundTrackMoment(
  track: GroundTrack,
  phase: number,
  box: MapBox
): GroundTrackMoment {
  const now = sampleAt(track, phase);
  const radiusDeg = footprintRadiusDeg(now.altitudeKm);
  const footprint = footprintRing(now, radiusDeg, box);

  return {
    footprint: repeated(footprint.fill, box),
    footprintEdge: repeated(footprint.edge, box),
    wake: wakeOf(track, phase).map((piece) => repeated(piece.map(pointOf(box)), box)).flat(),
    satellite: project(wrapDegrees180(now.longitudeDeg), now.latitudeDeg, box),
    atMs: now.atMs,
    intoOrbitMinutes: (clamp(phase, 0, 1) * track.spanMs) / 60000,
    share: footprintShare(radiusDeg)
  };
}

/** Projects a ground sample, as a callback for a run of them. */
function pointOf(box: MapBox) {
  return (sample: GroundSample): Point =>
    project(sample.longitudeDeg, sample.latitudeDeg, box);
}

/**
 * The bright piece of track behind the dot: `wakeFraction` of an orbit, as one
 * run of samples or two where it reaches back past the start of the track.
 *
 * Two, rather than one run stitched together, because the track's longitudes
 * run continuously (`GroundSample.longitudeDeg`) and the two ends of a closed
 * orbit are a world apart in them — joined into a single run they would draw a
 * line straight back across the map. As separate runs each is repeated onto the
 * map on its own, and they meet at the edges where they should.
 */
function wakeOf(track: GroundTrack, phase: number): GroundSample[][] {
  const behind = clamp(phase, 0, 1) - GROUND_TRACK.wakeFraction;
  const head = sampleAt(track, phase);
  if (behind >= 0) return [[...runBetween(track, behind, phase), head]];
  // Round the back of the loop: the tail end of the last orbit, then this one
  // from its start.
  return [
    runBetween(track, 1 + behind, 1),
    [...runBetween(track, 0, phase), head]
  ];
}

/**
 * The samples between two phases, with the earlier end interpolated so the
 * wake's tail does not snap from sample to sample as the dot moves.
 */
function runBetween(track: GroundTrack, fromPhase: number, toPhase: number): GroundSample[] {
  const last = track.samples.length - 1;
  const from = fromPhase * last;
  const to = toPhase * last;
  const run: GroundSample[] = [sampleAt(track, fromPhase)];
  for (let index = Math.ceil(from); index <= Math.min(Math.floor(to), last); index += 1) {
    run.push(track.samples[index]);
  }
  return run;
}

/**
 * The edge of the footprint, as a closed ring in pixels.
 *
 * A circle on a sphere, walked as a bearing sweep out of the sub-point, then
 * unwrapped in longitude like the track is. Which makes one case worth naming:
 * **a footprint that reaches over a pole is not a closed loop in longitude.**
 * Walk the circle and the longitude winds a whole turn instead of coming back,
 * and the ring drawn from it is an arc with its ends dangling. What closes it
 * is the pole itself — run along the top (or bottom) of the map from where the
 * ring ends back to where it began, which in this projection is a straight
 * line, and the cap comes out filled.
 *
 * Every navigation satellite over half the year does this, and a geostationary
 * one never does, so it is not an edge case so much as the other half of the
 * behaviour.
 */
function footprintRing(
  centre: GroundSample,
  radiusDeg: number,
  box: MapBox
): { fill: Point[]; edge: Point[] } {
  if (!(radiusDeg > 0)) return { fill: [], edge: [] };

  const latitude = toRadians(centre.latitudeDeg);
  const radius = toRadians(radiusDeg);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinRadius = Math.sin(radius);
  const cosRadius = Math.cos(radius);

  const steps = GROUND_TRACK.footprintPoints;
  const ring: Point[] = [];
  let previous: number | null = null;
  let first = 0;
  let last = 0;

  for (let step = 0; step <= steps; step += 1) {
    const bearing = (step / steps) * 2 * Math.PI;
    const pointLat = Math.asin(sinLat * cosRadius + cosLat * sinRadius * Math.cos(bearing));
    const offset = Math.atan2(
      Math.sin(bearing) * sinRadius * cosLat,
      cosRadius - sinLat * Math.sin(pointLat)
    );
    const longitude = unwrapped(centre.longitudeDeg + toDegrees(offset), previous);
    previous = longitude;
    if (step === 0) first = longitude;
    last = longitude;
    ring.push(project(longitude, toDegrees(pointLat), box));
  }

  // Over a pole: close the ring along the edge of the map rather than back
  // across it. Which pole is whichever one the circle swallowed.
  const northward = centre.latitudeDeg + radiusDeg > 90;
  const southward = centre.latitudeDeg - radiusDeg < -90;
  if (!northward && !southward) return { fill: ring, edge: ring };

  const pole = northward ? 90 : -90;
  return { fill: [...ring, project(last, pole, box), project(first, pole, box)], edge: ring };
}

/**
 * The same shape, once for every whole map-width it has to be shifted by to
 * have a piece of it on the map.
 *
 * What makes the date line free: a track running off the right edge is the
 * same track drawn again a width to the left, and whichever copies fall
 * outside the box are cut off by the clip the backends draw everything inside.
 */
function repeated(points: Polyline, box: MapBox): Polyline[] {
  if (points.length === 0) return [];
  let low = Infinity;
  let high = -Infinity;
  for (const [x] of points) {
    if (x < low) low = x;
    if (x > high) high = x;
  }

  const from = Math.ceil(-high / box.width);
  const to = Math.floor((box.width - low) / box.width);
  // A shape spanning many map widths would be a propagation gone wrong rather
  // than an orbit; draw the copies that can matter and stop.
  const copies = Math.min(to - from + 1, MAXIMUM_REPEATS);
  const out: Polyline[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const shift = (from + copy) * box.width;
    out.push(shift === 0 ? points : points.map(([x, y]): Point => [x + shift, y]));
  }
  return out;
}

/**
 * How many copies of one shape the map will draw.
 *
 * One orbit sweeps a little under a full turn of longitude, so a track needs
 * two copies and a footprint one or two. Four is room to spare, and a ceiling
 * on what a set of elements SGP4 has taken somewhere strange can cost.
 */
const MAXIMUM_REPEATS = 4;

/** The meridians and parallels, excluding the equator, which is drawn apart. */
function graticuleOf(box: MapBox): Polyline[] {
  const step = GROUND_TRACK.graticuleStepDeg;
  const lines: Polyline[] = [];
  for (let longitude = -180 + step; longitude < 180; longitude += step) {
    lines.push([project(longitude, 90, box), project(longitude, -90, box)]);
  }
  for (let latitude = -90 + step; latitude < 90; latitude += step) {
    if (latitude === 0) continue;
    lines.push([project(-180, latitude, box), project(180, latitude, box)]);
  }
  return lines;
}

/** `longitude`, moved by whole turns to be the one nearest `previous`. */
function unwrapped(longitude: number, previous: number | null): number {
  if (previous === null) return longitude;
  return longitude + 360 * Math.round((previous - longitude) / 360);
}
