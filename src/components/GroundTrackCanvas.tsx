import React, { useMemo } from "react";
import {
  DOT_RADIUS,
  GroundTrackBackdrop,
  GroundTrackMoment,
  LINE_WIDTH,
  MAP_INK,
  OBSERVER_RADIUS,
  Polyline,
  TRACK_ALPHA
} from "./groundTrackScene";
import { skiaColor } from "./lightShaders";
import { Ink } from "./palette";
import {
  ClipOp,
  FillType,
  PaintStyle,
  Skia,
  SkiaPictureView,
  StrokeJoin,
  createPicture
} from "./skia";
import type { SkPaint, SkPath, SkPicture } from "./skia";

type Props = {
  /** The world and the whole orbit: rebuilt on a tap, not on a frame. */
  backdrop: GroundTrackBackdrop;
  /** Where the satellite is now: rebuilt on every animation frame. */
  moment: GroundTrackMoment;
  /** The satellite's own colour: its category's, as the sky draws it. */
  color: string;
};

/**
 * The ground-track map on the phone: one Skia picture, redrawn per frame.
 *
 * The overlay's argument, at a twentieth of the size (`SatelliteMarkers`): a
 * map is a coastline, a graticule and an orbit, which as views would be a few
 * hundred of them all changing at once, and as one drawing node is one native
 * view and one draw.
 *
 * **The world is built once and drawn every frame.** Recording is calls across
 * JSI, and that is what a frame costs here rather than the drawing itself —
 * 2,400 points of coastline walked sixty times a second is thousands of calls
 * for a dot that moved two pixels. So the fixed half of the picture is held as
 * `SkPath`s built when the card is opened, and a frame is a handful of
 * `drawPath` calls plus the shapes that actually moved.
 */
export const GroundTrackCanvas: React.FC<Props> = ({ backdrop, moment, color }) => {
  const { box } = backdrop;

  // The fixed half of the picture, as paths Skia has already been given.
  const fixed = useMemo(
    () => ({
      land: pathOf(backdrop.land, true),
      graticule: pathOf(backdrop.graticule, false),
      equator: pathOf([backdrop.equator], false),
      track: pathOf(backdrop.track, false)
    }),
    [backdrop]
  );

  return (
    <SkiaPictureView
      picture={record(backdrop, fixed, moment, color)}
      style={box}
      pointerEvents="none"
    />
  );
};

type FixedPaths = {
  land: SkPath;
  graticule: SkPath;
  equator: SkPath;
  track: SkPath;
};

/** The map as a display list, ready for the view to replay. */
function record(
  backdrop: GroundTrackBackdrop,
  fixed: FixedPaths,
  moment: GroundTrackMoment,
  color: string
): SkPicture {
  const { box } = backdrop;
  const bounds = { x: 0, y: 0, width: box.width, height: box.height };

  return createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setStrokeJoin(StrokeJoin.Round);

    // Everything is drawn inside the map: a footprint over the Pacific is
    // drawn again either side of the date line, and this is what cuts the
    // copies off at the edges. See `repeated`.
    canvas.clipRect(Skia.XYWHRect(0, 0, box.width, box.height), ClipOp.Intersect, true);

    fill(paint, MAP_INK.sea);
    canvas.drawRect(Skia.XYWHRect(0, 0, box.width, box.height), paint);

    fill(paint, MAP_INK.land);
    canvas.drawPath(fixed.land, paint);
    stroke(paint, MAP_INK.coast, LINE_WIDTH.coast);
    canvas.drawPath(fixed.land, paint);

    stroke(paint, MAP_INK.graticule, LINE_WIDTH.graticule);
    canvas.drawPath(fixed.graticule, paint);
    stroke(paint, MAP_INK.equator, LINE_WIDTH.graticule);
    canvas.drawPath(fixed.equator, paint);

    // The footprint under the track: it is the largest shape on the map and
    // the one thing here that is a region rather than a line.
    fill(paint, { color, alpha: TRACK_ALPHA.footprintFill });
    canvas.drawPath(pathOf(moment.footprint, true), paint);
    stroke(paint, { color, alpha: TRACK_ALPHA.footprintEdge }, LINE_WIDTH.footprint);
    canvas.drawPath(pathOf(moment.footprintEdge, false), paint);

    stroke(paint, { color, alpha: TRACK_ALPHA.track }, LINE_WIDTH.track);
    canvas.drawPath(fixed.track, paint);

    stroke(paint, { color, alpha: TRACK_ALPHA.wake }, LINE_WIDTH.wake);
    canvas.drawPath(pathOf(moment.wake, false), paint);

    // Where the phone is, over the orbit and under the satellite: a small ring
    // rather than a dot, so it cannot be mistaken for the moving mark.
    if (backdrop.observer) {
      stroke(paint, MAP_INK.observer, LINE_WIDTH.observer);
      canvas.drawCircle(backdrop.observer[0], backdrop.observer[1], OBSERVER_RADIUS, paint);
    }

    fill(paint, { color, alpha: 1 });
    canvas.drawCircle(moment.satellite[0], moment.satellite[1], DOT_RADIUS, paint);
  }, bounds);
}

function fill(paint: SkPaint, ink: Ink): void {
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(skiaColor(ink.color));
  paint.setAlphaf(ink.alpha);
}

function stroke(paint: SkPaint, ink: Ink, width: number): void {
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setColor(skiaColor(ink.color));
  paint.setAlphaf(ink.alpha);
}

/** A run of polylines as one path, closed where they are shapes to fill. */
function pathOf(lines: readonly Polyline[], close: boolean): SkPath {
  const path = Skia.Path.Make();
  // Even-odd, so the one ring that sits inside another comes out as water
  // rather than as land drawn twice.
  path.setFillType(FillType.EvenOdd);
  for (const line of lines) {
    if (line.length === 0) continue;
    path.moveTo(line[0][0], line[0][1]);
    for (let at = 1; at < line.length; at += 1) path.lineTo(line[at][0], line[at][1]);
    if (close) path.close();
  }
  return path;
}
