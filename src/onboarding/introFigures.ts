import { FramePoint } from "../camera/projection";
import { clipPolyline, FrameSize, WHOLE_FRAME } from "../components/markerGeometry";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { SatelliteCategory } from "../satellite/categories";
import { SunlitState } from "../satellite/illumination";
import { UpcomingPass } from "../satellite/upcomingPasses";

/**
 * The intro's pictures, as the frames the overlay would have been handed.
 *
 * Every mark, line and name the intro shows is drawn by the sky's own renderer
 * (`SatelliteMarkers`, through `buildMarkerScene`) from a frame made up here
 * instead of one the tracker projected, and the passes panel is the panel's own
 * code over a plan made up here (`PassesPanel`). So a page is a key to what the
 * screen will show rather than an impression of it: when a marker changes
 * shape, the intro changes with it. Nothing in this file knows what a mark
 * looks like — only where the made-up satellites are, how far away they are and
 * which way they are going.
 *
 * The one thing drawn beside the renderer is the roofline under the landmark's
 * line, since the overlay has none of its own: its roofs are the camera's.
 */

/**
 * The scale the marks are drawn at: their design size.
 *
 * About what a phone with a large screen draws and a shade larger than a small
 * one does (`frameBoxFor` covers a 4:3 camera over the screen, so the frame is
 * 500 to 700 points wide). Scaled to a tile's own width they would be a pixel
 * or two, and a key has to be read at a glance rather than squinted at.
 */
export const FIGURE_MARK_SCALE = 1;

/** The kinds of mark the intro draws a tile of, in the order it lists them. */
export type MarkSample = "moving" | "parked" | "shadow" | "landmark";

/** One tile, in layout points: the width the badges on the corners page keep. */
export const MARK_TILE: FrameSize = { width: 74, height: 44 };

/** A made-up satellite, in the terms a tile is laid out in. */
type Placed = {
  name?: string;
  category: SatelliteCategory;
  /** Centre, in points from the tile's top-left. */
  x: number;
  y: number;
  rangeKm: number;
  /** Where it is going, in degrees anticlockwise from the right; `null` holds station. */
  headingDeg: number | null;
  /** How far it goes in the trail window, in points — which is how long its tail is. */
  travel?: number;
  sunlit?: SunlitState;
};

const MARK_SAMPLES: Record<MarkSample, readonly Placed[]> = {
  // Near and far, in one colour and on one heading, so that size and the length
  // of the tail are the only two things that differ.
  moving: [
    { category: "EARTH", x: 34, y: 17, rangeKm: 450, headingDeg: 20, travel: 30 },
    { category: "EARTH", x: 62, y: 31, rangeKm: 20000, headingDeg: 20, travel: 8 }
  ],
  // A stretch of the geostationary belt, which is how rings are met on the sky:
  // several in a row, small, and none of them moving.
  parked: [
    { category: "COMMS", x: 15, y: 25, rangeKm: 37000, headingDeg: null },
    { category: "COMMS", x: 37, y: 20, rangeKm: 38200, headingDeg: null },
    { category: "COMMS", x: 59, y: 25, rangeKm: 36800, headingDeg: null }
  ],
  // The same mark twice, in sunlight and in the Earth's shadow: the difference
  // is the only thing there is to read.
  shadow: [
    { category: "EARTH", x: 26, y: 22, rangeKm: 600, headingDeg: 15, travel: 14 },
    { category: "EARTH", x: 60, y: 22, rangeKm: 600, headingDeg: 15, travel: 14, sunlit: "eclipsed" }
  ],
  // High in the tile, because the name is set under the mark.
  landmark: [
    { name: "ISS", category: "LANDMARK", x: 37, y: 15, rangeKm: 420, headingDeg: 20, travel: 18 }
  ]
};

/** The frame a tile draws: one kind of mark, as the overlay would place it. */
export function markSampleFrame(sample: MarkSample): MarkerFrame {
  return {
    markers: MARK_SAMPLES[sample].map((placed) => markerFor(MARK_TILE, placed)),
    paths: [],
    rollDeg: 0
  };
}

function markerFor(box: FrameSize, placed: Placed): SatelliteMarker {
  const heading = placed.headingDeg === null ? null : placed.headingDeg * (Math.PI / 180);
  const travel = placed.travel ?? 0;
  return {
    name: placed.name ?? "",
    category: placed.category,
    parked: heading === null,
    point: pointIn(box, placed.x, placed.y),
    rangeKm: placed.rangeKm,
    // Where it will be a trail window from now. The renderer lays the tail the
    // same distance behind the mark, as it does on the sky.
    next:
      heading === null
        ? null
        : pointIn(box, placed.x + travel * Math.cos(heading), placed.y - travel * Math.sin(heading)),
    opacity: 1,
    sunlit: placed.sunlit ?? "sunlit"
  };
}

