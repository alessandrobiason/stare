import { SATELLITE_MARKERS } from "../constants";
import { MarkerFrame } from "../hooks/useAnimatedMarkers";
import {
  FrameSize,
  labellablePoints,
  markerDiameterPx,
  trailReach,
  TrailReach
} from "./markerGeometry";
import { MarkerPalette } from "./palette";

/**
 * What the overlay draws, as shapes in layout pixels.
 *
 * The markers used to be a tree of views — six per satellite, seventy-odd
 * satellites, replaced sixty times a second. That is around five hundred
 * native views whose transform, size and opacity all change every frame, and
 * on an iPhone 12 mini it cost the frame rate outright: 60 Hz with an empty
 * sky, under 10 Hz with a full one. None of it was React's fault in a way
 * React could fix — a memoized marker still has to be reconciled, its props
 * serialised, its layer laid out and composited, and a view carrying a partly
 * transparent group of children is composited off-screen at that.
 *
 * So the whole overlay is one drawing node now (`SatelliteMarkers`), and this
 * module is what it draws: a flat list of shapes with their colours and sizes
 * already worked out. Nothing here knows about Skia, about a browser canvas, or
 * about React — which is the point. The look of a marker is decided once, in
 * one file that a test can read, and the two backends only have to be able to
 * fill a circle and a polygon.
 *
 * **A marker is the app's own logo.** `assets/icon.svg` is a body with a
 * tapered trail sweeping back from it, and so is every satellite on the frame —
 * the same shape the boot screen turns five of (`bootSky.ts`), at a couple of
 * dozen pixels. It was a dot with a constant-width capsule laid ahead of it,
 * which reads as a dumbbell at these sizes: two round ends of equal weight with
 * a bar between them, giving no clue which end the satellite is at. A tail that
 * starts at nothing and thickens into the body has only one head, and the eye
 * finds it without being told.
 *
 * The tail also points the other way now. It is the ground the object has just
 * covered rather than the ground it is about to, which is the same distance and
 * the same axis — the trail window is symmetric to within the straight-line
 * approximation it already makes — but it puts the mark at the *front* of the
 * shape. A comet's tail is behind it, and nobody has to be told that either;
 * which way the object is travelling is still there to be read, as the
 * direction it is moving away from its own tail.
 *
 * It is drawn at the mark's own opacity rather than at a fraction of it, as the
 * capsule was. The taper is what makes a tail recede now, and two pixels of
 * colour at six tenths over a photograph of the sky is not reliably anything.
 *
 * The channels are otherwise unchanged, because they are what the overlay is
 * for:
 *
 * - **Colour** is what the satellite is for, and nothing else.
 * - **Shape** is whether it holds station. A geostationary object is a ring
 *   that never moves; everything else is a body with a tail as long as the
 *   distance it covers in a few seconds.
 * - **Size** is distance, on a log scale.
 * - **A label** is spent only on the landmarks, and only where two of them do
 *   not collide.
 *
 * Every mark is a coloured core inside a contrasting rim, because the
 * background is a photograph of the sky and so is either much brighter or much
 * darker than any fill. Which way round that runs — light marks in a dark rim,
 * or dark marks in a light one — is the palette's business rather than this
 * module's; see `palette.ts`.
 */
export type MarkerScene = {
  /** Far to near, so the nearer marker is the one on top. */
  glyphs: GlyphShape[];
  /** Drawn last, and by the one part of the overlay that is still views. */
  labels: LabelPlacement[];
  /** Camera roll, so the labels stay level with the horizon. */
  rollDeg: number;
  /** The colours these shapes are drawn in, which the day decides. */
  palette: MarkerPalette;
};

/**
 * A circle to draw: filled to its radius, or a band of `width` on it.
 *
 * Both mean the same thing to a canvas — `fill` a circle, or `stroke` one at a
 * given width — which is the whole vocabulary the marks need. Keeping the two
 * radii here rather than in the backends is what stops the phone and the
 * harness drawing subtly different rings.
 */
export type Circle = {
  radius: number;
  /** `null` for a filled disc; otherwise the thickness of the band. */
  width: number | null;
};

/**
 * The trail, as the tapered shape the icon draws it as.
 *
 * A polygon rather than a stroke because the shape narrows along its length,
 * which no single stroke width can express; the same reason the boot screen's
 * trails are polygons. Three points is all it takes here, though, where the
 * boot screen needs forty: over the few seconds a trail covers, an orbit's path
 * across the frame is straight to well inside a pixel, so the taper is a
 * triangle rather than an arc.
 */
export type TailShape = {
  /**
   * The closed polygon, as flat `x, y` pairs in layout pixels: the tip it
   * tapers to, then the two corners of its head. The head is the marker's own
   * centre, so the widest part of the tail is under the body and what shows is
   * the taper coming out from behind it.
   */
  points: number[];
  /**
   * Width of the stroke that draws the rim: the same polygon stroked *and*
   * filled in the outline colour, so the rim reaches half of this past every
   * edge and the tip stays a tip.
   */
  rimWidth: number;
};

/** One satellite's mark: a body and its tail, rimmed, haloed if it is a landmark. */
export type GlyphShape = {
  /** Centre, in layout pixels from the frame's top-left. */
  x: number;
  y: number;
  /** The trail behind it, or `null` for an object that holds station. */
  tail: TailShape | null;
  /** The rim under the mark, which is what reads it against the sky. */
  rim: Circle;
  /** The coloured mark itself: a disc, or a ring if the object holds station. */
  core: Circle;
  /** Radius of the landmark halo, or `null` for everything else. */
  halo: number | null;
  /** The category colour, as `#rrggbb`. */
  color: string;
  /** How far through a fade the marker is, in `(0, 1]`. */
  alpha: number;
};

