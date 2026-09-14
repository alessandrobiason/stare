import React from "react";
import { StyleSheet } from "react-native";
import { MarkerSource, useMarkerFrames } from "../hooks/useAnimatedMarkers";
import { MarkerLabels } from "./MarkerLabels";
import { FrameSize } from "./markerGeometry";
import {
  buildMarkerScene,
  Circle,
  GLOW_FADE,
  GlyphShape,
  MarkerScene,
  PathShape,
  SelectionRing,
  TAIL_FADE,
  TailShape
} from "./markerScene";
import { MarkerPalette } from "./palette";
import {
  PaintStyle,
  Skia,
  SkiaPictureView,
  StrokeCap,
  StrokeJoin,
  TileMode,
  createPicture
} from "./skia";
import type { SkCanvas, SkColor, SkPaint, SkPath, SkPicture, SkShader } from "./skia";

type Props = {
  /** The drawn frames, as a subscription. See `MarkerSource`. */
  markers: MarkerSource;
  /** The box the markers are drawn over. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Night or daylight, and the crossfade between them. See `palette.ts`. */
  palette: MarkerPalette;
  /** The satellite being read about, ringed on the frame. See `SelectionRing`. */
  selectedName?: string | null;
  /** Mark sizes against the design width, for a box that is not a camera frame. */
  scale?: number;
};

/**
 * The satellite overlay: every marker on the frame, in one drawing node.
 *
 * This is the only tree in the app under real time pressure, and it used to be
 * a tree — a view for the mark, one for its rim, one for the halo, two for the
 * trail, one for the box holding them, seventy times over, all of them moving
 * every frame. Around five hundred views is not a number React can be made
 * fast at sixty frames a second, whatever is memoized: each one still has to
 * be reconciled, have its props crossed into native, be laid out and be
 * composited, and a view that fades a group of children is composited into an
 * off-screen buffer of its own to do it. On an iPhone 12 mini the overlay ran
 * at 60 Hz with an empty sky and under 10 with a full one.
 *
 * So the marks are not views any more. `markerScene` works out the shapes,
 * and this records them into a Skia picture — one native view, one draw, a
 * cost that grows with the number of *shapes* rather than with the number of
 * views. What React does per displayed frame is render this one component.
 *
 * The picture is rebuilt rather than mutated because that is what a picture
 * is: a recorded display list, cheap to record (a few hundred calls into an
 * already-open canvas) and free to replay. `SkiaPictureView` hands it to the
 * native view as a JSI property, so a new frame does not touch the shadow tree
 * at all.
 *
 * The names are the exception, and stay views — see `MarkerLabels`.
 *
 * Memoized, because the view above it renders whenever a sky mask lands, and
 * each of those renders was one more scene built and recorded on top of the
 * frames this component is already drawing — on the frames the rest of the
 * pass is landing on.
 */
export const SatelliteMarkers: React.FC<Props> = React.memo(({
  markers,
  frame,
  palette,
  selectedName = null,
  scale
}) => {
  const drawn = useMarkerFrames(markers);
  if (!frame) return null;

  const scene = buildMarkerScene(drawn, frame, palette, selectedName, scale);
  return (
    <>
      <SkiaPictureView
        picture={record(scene, frame)}
        style={[styles.canvas, frame]}
        pointerEvents="none"
      />
      <MarkerLabels labels={scene.labels} rollDeg={scene.rollDeg} palette={palette} />
    </>
  );
});

SatelliteMarkers.displayName = "SatelliteMarkers";

/** The scene as a display list, ready for the view to replay. */
function record(scene: MarkerScene, frame: FrameSize): SkPicture {
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setStrokeJoin(StrokeJoin.Round);
      paint.setStrokeCap(StrokeCap.Round);

      // One path, rewound per shape: allocating a native object for each dash
      // and each step of a wake every frame is the kind of cost this whole
      // arrangement exists to avoid.
      const line = Skia.Path.Make();
      // Under the marks, and first: a path is what the marks are read against.
      for (const path of scene.paths) drawPath(canvas, paint, line, path, scene.palette);
      // Every rim before any mark's light. Crew and cargo vehicles sit on the
      // station they are docked to, so the station is several marks in one
      // place, and each rim laid over the glow of the marks under it cut a dark
      // ring through the brightest thing on the frame. A rim is a pixel wide;
      // what it separates a point from is the sky, not the marks behind it.
      const ink = scene.palette.outline;
      for (const glyph of scene.glyphs) {
        circle(canvas, paint, glyph, glyph.rim, ink.color, ink.alpha * glyph.alpha);
      }
      for (const glyph of scene.glyphs) drawGlyph(canvas, paint, glyph, scene.palette);
      // Over every mark, including the ones in front of the selected satellite:
      // a ring half hidden behind a passing dot says nothing.
      if (scene.selection) drawSelection(canvas, paint, scene.selection);
    },
    { x: 0, y: 0, width: frame.width, height: frame.height }
  );
}