/** How tall the picture of a landmark's line is. Its width is the card's. */
export const PATH_FIGURE_HEIGHT = 150;

/**
 * When the made-up pass is at the point its name is written at.
 *
 * Built from the local clock's own fields, so the picture says an evening time
 * wherever the phone is rather than an evening in one time zone.
 */
export const SAMPLE_PATH_TIME_MS = new Date(2026, 8, 11, 21, 34).getTime();

export type PathFigure = {
  frame: MarkerFrame;
  /** The roofs the line comes up from behind, as boxes standing on the bottom edge, in points. */
  roofs: { left: number; width: number; height: number }[];
  /** Where each numbered callout is centred, in points, in the order the page lists them. */
  callouts: { x: number; y: number }[];
};

/**
 * The arc, as a quadratic curve in fractions of the picture: up from behind the
 * roofs at the left, bending over, and out past the right-hand edge.
 *
 * A pass seen from the ground is not a parabola, but over the sixty degrees a
 * camera holds it is a curve of about this shape, and the picture is a key to
 * the marks along it rather than to its geometry.
 */
const ARC = {
  from: { x: 0.12, y: 1.02 },
  bend: { x: 0.3, y: 0 },
  to: { x: 1.06, y: 0.16 }
} as const;

/** Roofs, as fractions of the picture: where each starts, how wide and how tall. */
const ROOFS = [
  { left: 0, width: 0.2, height: 0.24 },
  { left: 0.2, width: 0.11, height: 0.34 },
  { left: 0.31, width: 0.21, height: 0.17 },
  { left: 0.52, width: 0.09, height: 0.27 },
  { left: 0.61, width: 0.39, height: 0.12 }
] as const;

/** The arc's resolution: enough that its curve is a curve at the width of a card. */
const ARC_SAMPLES = 64;
/**
 * How far apart the arrowheads are along the line, in points.
 *
 * On the sky they are a clock minute apart, which is anything from a few points
 * to most of the frame; here they are spaced for the picture to read as a line
 * with marks along it rather than as a dotted one.
 */
const TICK_SPACING = 40;
/** How far along the line its name is written, as a fraction of its length. */
const ANCHOR_ALONG = 0.5;

/**
 * The landmark's line, the roofs under it and where the callouts go, for a
 * picture `box` points in size.
 *
 * The line is the pass before it rises: the name and a time are written on it,
 * and the mark that would otherwise carry the name is not on the frame yet. That
 * is the case the line is for — the object is behind the roofs or below the
 * horizon, and the line is the whole of what says where and when it will be.
 */
export function pathFigure(box: FrameSize): PathFigure {
  const curve = Array.from({ length: ARC_SAMPLES + 1 }, (_, index) =>
    arcAt(index / ARC_SAMPLES, box)
  );
  const lengths = cumulativeLengths(curve);
  const total = lengths[lengths.length - 1];
  const along = (distance: number) => pointAlong(curve, lengths, distance);
  const onPicture = (point: { x: number; y: number }) =>
    point.x >= 0 && point.x <= box.width && point.y >= 0 && point.y <= box.height;

  const roofs = ROOFS.map((roof) => ({
    left: roof.left * box.width,
    width: roof.width * box.width,
    height: roof.height * box.height
  }));
  const roofTopAt = (x: number) => {
    const under = roofs.find((roof) => x >= roof.left && x < roof.left + roof.width);
    return box.height - (under?.height ?? 0);
  };

  // The line clears the last roof here, which is where it is seen to come up.
  let clearing = 0;
  while (clearing < total && along(clearing).y > roofTopAt(along(clearing).x)) clearing += 1;

  const ticks: MarkerPath["ticks"] = [];
  for (let distance = clearing + TICK_SPACING / 2; distance < total; distance += TICK_SPACING) {
    const at = along(distance);
    if (!onPicture(at)) continue;
    const ahead = along(distance + 1);
    ticks.push({ at: pointIn(box, at.x, at.y), ahead: pointIn(box, ahead.x, ahead.y) });
  }

  const anchor = along(total * ANCHOR_ALONG);
  const path: MarkerPath = {
    name: "ISS",
    key: "ISS intro",
    category: "LANDMARK",
    lines: clipPolyline(
      curve.map((point) => pointIn(box, point.x, point.y)),
      WHOLE_FRAME
    ),
    ticks,
    anchor: { at: pointIn(box, anchor.x, anchor.y), atMs: SAMPLE_PATH_TIME_MS },
    lead: 0
  };

  // Callouts are set beside what they point at rather than on it, so none of
  // them covers the thing it is numbering: under an arrowhead near the far end,
  // to the right of the name, and to the left of where the line leaves the roofs.
  const arrow = ticks[Math.max(0, ticks.length - 2)];
  const rising = along(clearing);
  const callouts = [
    arrow
      ? { x: (arrow.at.left / 100) * box.width, y: (arrow.at.top / 100) * box.height + CALLOUT_CLEARANCE }
      : { x: box.width - CALLOUT_CLEARANCE, y: CALLOUT_CLEARANCE },
    { x: anchor.x + 2 * CALLOUT_CLEARANCE, y: anchor.y + 24 },
    { x: Math.max(CALLOUT_CLEARANCE / 2, rising.x - CALLOUT_CLEARANCE), y: rising.y - 4 }
  ];

  return { frame: { markers: [], paths: [path], rollDeg: 0 }, roofs, callouts };
}