/** A landmark's name, and the mark it belongs under. */
export type LabelPlacement = {
  name: string;
  /** The marker's centre; the label is placed below it and turns about it. */
  x: number;
  y: number;
  /** How far below that centre the name's box starts, in layout pixels. */
  offsetY: number;
  alpha: number;
};

/**
 * Turns a frame of markers into the shapes that draw it.
 *
 * Pure, and the only thing in the overlay that has an opinion about how a
 * satellite looks. Sizes are quoted at `DESIGN_FRAME_WIDTH_PX` and scaled to
 * the frame actually being drawn into, so the overlay is the same picture on a
 * phone and in the replay harness's window.
 */
export function buildMarkerScene(
  frame: MarkerFrame,
  box: FrameSize,
  palette: MarkerPalette
): MarkerScene {
  const scale = box.width / DESIGN_FRAME_WIDTH_PX;
  const glyphs: GlyphShape[] = [];

  // Which landmarks get to keep their name. Crew and cargo vehicles share a
  // coordinate with the station they are docked to, so the decision has to be
  // made across the whole frame rather than marker by marker.
  const landmarks = frame.markers.filter((marker) => marker.category === "LANDMARK");
  const allowed = labellablePoints(
    landmarks.map((marker) => marker.point),
    box
  );
  const named = new Set(landmarks.filter((_, index) => allowed[index]).map((one) => one.name));
  const labels: LabelPlacement[] = [];

  for (const marker of frame.markers) {
    const x = (marker.point.left / 100) * box.width;
    const y = (marker.point.top / 100) * box.height;
    const size = markerDiameterPx(marker.rangeKm) * scale;
    const outline = Math.max(MIN_OUTLINE_PX, size * OUTLINE_RATIO);
    const color = palette.categories[marker.category];
    const landmark = marker.category === "LANDMARK";

    const reach = marker.next ? trailReach(marker.point, marker.next, box) : null;

    // A parked object is a ring rather than a dot. Either way the rim is a
    // larger shape *under* the colour rather than a border inside it, reaching
    // `outline` past the mark and stopping flush with it on the inside, so the
    // colour keeps the full width it was sized at.
    const ring = marker.parked ? Math.max(MIN_RING_PX, size * RING_RATIO) : null;
    glyphs.push({
      x,
      y,
      tail: reach && tailFor(x, y, reach, size * TRAIL_WIDTH_RATIO),
      rim:
        ring === null
          ? { radius: size / 2 + outline, width: null }
          : { radius: (size + outline - ring) / 2, width: ring + outline },
      core:
        ring === null
          ? { radius: size / 2, width: null }
          : { radius: (size - ring) / 2, width: ring },
      halo: landmark ? size / 2 + HALO_MARGIN_PX * scale : null,
      color,
      alpha: marker.opacity
    });

    if (landmark && named.has(marker.name)) {
      labels.push({
        name: marker.name,
        x,
        y,
        offsetY: size / 2 + LABEL_GAP_PX,
        alpha: marker.opacity
      });
    }
  }

  return { glyphs, labels, rollDeg: frame.rollDeg, palette };
}

/**
 * The tail for a marker at `x, y` that is travelling `reach`.
 *
 * Laid backwards along that direction: the head is the marker's own centre and
 * the tip is where the object was `trailSeconds` ago, taken as the reflection
 * of where it will be rather than propagated. That is not a rough stand-in. The
 * frame is a rectilinear projection, so an object moving in a straight line
 * crosses it at a constant rate — equal times are equal distances along the
 * path, whatever the angles do — and what is left over a window this short is
 * the curvature of the orbit itself: a couple of hundredths of a pixel for a
 * low pass, against a marker eight to seventeen wide. A third propagated state
 * per satellite per frame would buy nothing with it.
 */
function tailFor(x: number, y: number, reach: TrailReach, width: number): TailShape {
  // Along the direction of travel, and across it.
  const alongX = reach.dx / reach.length;
  const alongY = reach.dy / reach.length;
  const acrossX = -alongY * (width / 2);
  const acrossY = alongX * (width / 2);

  return {
    points: [
      x - alongX * reach.length,
      y - alongY * reach.length,
      x + acrossX,
      y + acrossY,
      x - acrossX,
      y - acrossY
    ],
    rimWidth: Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO) * 2
  };
}

/** Width the marker sizes in `constants.ts` are quoted in. */
export const DESIGN_FRAME_WIDTH_PX = 720;
/**
 * Trail width where it meets the body, as a fraction of the marker's diameter.
 *
 * The icon's own proportion: its trail is a little under half the radius of the
 * body it runs into, and so are the boot screen's five. A marker is the same
 * drawing two orders of magnitude smaller.
 */
const TRAIL_WIDTH_RATIO = 0.24;
/** Rim thickness, as a fraction of the marker's diameter. */
const OUTLINE_RATIO = 0.16;
const MIN_OUTLINE_PX = 1;
/** Thickness of the parked ring, as a fraction of its diameter. */
const RING_RATIO = 0.17;
const MIN_RING_PX = 1;
const HALO_MARGIN_PX = 6;
/**
 * The box a label is drawn in, centred on its marker.
 *
 * Exactly the width the de-clutter keeps clear, so what is drawn and what was
 * reserved for it are the same box.
 */
export const LABEL_BOX_PX = SATELLITE_MARKERS.labelClearancePx.x * 2;
const LABEL_GAP_PX = 5;
