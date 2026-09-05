import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import {
  BootSkyScene,
  bootSkyScene,
  skyAngleDeg,
  SkySatellite,
  STAR_COLOR
} from "./bootSky";
import { FrameSize } from "./markerGeometry";
import {
  PaintStyle,
  Skia,
  SkiaPictureView,
  TileMode,
  createPicture
} from "./skia";
import type { SkCanvas, SkPaint, SkPath, SkPicture } from "./skia";

type Props = {
  /** The box the sky fills. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Whether the satellites are turning. Stopped, they say start-up has. */
  turning: boolean;
};

/**
 * The boot screen's sky, on the phone.
 *
 * One drawing node, redrawn every display frame — the same arrangement as
 * `SatelliteMarkers` and for the same reasons, though the pressure here is
 * nothing like the overlay's: five shapes rather than several hundred, and the
 * shapes themselves never change. Only the angle each one is turned to does,
 * so the paths are built once for a frame size and the picture is re-recorded
 * around them.
 *
 * What is drawn is decided in `bootSky`, which is where the composition lives
 * and where the tests read it from. This file only fills a polygon and a
 * circle.
 */
export const BootSky: React.FC<Props> = ({ frame, turning }) => {
  const elapsed = useElapsedSeconds(turning);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);
  const trails = useMemo(() => scene?.satellites.map(trailPath) ?? [], [scene]);

  if (!frame || !scene) return null;

  return (
    <SkiaPictureView
      picture={record(scene, trails, frame, elapsed)}
      style={[styles.canvas, frame]}
      pointerEvents="none"
    />
  );
};

/** One satellite's trail as a path, which outlives the frames it is drawn on. */
function trailPath(satellite: SkySatellite): SkPath {
  const path = Skia.Path.Make();
  const points = satellite.trail;
  path.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) {
    path.lineTo(points[index], points[index + 1]);
  }
  path.close();
  return path;
}

/** The sky as a display list, ready for the view to replay. */
function record(
  scene: BootSkyScene,
  trails: SkPath[],
  frame: FrameSize,
  elapsed: number
): SkPicture {
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      drawGlow(canvas, paint, scene, frame);

      paint.setStyle(PaintStyle.Fill);
      paint.setShader(null);
      paint.setColor(Skia.Color(STAR_COLOR));
      for (const star of scene.stars) {
        paint.setAlphaf(star.alpha);
        canvas.drawCircle(star.x, star.y, star.radius, paint);
      }

      paint.setAlphaf(1);
      scene.satellites.forEach((satellite, index) => {
        paint.setColor(Skia.Color(satellite.color));
        // The shape keeps its form as it goes round, so it is the canvas that
        // turns rather than the geometry that is rebuilt.
        canvas.save();
        canvas.rotate(skyAngleDeg(satellite, elapsed), satellite.cx, satellite.cy);
        canvas.drawPath(trails[index], paint);
        canvas.drawCircle(satellite.bodyX, satellite.bodyY, satellite.bodyRadius, paint);
        canvas.restore();
      });
    },
    { x: 0, y: 0, width: frame.width, height: frame.height }
  );
}

/** The wash of colour behind everything: a night sky is not one flat colour. */
function drawGlow(
  canvas: SkCanvas,
  paint: SkPaint,
  scene: BootSkyScene,
  frame: FrameSize
): void {
  paint.setStyle(PaintStyle.Fill);
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      Skia.Point(scene.glow.x, scene.glow.y),
      scene.glow.radius,
      scene.glow.stops.map((stop) => Skia.Color(stop.color)),
      scene.glow.stops.map((stop) => stop.offset),
      TileMode.Clamp
    )
  );
  canvas.drawRect({ x: 0, y: 0, width: frame.width, height: frame.height }, paint);
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
