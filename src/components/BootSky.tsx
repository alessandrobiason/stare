import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import {
  BootSkyScene,
  bootLogo,
  bootSkyScene,
  logoDotRadius,
  ORBITAL_LOGO,
  STAR_COLOR,
  starAlpha
} from "./bootSky";
import { skiaColor } from "./lightShaders";
import type { FrameSize } from "./markerGeometry";
import { PaintStyle, Skia, SkiaPictureView, TileMode, createPicture } from "./skia";
import type { SkPath, SkPicture, SkShader } from "./skia";

type Props = {
  frame: FrameSize | null;
  turning: boolean;
  /** Clear the mark behind a failure card so it cannot compete with the reason. */
  showLogo?: boolean;
};

/** The shared S orbitale mark and night sky, drawn in one native node. */
export const BootSky: React.FC<Props> = ({ frame, turning, showLogo = true }) => {
  const elapsed = useElapsedSeconds(turning);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);
  const night = useMemo(() => (scene ? nightShaders(scene) : null), [scene]);
  const paths = useMemo(() => ORBITAL_LOGO.paths.map((svg) => {
    const path = Skia.Path.MakeFromSVGString(svg);
    if (!path) throw new Error("Invalid orbital logo path");
    return path;
  }), []);

  if (!frame || !scene || !night) return null;
  return (
    <SkiaPictureView
      picture={record(scene, night, paths, elapsed, showLogo)}
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

/** Reuse vector paths and shaders while the dot breathes and stars twinkle. */
function record(
  scene: BootSkyScene,
  night: NightShaders,
  paths: readonly SkPath[],
  elapsed: number,
  showLogo: boolean
): SkPicture {
  const { frame } = scene;
  return createPicture((canvas) => {
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

    if (!showLogo) return;
    const logo = bootLogo(frame);
    canvas.save();
    canvas.translate(logo.x, logo.y);
    canvas.scale(logo.scale, logo.scale);
    paint.setAlphaf(1);
    paint.setColor(skiaColor(ORBITAL_LOGO.color));
    for (const path of paths) canvas.drawPath(path, paint);
    paint.setColor(skiaColor(ORBITAL_LOGO.accent));
    canvas.drawCircle(ORBITAL_LOGO.dot.x, ORBITAL_LOGO.dot.y, logoDotRadius(elapsed), paint);
    canvas.restore();
  }, { x: 0, y: 0, width: frame.width, height: frame.height });
}

const styles = StyleSheet.create({
  canvas: { position: "absolute", left: 0, top: 0 }
});
