import { LANDMARK_PATHS, SATELLITE_MARKERS } from "../constants";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { clockTime } from "../i18n/format";
import {
  FrameSize,
  labellablePoints,
  markerDiameterPx,
  pointOnFrame,
  trailReach,
  TrailReach
} from "./markerGeometry";
import { Ink, MarkerPalette } from "./palette";

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
 * And one that is new, and is not about where the object is at all: **how
 * strongly the mark is drawn** says whether the sun is on it. An object in the
 * Earth's shadow has nothing to reflect and cannot be seen however clear the
 * sky is, so it is drawn at half strength — see `sunlightAlpha`.
 *
 * Every mark is a coloured core inside a contrasting rim, because the
 * background is a photograph of the sky and so is either much brighter or much
 * darker than any fill. Which way round that runs — light marks in a dark rim,
 * or dark marks in a light one — is the palette's business rather than this
 * module's; see `palette.ts`.
 */
export type MarkerScene = {
  /**
   * The landmarks' upcoming passes, drawn under everything else.
   *
   * Under, because a path is the ground a mark is read against rather than
   * something to read in its own right: it is the longest shape on the frame by
   * two orders of magnitude, and a line crossing over the marks would be the
   * thing the eye lands on. See `LANDMARK_PATHS`.
   */
  paths: PathShape[];
  /** Far to near, so the nearer marker is the one on top. */
  glyphs: GlyphShape[];
  /** The ring around the marker being read about, or `null` when none is. */
  selection: SelectionRing | null;
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

/**
 * The ring drawn around a tapped satellite, and the whole of what says which
 * mark the info card is talking about.
 *
 * It matters most in exactly the case that made a card necessary: a tap over a
 * cluster offers several names, and without this, switching between them
 * changes some text at the bottom of the screen and nothing else — the sky
 * never says which of the four marks under the finger is the one now being
 * described.
 *
 * Two circles, like the marks themselves: a dark rim under a bright ring, so it
 * reads against a photograph of the sky whichever way round the day has the
 * palette. Drawn clear of the mark rather than over it — the mark's own colour,
 * size and shape are three of the four channels the overlay has, and a
 * selection must not paint over any of them.
 */
export type SelectionRing = {
  /** Centre: the marker's own. */
  x: number;
  y: number;
  /** Radius of the ring, outside everything the marker draws. */
  radius: number;
  /** Thickness of the bright ring, and of the dark rim carrying it. */
  width: number;
  rimWidth: number;
  /** The ring's colour: the palette's own, so it flips with the day. */
  color: string;
  rim: Ink;
  /** The fade the marker is in, so the ring goes with it rather than alone. */
  alpha: number;
};

/**
 * One landmark's path across the sky, as the lines that draw it.
 *
 * A stroked polyline rather than the tapered polygon a trail is drawn as, and
 * for the opposite reason. A trail is a dozen pixels of the object's own body
 * and has to say which end the object is at; a path is two thousand pixels of
 * sky the object has not reached yet, and what it has to do is stay legible
 * while crossing a photograph without becoming the subject of it. So it is thin,
 * even, and rimmed like everything else the overlay draws.
 *
 * The marks along it are what make it a timetable rather than a curve: an
 * arrowhead at each round clock minute, at a cadence the pass chooses for
 * itself (`ticksAlong`). An arrowhead rather than the stroke across the line
 * this began as, because a cross-stroke answers "when" and leaves "which way"
 * to be guessed — and which way is the first thing anyone asks of a line drawn
 * across the sky. Not a dot, either: a dot on a line is a satellite in this
 * overlay's vocabulary, and the marks are not objects.
 */
export type PathShape = {
  /**
   * The arc, as runs of flat `x, y` pairs in layout pixels. More than one when
   * the path leaves the view and comes back into it.
   */
  lines: number[][];
  /**
   * The marks: each an arrowhead, as the three points of an open chevron —
   * `x, y` for one arm, the point itself, then the other arm. Stroked like the
   * line, so a mark is the same line turning a corner rather than a new shape.
   */
  arrows: number[][];
  /** The category colour, which for a landmark path is the landmark colour. */
  color: string;
  /** How solid the line is, which says how far ahead the pass is. */
  alpha: number;
  /** Width of the line, and of the rim laid under it. */
  width: number;
  rimWidth: number;
};

/** A landmark's name, and the mark it belongs under. */
export type LabelPlacement = {
  /**
   * What identifies this label between frames.
   *
   * The name is not enough on its own any more: a landmark can be named twice
   * on one frame — once under its marker, and once at the point where its next
   * pass begins — and two views keyed by the same string is one view.
   */
  key: string;
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
  palette: MarkerPalette,
  selectedName: string | null = null
): MarkerScene {
  const scale = box.width / DESIGN_FRAME_WIDTH_PX;
  const glyphs: GlyphShape[] = [];

  // Which landmarks get to keep their name. Crew and cargo vehicles share a
  // coordinate with the station they are docked to, so the decision has to be
  // made across the whole frame rather than marker by marker.
  //
  // Only the ones whose mark is on the frame: a satellite kept for its trail
  // (`trailOnFrame`) has its centre outside the view, and a name set below a
  // centre just past an edge is a label with nothing under it — half of one
  // sliding in at the top of the frame, which is the flicker the trails were
  // kept to stop.
  const landmarks = frame.markers.filter(
    (marker) => marker.category === "LANDMARK" && pointOnFrame(marker.point)
  );
  const marks = landmarks.map((marker) => marker.point);
  const named = new Set(
    landmarks.filter((_, index) => labellablePoints(marks, box)[index]).map((one) => one.name)
  );
  // Every arc says which object it belongs to as well, at a point on the line
  // itself (`MarkerPath.anchor`). Without it a landmark hidden behind a roof —
  // which is a landmark with no marker at all — leaves an anonymous line across
  // the sky, and the one question anyone has about a line is whose it is.
  //
  // Not while its own marker is carrying the name a few pixels away, though:
  // that is the same word twice on one frame, and the marker's is the better
  // placed of the two.
  const arcs = frame.paths.flatMap((path) =>
    path.anchor && !named.has(path.name) ? [{ path, anchor: path.anchor }] : []
  );
  // Both kinds compete for the same clear space, and the marks win: a name over
  // something someone can look at now outranks one over a line. Run again over
  // the two together rather than kept from above, so an arc's name is placed
  // against the marks' names as well as against the other arcs'.
  const allowed = labellablePoints([...marks, ...arcs.map((arc) => arc.anchor.at)], box);
  const labels: LabelPlacement[] = [];
  let selection: SelectionRing | null = null;

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
      alpha: marker.opacity * sunlightAlpha(marker)
    });

    if (marker.name === selectedName) {
      // Outside the halo where there is one, so a selected landmark is not a
      // ring drawn through its own glow.
      const clear = landmark ? size / 2 + HALO_MARGIN_PX * scale : size / 2 + outline;
      selection = {
        x,
        y,
        radius: clear + SELECTION_GAP_PX * scale + (SELECTION_WIDTH_PX * scale) / 2,
        width: SELECTION_WIDTH_PX * scale,
        rimWidth: (SELECTION_WIDTH_PX + 2 * MIN_OUTLINE_PX) * scale,
        color: palette.label,
        rim: palette.outline,
        alpha: marker.opacity
      };
    }

    if (landmark && named.has(marker.name)) {
      labels.push({
        key: marker.name,
        name: marker.name,
        x,
        y,
        offsetY: size / 2 + LABEL_GAP_PX,
        alpha: marker.opacity
      });
    }
  }

  arcs.forEach((arc, index) => {
    if (!allowed[marks.length + index]) return;
    labels.push({
      key: arc.path.key,
      // The name carries the clock time its object is *at this point on the
      // line*, which is the whole answer to "when do I go outside, and where do
      // I stand". The anchor is one of the arc's own samples and knows when its
      // object is there (`PathAnchor`), so the time moves down the line with the
      // name instead of being the rise time wherever the name ended up — which
      // is a time for the point it is written under only where that point is
      // the rise, and reads as one everywhere else.
      //
      // A time rather than a countdown because that is what someone reads once
      // and remembers; the line itself is what says how long the pass lasts, in
      // the marks along it.
      //
      // On two lines, because a name and a time on one do not fit the box a
      // label is set in — `SOYUZ-MS 33 22:13` is half again as wide as it — and
      // the half that would be cut is the time. Broken here rather than left to
      // wrap, so where it breaks is not a question about a typeface.
      name: `${arc.path.name}\n${clockTime(new Date(arc.anchor.atMs))}`,
      x: (arc.anchor.at.left / 100) * box.width,
      y: (arc.anchor.at.top / 100) * box.height,
      offsetY: ARC_LABEL_GAP_PX * scale,
      alpha: pathOpacity(arc.path.lead)
    });
  });

  return {
    paths: frame.paths.map((path) => pathShapeFor(path, box, scale, palette)),
    glyphs,
    selection,
    labels,
    rollDeg: frame.rollDeg,
    palette
  };
}

