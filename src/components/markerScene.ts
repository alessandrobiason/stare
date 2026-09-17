import { FramePoint } from "../camera/projection";
import { BRIGHT_BACKDROP, LANDMARK_PATHS, SATELLITE_MARKERS } from "../constants";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { strings } from "../i18n";
import { clockTime } from "../i18n/format";
import { SATELLITE_CATEGORIES } from "../satellite/categories";
import { fleetOf } from "../satellite/fleets";
import {
  FrameSize,
  labellablePoints,
  markerDiameterPx,
  pointOnFrame,
  rangeShare,
  trailPixels
} from "./markerGeometry";
import { Ink, MARK_COLOR, MarkerPalette } from "./palette";

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
 * **A marker is a point of light with a comet's tail.** The app's logo was
 * once a body with a tapered trail sweeping back from it, and the marks kept
 * that shape — but drawn as it was, an opaque disc a couple of dozen pixels
 * across in a solid tail, seventy of them covered the picture they were
 * marking. So the solid part is now a point about half of that, in a glow that
 * fades to nothing; and the tail is the same taper, faded from the point to its
 * tip. What a satellite looks like in the sky is a point of light moving, and
 * that is what is drawn — and the logo (`assets/icon.svg`) and the boot screen
 * (`bootSky`) are now drawn in this light, rather than the other way round.
 *
 * **At night a mark is drawn the way a star photographs.** Three layers of the
 * same light, none of them with an edge: a pale centre that is solid only in
 * its middle and softens out (`CORE_FADE`), a tight glow of the same colour
 * that falls away steeply from it (`GLOW_FADE`), and a wide, faint bloom going
 * deeper in its own hue as it thins (`BLOOM_FADE`, `CATEGORY_BLOOMS`). The
 * point was once a white disc on a near-black ring in a weak glow, and the ring
 * is what made it read as a sticker on the picture rather than as light in it;
 * so at night there is no ring.
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
 * The channels the overlay spends are:
 *
 * - **Colour** is what the satellite is for, and nothing else: one pastel per
 *   category, the same at noon as at midnight, in the point, its glow, its
 *   bloom and its tail alike — a satellite is light of that colour, not a dot
 *   of it. See `CATEGORY_COLORS` and `palette.ts`.
 * - **Shape** is whether it holds station. A geostationary object is a ring
 *   that never moves; everything else is a body with a tail as long as the
 *   distance it covers in a few seconds.
 * - **Size** is distance, on a log scale.
 * - **A label** is spent on the landmarks and on one satellite per category
 *   currently on the frame (`NotableSatellites`), and only where two of them
 *   do not collide.
 *
 * By day the pale fill alone would vanish into the sky, so every mark, tail
 * included, gains a fine edge in a deep shade of its own hue and loses its light: by
 * day the edge is what reads. Both are the palette's business (`glow`, `edge`),
 * and they cross over together at dusk. At night the same happens to a single
 * mark over anything in the picture as bright as it is — the moon, a street
 * lamp, a lit cloud — where light with no edge would simply be gone
 * (`backdropEdge`).
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
 * The trail, as a line along the object's own path: solid where it leaves the
 * mark, then broken into dashes that grow shorter and further apart the further
 * back they are, fading as they go.
 *
 * The line runs through where the object really was (`SatelliteFix.trail`), so
 * it bends as the orbit does rather than being a straight streak laid behind
 * the mark. A stroke of one width rather than the taper it replaced: a taper
 * over three quarters of a minute of orbit is a wedge across the frame, where a fine
 * line is a path. What says which end is the object is the strength instead —
 * solid and bright at the mark, a scatter of faint dots at the far end — which
 * is how a trail left in the sky looks: there, then less and less there.
 *
 * Edged like the point it comes out of — the same runs stroked `rim` wider on
 * every side, in the edge's ink and faded along with it. A pale line on a bright
 * sky is otherwise invisible, and it is the one part of a mark that says which
 * way the object is going.
 */