/**
 * One satellite, over the rims: its halo if it is a landmark, its glow, its
 * tail, its point and the lit centre of it.
 *
 * Drawn a marker at a time rather than a layer at a time, so the sort by range
 * holds — a nearer object's whole shape passes in front of a farther one's. The
 * rims have all gone down already (`record`), so the tail and the point are laid
 * over their own rim and no dark ring is left cutting between a point and its
 * own tail, or through the light around it.
 *
 * The rim is a larger shape *under* the mark rather than a border inside it, so
 * the colour keeps the full diameter — at the few pixels a point is drawn at, a
 * border would leave hardly any colour to see.
 */
function drawGlyph(
  canvas: SkCanvas,
  paint: SkPaint,
  glyph: GlyphShape,
  palette: MarkerPalette
): void {
  if (glyph.halo !== null) {
    glow(canvas, paint, glyph, glyph.halo, palette.halo.color, palette.halo.alpha * glyph.alpha);
  }
  glow(canvas, paint, glyph, glyph.glow.radius, glyph.color, glyph.glow.alpha * glyph.alpha);
  if (glyph.tail) drawTail(canvas, paint, glyph, glyph.tail);
  circle(canvas, paint, glyph, glyph.core, glyph.color, glyph.alpha);
  if (glyph.spark) {
    fill(paint, glyph.spark.color, glyph.spark.alpha * glyph.alpha);
    canvas.drawCircle(glyph.x, glyph.y, glyph.spark.radius, paint);
  }
}

/**
 * Light fading out from a mark's centre to `radius`.
 *
 * The canvas is moved and scaled onto a circle of radius one rather than a
 * gradient made to measure: a shader is a native object, and one per mark per
 * frame is seventy allocations a frame for what is the same gradient every
 * time. So there is one per colour (`fadeShader`), and the canvas does the
 * placing.
 */
function glow(
  canvas: SkCanvas,
  paint: SkPaint,
  glyph: GlyphShape,
  radius: number,
  color: string,
  alpha: number
): void {
  if (!(radius > 0) || !(alpha > 0)) return;
  paint.setStyle(PaintStyle.Fill);
  paint.setShader(fadeShader("glow", color));
  paint.setAlphaf(alpha);
  canvas.save();
  canvas.translate(glyph.x, glyph.y);
  canvas.scale(radius, radius);
  canvas.drawCircle(0, 0, 1, paint);
  canvas.restore();
  paint.setShader(null);
}

/**
 * The comet's tail: the taper, faded from the point to its tip.
 *
 * Placed the way a glow is — one triangle and one gradient, both a unit long,
 * and the canvas turned and stretched onto the tail — for the same reason. The
 * stretch is not uniform, which a stroke would show and a fill does not: the
 * triangle is filled after it is transformed, so its edges are as sharp as any.
 */
function drawTail(canvas: SkCanvas, paint: SkPaint, glyph: GlyphShape, tail: TailShape): void {
  paint.setStyle(PaintStyle.Fill);
  paint.setShader(fadeShader("tail", glyph.color));
  paint.setAlphaf(tail.alpha * glyph.alpha);
  canvas.save();
  canvas.translate(glyph.x, glyph.y);
  canvas.rotate((tail.angle * 180) / Math.PI, 0, 0);
  canvas.scale(tail.length, tail.width / 2);
  canvas.drawPath(unitTail(), paint);
  canvas.restore();
  paint.setShader(null);
}

/**
 * One landmark's path: the wake behind the object, the dashes ahead of it, and
 * the clock minutes on them.
 *
 * Rims first for the whole shape and colour afterwards, rather than rim and
 * colour a piece at a time. An arrowhead sits on the line it belongs to, so drawn
 * in pairs the mark's own rim is laid over the line's colour and every mark
 * cuts a dark notch through the arc it is measuring.
 *
 * The dashes are one path and one draw, however many there are; the wake is a
 * draw per step, since each step has a strength of its own. Its steps are cut
 * square, so they meet end to end — rounded, each join would be two caps laid
 * over each other, and a bead on the line.
 */