/** How far a callout sits from what it points at, in points. */
const CALLOUT_CLEARANCE = 18;

function arcAt(t: number, box: FrameSize): { x: number; y: number } {
  const u = 1 - t;
  const mix = (from: number, bend: number, to: number) =>
    u * u * from + 2 * u * t * bend + t * t * to;
  return {
    x: mix(ARC.from.x, ARC.bend.x, ARC.to.x) * box.width,
    y: mix(ARC.from.y, ARC.bend.y, ARC.to.y) * box.height
  };
}

function cumulativeLengths(points: { x: number; y: number }[]): number[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const step = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(lengths[index - 1] + step);
  }
  return lengths;
}

function pointAlong(
  points: { x: number; y: number }[],
  lengths: number[],
  distance: number
): { x: number; y: number } {
  const last = points.length - 1;
  if (distance <= 0) return points[0];
  if (distance >= lengths[last]) return points[last];
  let index = 1;
  while (lengths[index] < distance) index += 1;
  const span = lengths[index] - lengths[index - 1];
  const fraction = span > 0 ? (distance - lengths[index - 1]) / span : 0;
  return {
    x: points[index - 1].x + (points[index].x - points[index - 1].x) * fraction,
    y: points[index - 1].y + (points[index].y - points[index - 1].y) * fraction
  };
}

/** Points in a box, as the frame percentages the renderer places things by. */
function pointIn(box: FrameSize, x: number, y: number): FramePoint {
  return { left: (x / box.width) * 100, top: (y / box.height) * 100 };
}

/** The clock the made-up plan below is read against. */
export const SAMPLE_NOW_MS = Date.UTC(2026, 8, 11, 19, 20, 0);

const MINUTE_MS = 60_000;

/**
 * The plan the intro draws the passes panel over: the station in a quarter of
 * an hour and worth going out for, and Tiangong after it in the Earth's shadow.
 *
 * Two rather than one, because the open panel is a list and a list of one does
 * not look like one; and two different verdicts, because the verdict is the
 * part of a row that decides whether the countdown is worth acting on.
 */
export const SAMPLE_PASSES: readonly UpcomingPass[] = [
  {
    name: "ISS",
    noradId: 25544,
    category: "LANDMARK",
    startsAtMs: SAMPLE_NOW_MS + 14 * MINUTE_MS,
    endsAtMs: SAMPLE_NOW_MS + 20 * MINUTE_MS,
    peakAtMs: SAMPLE_NOW_MS + 17 * MINUTE_MS,
    peakElevationDeg: 63,
    riseAzimuthDeg: 305,
    setAzimuthDeg: 125,
    started: false,
    nakedEye: "visible",
    apparentMagnitude: -2.1,
    magnitudeMeasured: true
  },
  {
    name: "Tiangong",
    noradId: 48274,
    category: "LANDMARK",
    startsAtMs: SAMPLE_NOW_MS + 72 * MINUTE_MS,
    endsAtMs: SAMPLE_NOW_MS + 77 * MINUTE_MS,
    peakAtMs: SAMPLE_NOW_MS + 74 * MINUTE_MS,
    peakElevationDeg: 31,
    riseAzimuthDeg: 235,
    setAzimuthDeg: 95,
    started: false,
    nakedEye: "eclipsed",
    apparentMagnitude: null,
    magnitudeMeasured: false
  }
];
