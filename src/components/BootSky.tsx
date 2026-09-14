import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import {
  BootSkyScene,
  bootSkyScene,
  passPose,
  SkyLight,
  SkyPass,
  SkyPose,
  skyMoment,
  skyPass,
  STAR_COLOR,
  starAlpha
} from "./bootSky";
import { fadeShader, RadialFade, skiaColor } from "./lightShaders";
import { FrameSize } from "./markerGeometry";
import {
  PaintStyle,
  Skia,
  SkiaPictureView,
  StrokeCap,
  StrokeJoin,
  TileMode,
  createPicture
} from "./skia";
import type { SkCanvas, SkPaint, SkPath, SkPicture, SkShader } from "./skia";

type Props = {
  /** The box the sky fills. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Whether the satellite is moving. Stopped, it says start-up has. */
  turning: boolean;
};

/**
 * The boot screen's sky, on the phone.
 *
 * One drawing node, redrawn every display frame — the same arrangement as
 * `SatelliteMarkers` and for the same reasons, though the pressure here is
 * nothing like the overlay's: one light rather than several hundred shapes.
 * Everything native is made as rarely as it can be: the night's two gradients
 * once per frame size, the tail's outline once per pass, and the light's fades
 * are the overlay's own shaders (`fadeShader`), so the satellite on this screen
 * is drawn with exactly the gradients the satellites on the sky are.
 *
 * What is drawn is decided in `bootSky`, which is where the composition lives
 * and where the tests read it from.
 */
export const BootSky: React.FC<Props> = ({ frame, turning }) => {
  const elapsed = useElapsedSeconds(turning);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);
  const night = useMemo(() => (scene ? nightShaders(scene) : null), [scene]);
  const moment = skyMoment(elapsed);
  const pass = useMemo(
    () => (scene ? skyPass(scene, moment.index) : null),
    [scene, moment.index]
  );
  const tail = useMemo(() => (pass ? tailPath(pass.light) : null), [pass]);

  if (!frame || !scene || !night || !pass || !tail) return null;

  return (
    <SkiaPictureView
      picture={record(scene, night, pass, tail, passPose(pass, moment.progress), elapsed)}
      style={[styles.canvas, frame]}
      pointerEvents="none"
    />
  );
};

type NightShaders = { grade: SkShader; horizon: SkShader };

/** The night's gradients for a frame, which outlive every frame drawn on it. */
function nightShaders(scene: BootSkyScene): NightShaders {
  const { night } = scene;
  const { horizon } = night;
  const breath = skiaColor(horizon.color);
  return {
    grade: Skia.Shader.MakeLinearGradient(
      Skia.Point(0, night.fromY),
      Skia.Point(0, night.toY),
      night.stops.map((stop) => skiaColor(stop.color)),
      night.stops.map((stop) => stop.offset),
      TileMode.Clamp
    ),
    horizon: Skia.Shader.MakeRadialGradient(
      Skia.Point(horizon.x, horizon.y),
      horizon.radius,
      [
        Float32Array.of(breath[0], breath[1], breath[2], horizon.alpha),
        Float32Array.of(breath[0], breath[1], breath[2], 0)
      ],
      [0, 1],
      TileMode.Clamp
    )
  };
}

/** Where the tail is drawn from, and how long it is, for the canvas to place it. */
type TailPlacement = { path: SkPath; angleDeg: number; length: number };

/**
 * The tail's runs in their own unit frame: the head at the origin and the tip
 * at `(1, 0)`, which is the frame the overlay's tail shader fades along. The
 * canvas is turned and scaled onto the tail rather than a gradient made to
 * measure — see `SatelliteMarkers`'s `drawTail`, which places a trail the same
 * way.
 */
function tailPath(light: SkyLight): TailPlacement {
  const { tail } = light;
  const dx = tail.tipX - light.x;
  const dy = tail.tipY - light.y;
  const length = Math.hypot(dx, dy);
  const cos = dx / length;
  const sin = dy / length;
  const path = Skia.Path.Make();
  for (const run of tail.runs) {
    for (let index = 0; index < run.length; index += 2) {
      const x = run[index] - light.x;
      const y = run[index + 1] - light.y;
      const alongX = (x * cos + y * sin) / length;
      const alongY = (y * cos - x * sin) / length;
      if (index === 0) path.moveTo(alongX, alongY);
      else path.lineTo(alongX, alongY);
    }
  }
  return { path, angleDeg: Math.atan2(dy, dx) * (180 / Math.PI), length };
}

/** The sky as a display list, ready for the view to replay. */
function record(
  scene: BootSkyScene,
  night: NightShaders,
  pass: SkyPass,
  tail: TailPlacement,
  pose: SkyPose,
  elapsed: number
): SkPicture {
  const { frame } = scene;
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(PaintStyle.Fill);
      const whole = { x: 0, y: 0, width: frame.width, height: frame.height };
      paint.setShader(night.grade);
      canvas.drawRect(whole, paint);
      paint.setShader(night.horizon);
      canvas.drawRect(whole, paint);

      paint.setShader(null);
      paint.setColor(skiaColor(STAR_COLOR));
      for (const star of scene.stars) {
        paint.setAlphaf(starAlpha(star, elapsed));
        canvas.drawCircle(star.x, star.y, star.radius, paint);
      }

      if (!(pose.alpha > 0)) return;
      const { light } = pass;
      // The light keeps its shape along the arc, so it is the canvas that turns
      // rather than the geometry that is rebuilt.
      canvas.save();
      canvas.rotate(pose.angleDeg, pass.cx, pass.cy);
      glow(canvas, paint, light, light.bloom.radius, "bloom", light.bloomColor, light.bloom.alpha * pose.alpha);
      glow(canvas, paint, light, light.glow.radius, "glow", light.color, light.glow.alpha * pose.alpha);

      paint.setShader(fadeShader("tail", light.color));
      paint.setAlphaf(light.tail.alpha * pose.alpha);
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
      paint.setStrokeWidth(light.tail.width / tail.length);
      canvas.save();
      canvas.translate(light.x, light.y);
      canvas.rotate(tail.angleDeg, 0, 0);
      canvas.scale(tail.length, tail.length);
      canvas.drawPath(tail.path, paint);
      canvas.restore();
      paint.setStyle(PaintStyle.Fill);

      glow(canvas, paint, light, light.coreRadius, "core", light.color, pose.alpha);
      canvas.restore();
    },
    { x: 0, y: 0, width: frame.width, height: frame.height }
  );
}

/** Light fading out from the light's centre to `radius`, placed by the canvas. */
function glow(
  canvas: SkCanvas,
  paint: SkPaint,
  light: SkyLight,
  radius: number,
  kind: RadialFade,
  color: string,
  alpha: number
): void {
  if (!(radius > 0) || !(alpha > 0)) return;
  paint.setShader(fadeShader(kind, color));
  paint.setAlphaf(alpha);
  canvas.save();
  canvas.translate(light.x, light.y);
  canvas.scale(radius, radius);
  canvas.drawCircle(0, 0, 1, paint);
  canvas.restore();
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
