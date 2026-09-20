import React, { useLayoutEffect, useMemo, useRef } from "react";
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
import { cssColor, Ink } from "./palette";

type Props = {
  /** The world and the whole orbit: rebuilt on a tap, not on a frame. */
  backdrop: GroundTrackBackdrop;
  /** Where the satellite is now: rebuilt on every animation frame. */
  moment: GroundTrackMoment;
  /** The satellite's own colour: its category's, as the sky draws it. */
  color: string;
};

/**
 * The ground-track map in the replay harness: the same scene, on a 2D canvas.
 *
 * The phone draws it with Skia (`GroundTrackCanvas.tsx`); this is that file's
 * browser sibling, and the split is `SatelliteMarkers`'s for the same reasons.
 * What is drawn is decided in `groundTrackScene`, and both backends only stroke
 * runs of points, fill closed ones and clip to the box.
 *
 * The coastline is held as a `Path2D` and the world is *not* rebuilt per frame:
 * 2,400 points of it would otherwise be walked sixty times a second so a dot
 * could move two pixels. It is rebuilt when the card is opened on another
 * object or the box is laid out again, which is what the memo is keyed on.
 */
export const GroundTrackCanvas: React.FC<Props> = ({ backdrop, moment, color }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { box } = backdrop;

  // The fixed half of the picture, as paths the browser has already parsed.
  const fixed = useMemo(
    () => ({
      land: pathOf(backdrop.land, true),
      graticule: pathOf(backdrop.graticule, false),
      equator: pathOf([backdrop.equator], false),
      track: pathOf(backdrop.track, false)
    }),
    [backdrop]
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Backing pixels rather than layout pixels, or the coastline is drawn soft
    // on every display the harness is looked at on.
    const density = window.devicePixelRatio || 1;
    const width = Math.round(box.width * density);
    const height = Math.round(box.height * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.save();
    // Everything is drawn inside the map: a footprint over the Pacific is
    // drawn again either side of the date line, and this is what cuts the
    // copies off at the edges. See `repeated`.
    context.beginPath();
    context.rect(0, 0, box.width, box.height);
    context.clip();
    draw(context, backdrop, fixed, moment, color);
    context.restore();
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: box.width,
        height: box.height,
        pointerEvents: "none"
      }}
    />
  );
};

type FixedPaths = {
  land: Path2D;
  graticule: Path2D;
  equator: Path2D;
  track: Path2D;
};

function draw(
  context: CanvasRenderingContext2D,
  backdrop: GroundTrackBackdrop,
  fixed: FixedPaths,
  moment: GroundTrackMoment,
  color: string
): void {
  const { box } = backdrop;
  context.lineJoin = "round";
  context.lineCap = "round";

  context.fillStyle = cssColor(MAP_INK.sea);
  context.fillRect(0, 0, box.width, box.height);

  // Even-odd, so the one ring that sits inside another comes out as water
  // rather than as land drawn twice.
  context.fillStyle = cssColor(MAP_INK.land);
  context.fill(fixed.land, "evenodd");
  context.strokeStyle = cssColor(MAP_INK.coast);
  context.lineWidth = LINE_WIDTH.coast;
  context.stroke(fixed.land);

  context.strokeStyle = cssColor(MAP_INK.graticule);
  context.lineWidth = LINE_WIDTH.graticule;
  context.stroke(fixed.graticule);
  context.strokeStyle = cssColor(MAP_INK.equator);
  context.stroke(fixed.equator);

  // The footprint under the track: it is the largest shape on the map and the
  // one thing here that is a region rather than a line.
  context.fillStyle = cssColor(tint(color, TRACK_ALPHA.footprintFill));
  context.fill(pathOf(moment.footprint, true));
  context.strokeStyle = cssColor(tint(color, TRACK_ALPHA.footprintEdge));
  context.lineWidth = LINE_WIDTH.footprint;
  context.stroke(pathOf(moment.footprintEdge, false));

  context.strokeStyle = cssColor(tint(color, TRACK_ALPHA.track));
  context.lineWidth = LINE_WIDTH.track;
  context.stroke(fixed.track);

  context.strokeStyle = cssColor(tint(color, TRACK_ALPHA.wake));
  context.lineWidth = LINE_WIDTH.wake;
  context.stroke(pathOf(moment.wake, false));

  // Where the phone is, over the orbit and under the satellite: a small ring
  // rather than a dot, so it cannot be mistaken for the moving mark.
  if (backdrop.observer) {
    const [x, y] = backdrop.observer;
    context.strokeStyle = cssColor(MAP_INK.observer);
    context.lineWidth = LINE_WIDTH.observer;
    context.beginPath();
    context.arc(x, y, OBSERVER_RADIUS, 0, 2 * Math.PI);
    context.stroke();
  }

  const [satelliteX, satelliteY] = moment.satellite;
  context.fillStyle = cssColor({ color, alpha: 1 });
  context.beginPath();
  context.arc(satelliteX, satelliteY, DOT_RADIUS, 0, 2 * Math.PI);
  context.fill();
}

/** A run of polylines as one path, closed where they are shapes to fill. */
function pathOf(lines: readonly Polyline[], close: boolean): Path2D {
  const path = new Path2D();
  for (const line of lines) {
    if (line.length === 0) continue;
    path.moveTo(line[0][0], line[0][1]);
    for (let at = 1; at < line.length; at += 1) path.lineTo(line[at][0], line[at][1]);
    if (close) path.closePath();
  }
  return path;
}

/** The satellite's colour at one of the track's weights. See `TRACK_ALPHA`. */
function tint(color: string, alpha: number): Ink {
  return { color, alpha };
}
