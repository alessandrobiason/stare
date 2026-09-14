import { FramePoint } from "../camera/projection";
import { LANDMARK_PATHS, SATELLITE_MARKERS } from "../constants";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { clockTime } from "../i18n/format";
import {
  FrameSize,
  labellablePoints,
  markerDiameterPx,
  pointOnFrame,
  rangeShare,
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
 * fill a circle and a polygon, and fade one along a line (`FadeStop`).
 *
 * **A marker is a point of light with a comet's tail.** The app's own logo is
 * a body with a tapered trail sweeping back from it (`assets/icon.svg`), and
 * the marks kept that shape — but drawn as it was, an opaque disc a couple of
 * dozen pixels across in a solid tail, seventy of them covered the picture they
 * were marking. So the solid part is now a point about half of that, with a
 * lit centre, in a glow of its own colour that fades to nothing; and the tail
 * is the same taper, faded from the point to its tip. What a satellite looks
 * like in the sky is a point of light moving, and that is what is drawn.
 *
 * The tail is the ground the object has just covered: it tapers from nothing
 * into the point, so the shape has only one head and the eye finds it without
 * being told. A comet's tail is behind it, and nobody has to be told that
 * either; which way the object is travelling is there to be read, as the
 * direction it is moving away from its own tail.
 *
 * **Depth is spent twice.** A nearer object is drawn larger, as it always was,
 * and now brighter as well — its glow and its tail stronger, a farther one's
 * weaker (`depthStrength`). Restrained on purpose: both are read off the same
 * logarithmic range scale as the size, and the far end is still plainly drawn.
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
 * Every point sits on a contrasting rim a pixel wide, because the background is
 * a photograph of the sky and so is either much brighter or much darker than
 * any fill — a street lamp or the moon behind a glowing point swallows it
 * otherwise. Which way round that runs — light marks in a dark rim, or dark
 * marks in a light one — is the palette's business rather than this module's;
 * see `palette.ts`. So is how much a mark glows at all, which by day is hardly.
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
 * One step of a fade: how far along it, in `[0, 1]`, and how much of the
 * shape's strength is left there.
 *
 * What both backends build their gradient from, so a tail on the phone and a
 * tail in the harness fall away at the same rate. See `TAIL_FADE`.
 */
export type FadeStop = { at: number; strength: number };

/**
 * The trail, as the tapered shape the icon draws it as, faded from the mark to
 * its tip.
 *
 * A polygon rather than a stroke because the shape narrows along its length,
 * which no single stroke width can express; the same reason the boot screen's
 * trails are polygons. Three points is all it takes here, though, where the
 * boot screen needs forty: over the few seconds a trail covers, an orbit's path
 * across the frame is straight to well inside a pixel, so the taper is a
 * triangle rather than an arc.
 *
 * No rim, unlike the point it comes out of. A tail is the quietest part of a
 * mark and fades to nothing anyway; a dark edge around it would be the one part
 * of it that did not.
 */
export type TailShape = {
  /**
   * The closed polygon, as flat `x, y` pairs in layout pixels: the tip it
   * tapers to, then the two corners of its head. The head is the marker's own
   * centre, so the widest part of the tail is under the body and what shows is
   * the taper coming out from behind it.
   */
  points: number[];
  /** From the mark's centre to the tip, in layout pixels. */
  length: number;
  /** Which way the tip lies from the centre, in radians clockwise from `+x`. */
  angle: number;
  /** Across the head, where the tail meets the point. */
  width: number;
  /** How strong the tail is at its head, before `TAIL_FADE` takes it to its tip. */
  alpha: number;
};

/**
 * Light around a mark: a disc of colour fading from its centre to nothing at
 * `radius` (`GLOW_FADE`), at `alpha` at the centre.
 */
export type Glow = { radius: number; alpha: number };

/** The lit centre of a moving mark's point. */
export type Spark = {
  radius: number;
  /** The mark's own colour, lit: its hue, much nearer white. */
  color: string;
  alpha: number;
};

/** One satellite's mark: a point in a glow, its tail, rimmed, haloed if it is a landmark. */
export type GlyphShape = {
  /** Centre, in layout pixels from the frame's top-left. */
  x: number;
  y: number;
  /** The trail behind it, or `null` for an object that holds station. */
  tail: TailShape | null;
  /** The rim under the mark, which is what reads it against the sky. */
  rim: Circle;
  /** The coloured mark itself: a point, or a small ring if the object holds station. */
  core: Circle;
  /** The glow of the mark's own colour around it, stronger the nearer it is. */
  glow: Glow;
  /** The bright centre of the point, or `null` for a ring, which has none. */
  spark: Spark | null;
  /** Radius of the landmark halo, or `null` for everything else. Faded like a glow. */
  halo: number | null;
  /** The category colour, as `#rrggbb`. */
  color: string;
  /**
   * How far through a fade the marker is, in `(0, 1]`, times whether the sun is
   * on it. Everything above is drawn at this on top of its own strength.
   */
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
 * Stroked lines rather than the tapered polygon a trail is drawn as, and for
 * the opposite reason. A trail is a dozen pixels of the object's own body and
 * has to say which end the object is at; a path is two thousand pixels of sky,
 * and what it has to do is stay legible while crossing a photograph without
 * becoming the subject of it. So it is thin and rimmed like everything else the
 * overlay draws.
 *
 * It is two lines that meet at the object, and they are drawn as different
 * things. The sky still to come is dashed, clearly visible, at the strength the
 * pass's lead gives it. The sky already covered is a thinner, fainter solid
 * wake that fades out a couple of dozen degrees back. Between them the object's
 * own mark is the brightest thing on the line — so a pass reads as where it has
 * been, where it is and where it goes without a key to any of it.
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
   * The arc still ahead, as its dashes: each a run of flat `x, y` pairs in
   * layout pixels, stroked at `width` and `alpha`.
   */
  dashes: number[][];
  /**
   * The wake behind the object, a step at a time from the object backwards:
   * each a run of flat `x, y` pairs stroked at `pastWidth` and its own `alpha`,
   * which falls to nothing at the far end. Drawn with square-cut ends, so the
   * steps meet end to end rather than overlapping into beads.
   */
  past: { points: number[]; alpha: number }[];
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
  /** Width of the dashes and marks, and of the rim laid under them. */
  width: number;
  rimWidth: number;
  /** The same, for the wake. */
  pastWidth: number;
  pastRimWidth: number;
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
 *
 * `scale` is for a box that is not a camera frame: the intro's pictures of a
 * mark are a few dozen points across, and scaled to their own width the marks
 * in them would be a pixel or two. See `introFigures.ts`.
 */
export function buildMarkerScene(
  frame: MarkerFrame,
  box: FrameSize,
  palette: MarkerPalette,
  selectedName: string | null = null,
  scale: number = box.width / DESIGN_FRAME_WIDTH_PX
): MarkerScene {
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
    const selected = marker.name === selectedName;
    // The span of the mark's light, which is what the range scale sizes; the
    // selected one a little larger, so the eye finds it inside its ring.
    const footprint = markerDiameterPx(marker.rangeKm) * scale;
    const size = selected ? footprint * SELECTED_GROWTH : footprint;
    const strength = selected ? 1 : depthStrength(marker.rangeKm);
    const color = palette.categories[marker.category];
    const landmark = marker.category === "LANDMARK";

    const reach = marker.next ? trailReach(marker.point, marker.next, box) : null;

    // A parked object is a small ring rather than a point, and a shade larger
    // than one, since a ring the size of a point is a point. Either way the rim
    // is a larger shape *under* the colour rather than a border inside it,
    // reaching `outline` past the mark and stopping flush with it on the inside,
    // so the colour keeps the full width it was sized at.
    const diameter = size * (marker.parked ? RING_DIAMETER_RATIO : CORE_DIAMETER_RATIO);
    const outline = Math.max(MIN_OUTLINE_PX, diameter * OUTLINE_RATIO);
    const ring = marker.parked ? Math.max(MIN_RING_PX, diameter * RING_RATIO) : null;
    glyphs.push({
      x,
      y,
      tail: reach && tailFor(x, y, reach, diameter * TRAIL_WIDTH_RATIO, TAIL_ALPHA * strength),
      rim:
        ring === null
          ? { radius: diameter / 2 + outline, width: null }
          : { radius: (diameter + outline - ring) / 2, width: ring + outline },
      core:
        ring === null
          ? { radius: diameter / 2, width: null }
          : { radius: (diameter - ring) / 2, width: ring },
      glow: { radius: size * GLOW_RATIO, alpha: GLOW_ALPHA * strength * palette.glow },
      spark:
        ring === null
          ? {
              radius: (diameter / 2) * SPARK_RATIO,
              color: litColor(color),
              alpha: strength * palette.glow
            }
          : null,
      halo: landmark ? size / 2 + HALO_MARGIN_PX * scale : null,
      color,
      alpha: marker.opacity * sunlightAlpha(marker)
    });

    if (selected) {
      // Clear of the point and its rim, and inside the glow rather than outside
      // it: a glow has no edge to clear, and a ring drawn past the landmark
      // halo would be a hand's width across around a mark a few pixels wide.
      const clear = diameter / 2;
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
        // Off the footprint rather than the drawn size, so a name does not jump
        // when its mark is tapped.
        offsetY: footprint / 2 + LABEL_GAP_PX,
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
  const pastWidth = LANDMARK_PATHS.pastWidthPx * scale;
  const alpha = pathOpacity(path.lead);
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

  const pixels = (run: FramePoint[]) =>
    run.flatMap((point) => [(point.left / 100) * box.width, (point.top / 100) * box.height]);

  return {
    dashes: path.dashes.map(pixels),
    past: path.past.map((step) => ({
      points: pixels(step.points),
      alpha: alpha * LANDMARK_PATHS.pastOpacity * wakeStrength(step.behind)
    })),
    arrows,
    color: palette.categories[path.category],
    alpha,
    width,
    rimWidth: width + 2 * Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO),
    pastWidth,
    pastRimWidth: pastWidth + 2 * Math.max(MIN_OUTLINE_PX, pastWidth * OUTLINE_RATIO)
  };
}

/**
 * How much of the wake is left `behind` of the way back along it, in `[0, 1]`.
 *
 * Eased rather than linear: the first few degrees behind the object carry
 * nearly all of it, which is where the wake has something to say — which way
 * the object came — and the rest is a thread thinning out, so the wake has no
 * end anyone can see.
 */
function wakeStrength(behind: number): number {
  const left = Math.max(0, 1 - behind);
  return left * left;
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
function tailFor(
  x: number,
  y: number,
  reach: TrailReach,
  width: number,
  alpha: number
): TailShape {
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
    length: reach.length,
    angle: Math.atan2(-reach.dy, -reach.dx),
    width,
    alpha
  };
}

/**
 * How strongly a mark's light is drawn for its distance, in `[FAR_STRENGTH, 1]`:
 * the glow, the lit centre and the tail, all at once.
 *
 * The second half of depth, after size. Read off the same range scale
 * (`rangeShare`), so the nearest objects are the largest and the brightest
 * together, and linear on it — so the geostationary belt, two decades out, is
 * drawn at half strength rather than faded out: it is still there, and still
 * worth finding.
 *
 * Not the mark's own opacity. That already says two things — how far through a
 * fade behind terrain it is, and whether the sun is on it — and a third meaning
 * would make all three unreadable. The point itself stays solid at any range;
 * what a far object loses is the light around it.
 */
function depthStrength(range: number): number {
  return 1 - (1 - FAR_STRENGTH) * rangeShare(range);
}

/**
 * A colour lit: laid over itself as light, twice.
 *
 * What a point of light looks like at its centre is its own hue driven towards
 * white, and screening a colour onto itself is exactly that — every channel
 * moves towards full by what it has left, so a hue stays itself and a darker
 * colour stays darker than a brighter one. The quiet tier's slate is lit to a
 * pale slate rather than to the white the landmarks' is.
 *
 * Cached for the reason `SatelliteMarkers` caches parsed colours: a palette is
 * a handful of strings and the day's fade has a fixed number of steps.
 */
function litColor(color: string): string {
  const known = litColors.get(color);
  if (known) return known;
  const lit = `#${[1, 3, 5]
    .map((index) => {
      const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
      return Math.round((1 - (1 - channel) ** 3) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
  litColors.set(color, lit);
  return lit;
}

const litColors = new Map<string, string>();

/**
 * How a tail falls away from the mark to its tip.
 *
 * Fast at first and slow after: most of its strength is spent in the first
 * third, next to the point, so what reads is a bright streak coming out of the
 * mark and thinning into the sky — and the tip, where the object was twelve
 * seconds ago, is nothing at all rather than a hard end.
 */
export const TAIL_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.3, strength: 0.5 },
  { at: 0.65, strength: 0.15 },
  { at: 1, strength: 0 }
];

/** How a glow, or a landmark's halo, falls away from its centre. */
export const GLOW_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.25, strength: 0.6 },
  { at: 0.55, strength: 0.2 },
  { at: 1, strength: 0 }
];

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
 * The solid point, as a fraction of the footprint the range scale gives a mark.
 *
 * Four to nine pixels at the design width, against the eight to seventeen the
 * whole mark used to be drawn at in solid colour, with the rest of the
 * footprint given over to its glow. A third of the footprint was tried first
 * and was too small on a phone: the far end came out under three points, which
 * is a speck rather than a mark, and the colour could not be read in it.
 */
const CORE_DIAMETER_RATIO = 0.52;
/**
 * A parked object's ring, likewise. Larger than a point — a ring the size of a
 * point is a point — and still well under the disc it replaced.
 */
const RING_DIAMETER_RATIO = 0.8;
/** How far the glow reaches, as a fraction of the footprint: its radius, not its span. */
const GLOW_RATIO = 0.9;
/**
 * How strong a glow is at its centre, at full depth strength.
 *
 * Half, which over the point's rim and the sky around it reads as light coming
 * off the mark rather than as a second, larger disc of colour.
 */
const GLOW_ALPHA = 0.5;
/** The lit centre, as a fraction of the point's radius. */
const SPARK_RATIO = 0.55;
/**
 * How strong a tail is where it leaves the point, at full depth strength. A
 * shade under the point itself, so the point stays the brightest thing on it.
 */
const TAIL_ALPHA = 0.85;
/**
 * What is left of a mark's light at the far end of the range scale. See
 * `depthStrength`.
 */
const FAR_STRENGTH = 0.5;
/**
 * How much larger the tapped satellite is drawn than its range alone says.
 *
 * A quarter: enough that the one being read about stands out from marks beside
 * it at the same range, not so much that it looks nearer than the one in front
 * of it.
 */
const SELECTED_GROWTH = 1.25;
/**
 * Trail width where it meets the point, as a fraction of the point's diameter.
 *
 * Most of the point's own width, so the tail comes out from behind it as a
 * continuation of the mark rather than as a thread stuck to it — and, with the
 * point half the size the old discs were, about as wide in pixels as the tails
 * they trailed.
 */
const TRAIL_WIDTH_RATIO = 0.75;
/** Rim thickness, as a fraction of the point's diameter. */
const OUTLINE_RATIO = 0.16;
const MIN_OUTLINE_PX = 1;
/** Thickness of the parked ring, as a fraction of its diameter. */
const RING_RATIO = 0.2;
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
/**
 * Clear sky left between a point and the ring saying it is selected, quoted at
 * the design width.
 *
 * Measured from the point's own edge and wide enough to clear its rim at any
 * frame size, so the ring sits in the glow a few pixels out from the mark.
 */
const SELECTION_GAP_PX = 5;
/**
 * Thickness of that ring, quoted at the design width like every size here.
 *
 * Fine, like the marks it goes round: a ring as heavy as the old three pixels
 * around a point of four would be the loudest thing on the frame. The dark rim
 * under it is what keeps it legible at this weight.
 */
const SELECTION_WIDTH_PX = 1.5;
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
