import React from "react";
import { StyleSheet } from "react-native";
import { MarkerSource, useMarkerFrames } from "../hooks/useAnimatedMarkers";
import { MarkerLabels } from "./MarkerLabels";
import { FrameSize } from "./markerGeometry";
import {
  buildMarkerScene,
  Circle,
  GlyphShape,
  MarkerScene,
  SelectionRing,
  TailShape
} from "./markerScene";
import { Ink, MarkerPalette } from "./palette";
import {
  PaintStyle,
  Skia,
  SkiaPictureView,
  StrokeCap,
  StrokeJoin,
  createPicture
} from "./skia";
import type { SkCanvas, SkColor, SkPaint, SkPath, SkPicture } from "./skia";

type Props = {
  /** The drawn frames, as a subscription. See `MarkerSource`. */
  markers: MarkerSource;
  /** The box the markers are drawn over. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Night or daylight, and the crossfade between them. See `palette.ts`. */
  palette: MarkerPalette;
  /** The satellite being read about, ringed on the frame. See `SelectionRing`. */
  selectedName?: string | null;
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
 */
export const SatelliteMarkers: React.FC<Props> = ({
  markers,
  frame,
  palette,
  selectedName = null
}) => {
  const drawn = useMarkerFrames(markers);
  if (!frame) return null;

  const scene = buildMarkerScene(drawn, frame, palette, selectedName);
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
};

/** The scene as a display list, ready for the view to replay. */
function record(scene: MarkerScene, frame: FrameSize): SkPicture {
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      // Round, so the rim stroked around a tail follows it to the tip instead
      // of running two edges out to the spike where they would have met.
      paint.setStrokeJoin(StrokeJoin.Round);
      paint.setStrokeCap(StrokeCap.Round);

      // One path, rewound per marker: a tail is three points, and allocating a
      // native object for each of seventy of them every frame is the kind of
      // cost this whole arrangement exists to avoid.
      const tail = Skia.Path.Make();
      for (const glyph of scene.glyphs) drawGlyph(canvas, paint, tail, glyph, scene.palette);
      // Over every mark, including the ones in front of the selected satellite:
      // a ring half hidden behind a passing dot says nothing.
      if (scene.selection) drawSelection(canvas, paint, scene.selection);
    },
    { x: 0, y: 0, width: frame.width, height: frame.height }
  );
}

/**
 * One satellite: its halo if it is a landmark, its tail, its rim and its mark.
 *
 * Drawn a marker at a time rather than a layer at a time, so the sort by range
 * holds — a nearer object's whole shape passes in front of a farther one's. The
 * order within a marker is what joins the tail to the body: the rim goes down
 * first, in both shapes, and the two coloured shapes are laid over it
 * afterwards, so no dark ring is left cutting between a body and its own tail.
 *
 * The rim is a larger shape *under* the mark rather than a border inside it, so
 * the colour keeps the full diameter. Drawn as a border it ate the middle of
 * the marker instead, and at the eight pixels the geostationary belt is drawn
 * at there was hardly any colour left to see.
 */
function drawGlyph(
  canvas: SkCanvas,
  paint: SkPaint,
  tail: SkPath,
  glyph: GlyphShape,
  palette: MarkerPalette
): void {
  if (glyph.halo !== null) {
    fill(paint, palette.halo.color, palette.halo.alpha * glyph.alpha);
    canvas.drawCircle(glyph.x, glyph.y, glyph.halo, paint);
  }

  if (glyph.tail) {
    trace(tail, glyph.tail);
    rim(canvas, paint, tail, glyph.tail, palette.outline, glyph.alpha);
  }

  circle(canvas, paint, glyph, glyph.rim, palette.outline.color, palette.outline.alpha * glyph.alpha);

  if (glyph.tail) {
    fill(paint, glyph.color, glyph.alpha);
    canvas.drawPath(tail, paint);
  }
  circle(canvas, paint, glyph, glyph.core, glyph.color, glyph.alpha);
}

/** The ring that says which satellite the info card is describing. */
function drawSelection(canvas: SkCanvas, paint: SkPaint, ring: SelectionRing): void {
  stroke(paint, ring.rim.color, ring.rim.alpha * ring.alpha, ring.rimWidth);
  canvas.drawCircle(ring.x, ring.y, ring.radius, paint);
  stroke(paint, ring.color, ring.alpha, ring.width);
  canvas.drawCircle(ring.x, ring.y, ring.radius, paint);
}

/** The tail's polygon, into the path this frame is reusing. */
function trace(path: SkPath, shape: TailShape): void {
  path.rewind();
  path.moveTo(shape.points[0], shape.points[1]);
  for (let index = 2; index < shape.points.length; index += 2) {
    path.lineTo(shape.points[index], shape.points[index + 1]);
  }
  path.close();
}

/**
 * The dark shape under a tail: the same polygon filled and stroked.
 *
 * Two draws rather than one because Skia's paint styles here are fill or
 * stroke and not both, and a stroke on its own would leave the middle of a
 * shape only a couple of pixels wide unpainted.
 */
function rim(
  canvas: SkCanvas,
  paint: SkPaint,
  path: SkPath,
  shape: TailShape,
  ink: Ink,
  alpha: number
): void {
  fill(paint, ink.color, ink.alpha * alpha);
  canvas.drawPath(path, paint);
  stroke(paint, ink.color, ink.alpha * alpha, shape.rimWidth);
  canvas.drawPath(path, paint);
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
 * A palette is seven colours — five categories, the rim and the halo — against
 * several hundred draws a frame, and the fade between the day and night sets
 * has a fixed number of steps (`daylightFractionAt`), so this cannot grow
 * without bound over a long session.
 */
const colors = new Map<string, SkColor>();
function parsed(color: string): SkColor {
  const known = colors.get(color);
  if (known) return known;
  const made = Skia.Color(color);
  colors.set(color, made);
  return made;
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
