import { FramePoint } from "../camera/projection";
import { FrameSize } from "../components/markerGeometry";
import { MarkerFrame, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { SatelliteCategory } from "../satellite/categories";

/**
 * The tour's key to the marks, as the frames the overlay would have been handed.
 *
 * Every mark the tour shows is drawn by the sky's own renderer
 * (`SatelliteMarkers`, through `buildMarkerScene`) from a frame made up here
 * instead of one the tracker projected. So the key is a key to what the screen
 * shows rather than an impression of it: when a marker changes shape, the tour
 * changes with it. Nothing in this file knows what a mark looks like — only
 * where the made-up satellites are, how far away they are and which way they
 * are going.
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

/** The kinds of mark the tour draws a tile of, in the order it lists them. */
export type MarkSample = "moving" | "parked" | "landmark";

/** One tile, in layout points. */
export const MARK_TILE: FrameSize = { width: 74, height: 56 };

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
  /** How far it went over the trail window, in points — which is how long its tail is. */
  travel?: number;
};

const MARK_SAMPLES: Record<MarkSample, readonly Placed[]> = {
  // Near and far, in one colour and on one heading, so that size and the length
  // of the tail are the only two things that differ.
  moving: [
    { category: "EARTH", x: 34, y: 23, rangeKm: 450, headingDeg: 20, travel: 30 },
    { category: "EARTH", x: 62, y: 37, rangeKm: 20000, headingDeg: 20, travel: 8 }
  ],
  // A stretch of the geostationary belt, which is how rings are met on the sky:
  // several in a row, small, and none of them moving.
  parked: [
    { category: "TELECOM", x: 15, y: 31, rangeKm: 37000, headingDeg: null },
    { category: "TELECOM", x: 37, y: 26, rangeKm: 38200, headingDeg: null },
    { category: "TELECOM", x: 59, y: 31, rangeKm: 36800, headingDeg: null }
  ],
  // In the middle of the tile, which is as tall as it is so that the halo of a
  // landmark — the largest mark on the sky — fits inside it.
  landmark: [
    { name: "ISS", category: "LANDMARK", x: 37, y: 28, rangeKm: 420, headingDeg: 20, travel: 18 }
  ]
};

/** Where along its trail each point of a tile's trail lies, as shares of `travel`. */
const TILE_TRAIL_STEPS = [0.25, 0.5, 0.75, 1];

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
    // Where it has been over a trail window, straight back along its heading:
    // at a tile's size an orbit's bend is nothing, so the sample is a line.
    trail:
      heading === null
        ? null
        : TILE_TRAIL_STEPS.map((share) =>
            pointIn(
              box,
              placed.x - travel * share * Math.cos(heading),
              placed.y + travel * share * Math.sin(heading)
            )
          ),
    opacity: 1,
    sunlit: "sunlit"
  };
}

/** Points in a box, as the frame percentages the renderer places things by. */
function pointIn(box: FrameSize, x: number, y: number): FramePoint {
  return { left: (x / box.width) * 100, top: (y / box.height) * 100 };
}