export type TailShape = {
  /**
   * What to stroke, as runs of flat `x, y` pairs in layout pixels: the solid
   * stretch from the mark's centre first, then each dash in order back along
   * the path. The solid stretch starts under the point, so what shows is the
   * line coming out from behind it.
   */
  runs: number[][];
  /**
   * The trail's far end, where `TAIL_FADE` reaches nothing. The fade is laid
   * straight from the mark's centre to here: over the window a trail covers the
   * path bends by a few pixels in hundreds, and a fade along the chord is a
   * fade along the path to well inside that.
   */
  tipX: number;
  tipY: number;
  /** Along the path, from the mark's centre to the tip, in layout pixels. */
  length: number;
  /** The line's width. */
  width: number;
  /** How strong the line is at the mark, before `TAIL_FADE` takes it to its tip. */
  alpha: number;
  /** How far the edge under the line reaches past it on every side, in layout pixels. */
  rim: number;
};

/**
 * Light around a mark: a disc of colour fading from its centre to nothing at
 * `radius` (`GLOW_FADE`), at `alpha` at the centre.
 */
export type Glow = { radius: number; alpha: number };

/** One satellite's mark: a point in a glow, its tail, edged, haloed if it is a landmark. */
export type GlyphShape = {
  /** Centre, in layout pixels from the frame's top-left. */
  x: number;
  y: number;
  /** The trail behind it, or `null` for an object that holds station. */
  tail: TailShape | null;
  /** The edge under the mark, which is what reads it against the sky. */
  rim: Circle;
  /** The mark itself: a point, or a small ring if the object holds station. */
  core: Circle;
  /** The tight glow of its own colour around it, stronger the nearer it is. */
  glow: Glow;
  /**
   * The wide, faint bloom the glow sits in, in `bloomColor`: what makes the
   * point read as light rather than as paint. Faded like the glow, by
   * `BLOOM_FADE`, and given off only when the glow is.
   */
  bloom: Glow;
  /** The bloom's colour: the category's own hue, deeper. See `CATEGORY_BLOOMS`. */
  bloomColor: string;
  /**
   * The colour of the edge under the mark and its tail: the category's own hue
   * in a deep shade (`CATEGORY_EDGES`), drawn at `edgeAlpha`.
   */
  edgeColor: string;
  /** Radius of the landmark halo, or `null` for everything else. Faded like a glow. */
  halo: number | null;
  /** The mark's fill, as `#rrggbb`: its category's colour. */
  color: string;
  /**
   * How far through a fade the marker is, in `(0, 1]`. The fill, glow, halo
   * and tail are drawn at this on top of their own strength.
   */
  alpha: number;
  /**
   * How strongly the edges — under the point and under the tail — are drawn:
   * the fade alone, times how much edge the sky calls for
   * (`MarkerPalette.edge`) — none at night, all of it by day — or the
   * picture behind the mark does, if that asks for more (`backdropEdge`).
   */
  edgeAlpha: number;
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
 * Two circles, like the marks themselves: a dark edge under a white ring — the
 * edge by day only, as a mark's is (`MarkerPalette.edge`), since at night a
 * dark band round a white one is the sticker the marks stopped being. White
 * rather than the mark's own colour, because the ring is the app's annotation
 * rather than light off the satellite, and it has to stand apart from the
 * pastel marks around it. Drawn clear of
 * the mark rather than over it — the mark's size and shape are channels the
 * overlay spends, and a selection must not paint over either.
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
  /** The ring's colour: the app's own white (`MARK_COLOR`). */
  color: string;
  /** The edge under it, already at the strength the sky calls for: none at night. */
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
  /**
   * The rim's ink, already at the strength the sky calls for: none at night,
   * where a pale line on a dark sky needs no edge and wears one as a stripe,
   * and all of it by day, as the marks have it (`MarkerPalette.edge`).
   */
  rim: Ink;
};

/** A name, and the mark or piece of path it belongs to. */
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
  /**
   * A second, smaller line saying why the object is named — "Closest", "GPS" —
   * or `null` for a name that explains itself.
   */
  detail: string | null;
  /** The anchor's centre; the label is placed beside it and turns about it. */
  x: number;
  y: number;
  /**
   * Which side of the anchor the name is on. A marker's name sits right on top
   * of it; an arc's hangs under its point on the line.
   */
  above: boolean;
  /** How far from that centre the name's nearer edge is, in layout pixels. */
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
 * `scale` is for a box that is not a camera frame: the tour's pictures of a
 * mark are a few dozen points across, and scaled to their own width the marks
 * in them would be a pixel or two. See `markSamples.ts`.
 */