/**
 * One projected pass as the lines that draw it.
 *
 * The rim is the same idea as a marker's — a wider stroke of the outline colour
 * laid under the coloured one, so the line survives a photograph of whatever the
 * camera is pointed at — and the same arithmetic, so a path and a mark are
 * outlined to the same weight on any frame size.
 */
function pathShapeFor(
  path: MarkerPath,
  box: FrameSize,
  scale: number,
  palette: MarkerPalette
): PathShape {
  const width = LANDMARK_PATHS.widthPx * scale;
  const along = LANDMARK_PATHS.arrowLengthPx * scale;
  const across = LANDMARK_PATHS.arrowSpreadPx * scale;
  const arrows: number[][] = [];

  for (const tick of path.ticks) {
    const x = (tick.at.left / 100) * box.width;
    const y = (tick.at.top / 100) * box.height;
    // The direction the path runs in, taken in pixels rather than in percent:
    // the frame is not square, so a mark laid out in percent would sit square
    // to the line only where the line happened to be level. Same reason the
    // markers' tails are measured in pixels (`trailReach`).
    const dx = ((tick.ahead.left - tick.at.left) / 100) * box.width;
    const dy = ((tick.ahead.top - tick.at.top) / 100) * box.height;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) continue;
    // The point sits on the minute and the arms sweep back from it, so the mark
    // reads as the object being *there* at that time and heading on.
    const backX = x - (dx / length) * along;
    const backY = y - (dy / length) * along;
    arrows.push([
      backX + (dy / length) * across,
      backY - (dx / length) * across,
      x,
      y,
      backX - (dy / length) * across,
      backY + (dx / length) * across
    ]);
  }

  return {
    lines: path.lines.map((line) =>
      line.flatMap((point) => [(point.left / 100) * box.width, (point.top / 100) * box.height])
    ),
    arrows,
    color: palette.categories[path.category],
    alpha: pathOpacity(path.lead),
    width,
    rimWidth: width + 2 * Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO)
  };
}