function drawPath(
  canvas: SkCanvas,
  paint: SkPaint,
  line: SkPath,
  shape: PathShape,
  palette: MarkerPalette
): void {
  const draw = (runs: number[][], color: string, alpha: number, width: number) => {
    if (runs.length === 0) return;
    trace(line, runs);
    stroke(paint, color, alpha, width);
    canvas.drawPath(line, paint);
  };
  const wake = (color: string, strength: number, width: number) => {
    paint.setStrokeCap(StrokeCap.Butt);
    for (const step of shape.past) draw([step.points], color, strength * step.alpha, width);
    paint.setStrokeCap(StrokeCap.Round);
  };

  const ink = palette.outline;
  wake(ink.color, ink.alpha, shape.pastRimWidth);
  draw(shape.dashes, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  draw(shape.arrows, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  wake(shape.color, 1, shape.pastWidth);
  draw(shape.dashes, shape.color, shape.alpha, shape.width);
  draw(shape.arrows, shape.color, shape.alpha, shape.width);
}

/** The ring that says which satellite the info card is describing. */
function drawSelection(canvas: SkCanvas, paint: SkPaint, ring: SelectionRing): void {
  stroke(paint, ring.rim.color, ring.rim.alpha * ring.alpha, ring.rimWidth);
  canvas.drawCircle(ring.x, ring.y, ring.radius, paint);
  stroke(paint, ring.color, ring.alpha, ring.width);
  canvas.drawCircle(ring.x, ring.y, ring.radius, paint);
}

/**
 * Runs of flat `x, y` pairs into the path this frame is reusing, each its own
 * open stretch: a dash, a step of a wake, an arrowhead.
 */
function trace(path: SkPath, runs: number[][]): void {
  path.rewind();
  for (const points of runs) {
    path.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      path.lineTo(points[index], points[index + 1]);
    }
  }
}

/** One of the scene's circles: a disc, or a band stroked on its own radius. */
function circle(
  canvas: SkCanvas,
  paint: SkPaint,
  glyph: GlyphShape,
  shape: Circle,
  color: string,
  alpha: number
): void {
  if (shape.width === null) fill(paint, color, alpha);
  else stroke(paint, color, alpha, shape.width);
  canvas.drawCircle(glyph.x, glyph.y, shape.radius, paint);
}

function fill(paint: SkPaint, color: string, alpha: number): void {
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(parsed(color));
  paint.setAlphaf(alpha);
}

function stroke(paint: SkPaint, color: string, alpha: number, width: number): void {
  paint.setStyle(PaintStyle.Stroke);
  paint.setColor(parsed(color));
  paint.setAlphaf(alpha);
  paint.setStrokeWidth(width);
}

/**
 * `#rrggbb` as Skia wants it, parsed once per colour rather than per marker.
 *
 * A palette is seven colours — five categories, the rim and the halo — and their
 * lit centres, against several hundred draws a frame, and the fade between the
 * day and night sets has a fixed number of steps (`daylightFractionAt`), so this
 * cannot grow without bound over a long session.
 */
const colors = new Map<string, SkColor>();
function parsed(color: string): SkColor {
  const known = colors.get(color);
  if (known) return known;
  const made = Skia.Color(color);
  colors.set(color, made);
  return made;
}

/**
 * A colour faded out along a unit of distance, as a shader: along `+x` from
 * nought to one for a tail, and out from the origin to radius one for a glow.
 *
 * Built once per kind and colour, bounded for the reason `parsed` is. The fade
 * itself is the scene's (`TAIL_FADE`, `GLOW_FADE`); the paint's own alpha is
 * what scales it for the mark being drawn.
 */
const shaders = new Map<string, SkShader>();
function fadeShader(kind: "tail" | "glow", color: string): SkShader {
  const key = `${kind}:${color}`;
  const known = shaders.get(key);
  if (known) return known;

  const stops = kind === "tail" ? TAIL_FADE : GLOW_FADE;
  const base = parsed(color);
  const ramp = stops.map((stop) =>
    Float32Array.of(base[0], base[1], base[2], base[3] * stop.strength)
  );
  const offsets = stops.map((stop) => stop.at);
  const origin = Skia.Point(0, 0);
  const made =
    kind === "tail"
      ? Skia.Shader.MakeLinearGradient(origin, Skia.Point(1, 0), ramp, offsets, TileMode.Clamp)
      : Skia.Shader.MakeRadialGradient(origin, 1, ramp, offsets, TileMode.Clamp);
  shaders.set(key, made);
  return made;
}

/**
 * The tail's taper at unit size: the tip at `(1, 0)`, the head across the
 * origin from `(0, -1)` to `(0, 1)`. Made on first use, once Skia is set up.
 */
let unitTailPath: SkPath | null = null;
function unitTail(): SkPath {
  if (unitTailPath) return unitTailPath;
  const path = Skia.Path.Make();
  path.moveTo(1, 0);
  path.lineTo(0, 1);
  path.lineTo(0, -1);
  path.close();
  unitTailPath = path;
  return path;
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