export function buildMarkerScene(
  frame: MarkerFrame,
  box: FrameSize,
  palette: MarkerPalette,
  selectedName: string | null = null,
  scale: number = box.width / DESIGN_FRAME_WIDTH_PX
): MarkerScene {
  const glyphs: GlyphShape[] = [];

  // Which marks get to keep their name. Crew and cargo vehicles share a
  // coordinate with the station they are docked to, so the decision has to be
  // made across the whole frame rather than marker by marker.
  //
  // Only the ones whose mark is on the frame: a satellite kept for its trail
  // (`trailOnFrame`) has its centre outside the view, and a name set beside a
  // centre just past an edge is a label with nothing under it — half of one
  // sliding in at an edge of the frame, which is the flicker the trails were
  // kept to stop.
  //
  // In a fixed order of importance, landmarks first, so that where two names
  // collide the same one wins however the phone has been turned to bring them
  // into view.
  const candidates = frame.markers
    .filter((marker) => labelRank(marker) !== null && pointOnFrame(marker.point))
    .sort((first, second) => (labelRank(first) ?? 0) - (labelRank(second) ?? 0));
  const marks = candidates.map((marker) => marker.point);
  const clear = labellablePoints(marks, box);
  const named = new Set(candidates.filter((_, index) => clear[index]).map((one) => one.name));
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
    const landmark = marker.category === "LANDMARK";
    const footprint = markerDiameterPx(marker.rangeKm) * scale;
    const growth = (selected ? SELECTED_GROWTH : 1) * (landmark ? LANDMARK_GROWTH : 1);
    const size = footprint * growth;
    const strength = selected || landmark ? 1 : depthStrength(marker.rangeKm);
    // How much of the daylight mark this one is drawn as: all of it by day, and
    // at night as much as the picture behind it is bright (`backdropEdge`).
    const edge = Math.max(palette.edge, backdropEdge(marker));
    const light = Math.min(palette.glow, 1 - edge);
    const color = palette.categories[marker.category];
    const edgeColor = palette.edges[marker.category];

    const path = marker.trail ? trailPixels(marker.point, marker.trail, box) : null;

    // A parked object is a small ring rather than a point, and a shade larger
    // than one, since a ring the size of a point is a point. Either way the rim
    // is a larger shape *under* the colour rather than a border inside it,
    // reaching `outline` past the mark and stopping flush with it on the inside,
    // so the colour keeps the full width it was sized at.
    const diameter = size * (marker.parked ? RING_DIAMETER_RATIO : CORE_DIAMETER_RATIO);
    const outline = Math.max(MIN_EDGE_PX, diameter * OUTLINE_RATIO);
    const ring = marker.parked ? Math.max(MIN_RING_PX, diameter * RING_RATIO) : null;
    glyphs.push({
      x,
      y,
      tail:
        path &&
        tailFor(
          path,
          Math.max(MIN_TRAIL_WIDTH_PX * scale, diameter * TRAIL_WIDTH_RATIO),
          TAIL_ALPHA * strength,
          outline * TRAIL_OUTLINE_RATIO,
          scale
        ),
      rim:
        ring === null
          ? { radius: diameter / 2 + outline, width: null }
          : { radius: (diameter + outline - ring) / 2, width: ring + outline },
      core:
        ring === null
          ? { radius: diameter / 2, width: null }
          : { radius: (diameter - ring) / 2, width: ring },
      glow: { radius: size * GLOW_RATIO, alpha: GLOW_ALPHA * strength * light },
      bloom: { radius: size * BLOOM_RATIO, alpha: BLOOM_ALPHA * strength * light },
      bloomColor: palette.blooms[marker.category],
      edgeColor,
      halo: landmark ? size / 2 + HALO_MARGIN_PX * scale : null,
      color,
      alpha: marker.opacity,
      edgeAlpha: marker.opacity * edge
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
        color: MARK_COLOR,
        rim: edgeInk(palette, edge),
        alpha: marker.opacity
      };
    }

    if (named.has(marker.name)) {
      labels.push({
        key: marker.name,
        name: landmark ? marker.name : shortName(marker.name),
        detail: landmark ? null : notableDetail(marker),
        x,
        y,
        above: true,
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
      detail: null,
      x: (arc.anchor.at.left / 100) * box.width,
      y: (arc.anchor.at.top / 100) * box.height,
      above: false,
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
    pastRimWidth: pastWidth + 2 * Math.max(MIN_OUTLINE_PX, pastWidth * OUTLINE_RATIO),
    rim: edgeInk(palette, palette.edge, palette.edges[path.category])
  };
}

/**
 * The dark edge under a line or a ring, at the strength the sky calls for: in
 * `color` — a landmark path's is its category's shade — at the palette's
 * outline strength, times its `edge`, or times `edge` given, for the ring round
 * a mark that is over something bright. The marks carry the same factor on
 * `edgeAlpha` instead, since theirs also fades with the mark.
 */
function edgeInk(
  palette: MarkerPalette,
  edge: number = palette.edge,
  color: string = palette.outline.color
): Ink {
  return { color, alpha: palette.outline.alpha * edge };
}

/**
 * How much of its dark edge a mark needs for what is behind it in the picture,
 * in `[0, 1]`: none over a dark sky, all of it over the moon, a street lamp or a
 * lit cloud.
 *
 * At night a mark is light with no edge, and light with no edge over something
 * as bright as itself is not there at all. So over a bright patch it is drawn
 * the way it is by day — edged, and without the glow that would wash the edge
 * out — and it goes back to being light as it leaves. Eased across a band
 * (`BRIGHT_BACKDROP`) rather than switched, so a mark sliding along the edge of
 * a lit cloud does not blink between the two.
 *
 * Nothing read behind it counts as dark: the backdrop is only missing before
 * the first frame lands or off the edge of the one that did, and a mark there
 * is drawn as the sky's own palette says.
 */
function backdropEdge(marker: SatelliteMarker): number {
  if (marker.backdrop === undefined) return 0;
  const { edgeFromLuminance, edgeFullLuminance } = BRIGHT_BACKDROP;
  const along = Math.min(
    1,
    Math.max(0, (marker.backdrop - edgeFromLuminance) / (edgeFullLuminance - edgeFromLuminance))
  );
  return along * along * (3 - 2 * along);
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

/** The tail along a trail already laid out in pixels (`trailPixels`). */
function tailFor(
  path: { points: number[]; length: number },
  width: number,
  alpha: number,
  rim: number,
  scale: number
): TailShape {
  const { points, length } = path;
  return {
    runs: dashedRuns(points, length, scale),
    tipX: points[points.length - 2],
    tipY: points[points.length - 1],
    length,
    width,
    alpha,
    rim
  };
}

/**
 * A trail broken into what is stroked: the solid stretch from its head, then
 * the dashes (`TAIL_DASH`), each as a run of flat `x, y` pairs along `points`.
 *
 * The solid stretch is a share of the trail, capped, so a short trail is
 * mostly line and a long one does not run a solid bar across the frame. Past it
 * the dashes are measured in pixels from the head rather than as shares of the
 * trail, so the pattern is the same on every mark and does not stretch as a
 * pass swings nearer: each dash a little shorter than the one before and each
 * gap a little longer, until what is left is dots with sky between them. The
 * pattern travels with the head, so it is still while the object moves; only
 * the far end changes, as the trail lengthens and shortens.
 *
 * Exported for the boot screen and the logo, whose one light trails the same
 * line along its arc; `scale` is pixels per design pixel of `TAIL_DASH`.
 */
export function dashedRuns(points: number[], length: number, scale: number): number[][] {
  const { solidShare, solidPx, dashPx, gapPx, dashGrowth, gapGrowth, maxDashes } = TAIL_DASH;
  const spans: [number, number][] = [[0, Math.min(length * solidShare, solidPx * scale)]];
  let dash = dashPx * scale;
  let gap = gapPx * scale;
  let at = spans[0][1] + gap;
  while (at < length && spans.length <= maxDashes) {
    spans.push([at, Math.min(length, at + dash)]);
    at += dash;
    dash *= dashGrowth;
    gap *= gapGrowth;
    at += gap;
  }
  return spans.map(([from, to]) => stretchOf(points, from, to));
}

/**
 * The part of a polyline between two distances along it, as flat `x, y` pairs:
 * the point at `from`, every corner in between, and the point at `to`. A dash
 * that spans a corner turns it, which is what keeps the dashes on the curve.
 */
function stretchOf(points: number[], from: number, to: number): number[] {
  const run: number[] = [];
  let walked = 0;
  for (let index = 2; index < points.length; index += 2) {
    const [x0, y0, x1, y1] = [points[index - 2], points[index - 1], points[index], points[index + 1]];
    const step = Math.hypot(x1 - x0, y1 - y0);
    const next = walked + step;
    if (next >= from && step > 0) {
      if (run.length === 0) {
        const share = (from - walked) / step;
        run.push(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
      }
      if (next >= to) {
        const share = (to - walked) / step;
        run.push(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
        return run;
      }
      run.push(x1, y1);
    }
    walked = next;
  }
  return run;
}

/**
 * How strongly a mark's light is drawn for its distance, in `[FAR_STRENGTH, 1]`:
 * the glow and the tail, both at once.
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
 * How a tail falls away from the mark to its tip.
 *
 * Gently near the mark, where the line is solid and is what says which way the
 * object is going, and steadily after: the dashes carry most of the thinning
 * out already, so the fade only has to take the last of them to nothing — and
 * the tip, where the object was three quarters of a minute ago, is nothing at all
 * rather than a hard end.
 */
export const TAIL_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.12, strength: 0.8 },
  { at: 0.45, strength: 0.32 },
  { at: 1, strength: 0 }
];

/**
 * How a tail breaks up along its length, in pixels at the design width.
 *
 * Solid for the first stretch (`solidShare` of the trail, up to `solidPx`),
 * then a dash of `dashPx` after a gap of `gapPx`, each dash `dashGrowth` times
 * the last and each gap `gapGrowth` times the last. The gaps grow faster than
 * the dashes shrink, so the line reads as dissolving rather than as a uniform
 * dotted rule, and with round caps the last dashes are dots. Capped at
 * `maxDashes`, which a trail across the whole frame does not reach.
 */
export const TAIL_DASH = {
  solidShare: 0.3,
  solidPx: 64,
  dashPx: 11,
  gapPx: 4,
  dashGrowth: 0.82,
  gapGrowth: 1.34,
  maxDashes: 32
} as const;

/**
 * How a mark's glow, or a landmark's halo, falls away from its centre.
 *
 * Steeply: most of it is spent in the first third, hugging the point, which is
 * how the light around a star falls off — bright right beside it and a long way
 * down almost at once.
 */
export const GLOW_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.12, strength: 0.7 },
  { at: 0.35, strength: 0.22 },
  { at: 1, strength: 0 }
];

/** How the wide bloom a glow sits in thins out to nothing. See `MARK_BLOOM`. */
export const BLOOM_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.2, strength: 0.45 },
  { at: 0.5, strength: 0.12 },
  { at: 1, strength: 0 }
];