/**
 * How solid a path is drawn, from how far ahead its pass is.
 *
 * The only channel a path has that a marker does not, and it is spent on time:
 * see `LANDMARK_PATHS.nearOpacity`.
 */
function pathOpacity(lead: number): number {
  const { nearOpacity, farOpacity } = LANDMARK_PATHS;
  return nearOpacity + (farOpacity - nearOpacity) * lead;
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
 * How far to fade a marker for want of sunlight, as a factor on its opacity.
 *
 * **A mark at full strength means the sun is on it.** Half of every orbit is
 * spent inside the Earth's shadow, and an object in there is reflecting
 * nothing: the marker is over a piece of sky with nothing in it to see. Until
 * the shadow was worked out (`src/satellite/illumination.ts`) the overlay drew
 * those exactly as it drew the lit ones, which on a clear evening is half the
 * marks on the frame pointing at nothing — and no way to tell which half.
 *
 * Opacity is the channel it costs, and it is the only one going spare. The four
 * the overlay already carries are all in use at rest — hue for what the object
 * is for, fill and shape for whether it holds station, size for range, a name
 * for the landmarks — and spending any of them would be trading one fact for
 * another. Opacity is not: at rest a marker is either faded fully in or has
 * been dropped, and everything in between belongs to the crossfade the terrain
 * mask arbitrates (`MarkerVisibilityFilter`), which is a transition rather than
 * something to read. A marker held permanently at half strength is a state
 * nothing else produces.
 *
 * It is also the channel that means the right thing. An object in the Earth's
 * shadow *is* dimmer — infinitely so — and a fainter mark for a fainter object
 * needs no key to be guessed at. Applied here rather than on the marker itself
 * so it lands after the loop has decided what is worth drawing at all: this is
 * how a satellite looks, not whether it is on the frame.
 *
 * A factor rather than a replacement, so an eclipsed marker still fades in and
 * out behind a roof like any other — the two compound, which is honest, since
 * such a marker really is both.
 *
 * The mark and nothing else. A landmark's name and the ring around a tapped
 * object are the app's own annotations rather than light coming off a
 * satellite, and both stay at full strength: somebody wants to read `ISS` and
 * to see which mark they have selected exactly as much when the thing is in the
 * Earth's shadow — arguably more, since that is the case they are going to ask
 * a question about.
 */
function sunlightAlpha(marker: SatelliteMarker): number {
  return marker.sunlit === "eclipsed" ? SHADOW_ALPHA : 1;
}

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
/**
 * What is left of a marker with no sun on it. See `sunlightAlpha`.
 *
 * Half, which is far enough to read as a different kind of mark at a glance and
 * not so far that the object is lost: it is still there, it still has a colour,
 * a size and a heading, and all three are how somebody finds it again when it
 * comes back into the sunlight a few minutes later. Fading it to near nothing
 * would be the overlay deciding on somebody's behalf that an object it can
 * place exactly is not worth showing them.
 */
const SHADOW_ALPHA = 0.5;
const HALO_MARGIN_PX = 6;
/** Clear sky left between a mark and the ring saying it is selected. */
const SELECTION_GAP_PX = 4;
/**
 * Thickness of that ring, quoted at the design width like every size here.
 *
 * A shade heavier than the rim under a marker (`OUTLINE_RATIO` of a 17-pixel
 * body is 2.7), because at the scale a phone actually draws this frame at —
 * about 0.55, so a hair over a point and a half — a thinner ring around the
 * eight pixels the geostationary belt gets is a smudge rather than a mark of
 * selection.
 */
const SELECTION_WIDTH_PX = 3;
/**
 * The box a label is drawn in, centred on its marker.
 *
 * Exactly the width the de-clutter keeps clear, so what is drawn and what was
 * reserved for it are the same box.
 */
export const LABEL_BOX_PX = SATELLITE_MARKERS.labelClearancePx.x * 2;
const LABEL_GAP_PX = 5;
/**
 * How far below its anchor an arc's name is set, in pixels at the design width.
 *
 * Further than a marker's own name sits below its mark, because there is no
 * mark here: what the name is placed under is a point on a line, and set as
 * close as a marker's it reads as writing *on* the line rather than about it.
 */
const ARC_LABEL_GAP_PX = 10;