/**
 * How a moving mark's point fills its own radius: solid through the middle and
 * softening to nothing at its rim, so it is a hot centre rather than a disc with
 * an edge. A parked ring is stroked and stays sharp — a soft ring is a smudge.
 */
export const CORE_FADE: readonly FadeStop[] = [
  { at: 0, strength: 1 },
  { at: 0.5, strength: 1 },
  { at: 1, strength: 0 }
];

/** Width the marker sizes in `constants.ts` are quoted in. */
export const DESIGN_FRAME_WIDTH_PX = 720;

/**
 * The solid point, as a fraction of the footprint the range scale gives a mark.
 *
 * Four to nine pixels at the design width, against the eight to seventeen the
 * whole mark used to be drawn at in solid colour, with the rest of the
 * footprint given over to its glow. A third of the footprint was tried first
 * and was too small on a phone: the far end came out under three points, which
 * is a speck rather than a mark.
 */
const CORE_DIAMETER_RATIO = 0.52;
/**
 * A parked object's ring, likewise. Larger than a point — a ring the size of a
 * point is a point — and still well under the disc it replaced.
 */
const RING_DIAMETER_RATIO = 0.8;
/** How far the glow reaches, as a fraction of the footprint: its radius, not its span. */
const GLOW_RATIO = 1;
/**
 * How strong a glow is at its centre, at full depth strength.
 *
 * Most of the way to solid, since `GLOW_FADE` spends it within a few pixels of
 * the point: what reads is the point burning brighter than its own size, not a
 * second, larger disc of colour.
 */
const GLOW_ALPHA = 0.8;
/** How far the bloom reaches, as a fraction of the footprint: its radius. */
const BLOOM_RATIO = 2.6;
/**
 * How strong the bloom is at its centre, at full depth strength. Faint: it is
 * the air around the light, and seventy of them must not haze the frame.
 */
const BLOOM_ALPHA = 0.35;
/**
 * How strong a tail is where it leaves the point, at full depth strength. A
 * shade under the point itself, so the point stays the brightest thing on it.
 */
const TAIL_ALPHA = 0.8;
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
 * How much larger a landmark is drawn than its range alone says.
 *
 * A landmark is a permanently-tracked object someone is meant to find at a
 * glance among the ordinary traffic around it, so it is drawn distinctly
 * larger rather than left to the same range-based scale as everything else.
 * Twice: at 1.6 a station in low orbit was still only a shade larger than the
 * Starlinks at the same height either side of it, which on a sky of them is
 * one mark among dozens rather than the one worth looking up for.
 */
const LANDMARK_GROWTH = 2;
/**
 * Trail width, as a fraction of the point's diameter.
 *
 * Under a third of the point's width: the point's softened rim (`CORE_FADE`)
 * hides the join, so the line still comes out of the light rather than being
 * stuck to it, and a line this fine reads as the path of a light rather than as
 * the body of a comet.
 */
const TRAIL_WIDTH_RATIO = 0.3;
/** The thinnest a trail is drawn, in pixels at the design width. */
const MIN_TRAIL_WIDTH_PX = 1.4;
/**
 * Edge thickness, as a fraction of the point's diameter.
 *
 * A tenth: enough to part a pale mark from a bright sky, and no more. The edge
 * used to be half again as thick and near-black, and read as an outline drawn
 * round the mark rather than as the mark's own shading.
 */
const OUTLINE_RATIO = 0.1;
/**
 * How much of the point's own edge a trail's rim is drawn at, by day (its
 * alpha is already near zero at night, same as the point's).
 *
 * Under half: at the full `OUTLINE_RATIO` a trail read as a dark stripe down
 * its middle rather than as a line with a fine, parting edge — right for a
 * mark's own rim, too heavy stretched the length of a tail.
 */
export const TRAIL_OUTLINE_RATIO = 0.45;
/** The thinnest a line's rim is drawn, in layout pixels. */
const MIN_OUTLINE_PX = 1;
/**
 * The thinnest a mark's edge is drawn, in layout pixels.
 *
 * Under a pixel, because on the phone a layout pixel is two or three real
 * ones: nine tenths of one is still a continuous ring at the far end of the
 * range scale, and it is in the mark's own hue (`CATEGORY_EDGES`), so it reads
 * as the rim of a coloured light rather than as a grey smudge round it.
 */
const MIN_EDGE_PX = 0.9;
/** Thickness of the parked ring, as a fraction of its diameter. */
const RING_RATIO = 0.2;
const MIN_RING_PX = 1;
const HALO_MARGIN_PX = 10;
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
 * Where a mark's name comes in the queue for clear space: landmarks first,
 * then each category's representative in the filter's own order — so where
 * two collide the same one wins however the phone has been turned to bring
 * them into view. `null` for a mark that is not named at all.
 */
function labelRank(marker: SatelliteMarker): number | null {
  if (marker.category === "LANDMARK") return 0;
  return marker.notable ? 1 + SATELLITE_CATEGORIES.indexOf(marker.category) : null;
}

/**
 * A catalogue name without its trailing brackets: `NAVSTAR 81 (USA 319)` is
 * `NAVSTAR 81`, and `COSMOS 2514 [GLONASS-M]` is `COSMOS 2514`. What is in them
 * is a second designation, and a label the width of two names is one that
 * wraps.
 */
export function shortName(name: string): string {
  return name.replace(/\s*(\([^()]*\)|\[[^[\]]*\])\s*$/, "") || name;
}

/**
 * Why a notable satellite is named: which category it is standing in for. A
 * navigation satellite says which system it belongs to where that has a name
 * — "GPS" says more than "Navigation", and needs no translating — and the
 * category's own word otherwise.
 */
function notableDetail(marker: SatelliteMarker): string | null {
  if (!marker.notable) return null;
  const words = strings().scene.notable;
  switch (marker.category) {
    case "NAVIGATION":
      return fleetOf(marker.name) ?? words.NAVIGATION;
    case "EARTH":
      return words.EARTH;
    case "INTERNET":
      return words.INTERNET;
    case "TELECOM":
      return words.TELECOM;
    case "OTHER":
      return words.OTHER;
    default:
      return null;
  }
}

/**
 * The box a label is drawn in, centred on its marker.
 *
 * Narrower than the space the de-clutter keeps round a name
 * (`SATELLITE_MARKERS.labelSpacingPx`), so two names that both survive it have
 * clear sky between their boxes rather than touching edges.
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
