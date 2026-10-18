import React, { useEffect, useMemo, useRef } from "react";
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
import type { FrameSize } from "./markerGeometry";
import { cssColor } from "./palette";

type Props = {
  frame: FrameSize | null;
  turning: boolean;
  /** Clear the mark behind a failure card so it cannot compete with the reason. */
  showLogo?: boolean;
};

/** The same paths and placement as iPhone, rendered on a browser canvas. */
export const BootSky: React.FC<Props> = ({ frame, turning, showLogo = true }) => {
  const elapsed = useElapsedSeconds(turning);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);
  const paths = useMemo(() => typeof Path2D === "undefined" ? [] :
    ORBITAL_LOGO.paths.map((svg) => new Path2D(svg)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !frame) return;
    const density = window.devicePixelRatio || 1;
    const width = Math.round(frame.width * density);
    const height = Math.round(frame.height * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    draw(context, scene, paths, elapsed, showLogo);
  });

  if (!frame) return null;
  return <canvas ref={canvasRef} aria-hidden="true"
    style={{ position: "absolute", left: 0, top: 0, width: frame.width, height: frame.height }} />;
};

function draw(
  context: CanvasRenderingContext2D,
  scene: BootSkyScene,
  paths: readonly Path2D[],
  elapsed: number,
  showLogo: boolean
): void {
  const { frame, night } = scene;
  const grade = context.createLinearGradient(0, night.fromY, 0, night.toY);
  for (const stop of night.stops) grade.addColorStop(stop.offset, stop.color);
  context.globalAlpha = 1;
  context.fillStyle = grade;
  context.fillRect(0, 0, frame.width, frame.height);

  const { horizon } = night;
  const breath = context.createRadialGradient(horizon.x, horizon.y, 0, horizon.x, horizon.y, horizon.radius);
  breath.addColorStop(0, cssColor({ color: horizon.color, alpha: horizon.alpha }));
  breath.addColorStop(1, cssColor({ color: horizon.color, alpha: 0 }));
  context.fillStyle = breath;
  context.fillRect(0, 0, frame.width, frame.height);

  context.fillStyle = STAR_COLOR;
  for (const star of scene.stars) {
    context.globalAlpha = starAlpha(star, elapsed);
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, TWO_PI);
    context.fill();
  }

  if (!showLogo) return;
  const logo = bootLogo(frame);
  context.save();
  context.translate(logo.x, logo.y);
  context.scale(logo.scale, logo.scale);
  context.globalAlpha = 1;
  context.fillStyle = ORBITAL_LOGO.color;
  for (const path of paths) context.fill(path);
  context.fillStyle = ORBITAL_LOGO.accent;
  context.beginPath();
  context.arc(ORBITAL_LOGO.dot.x, ORBITAL_LOGO.dot.y, logoDotRadius(elapsed), 0, TWO_PI);
  context.fill();
  context.restore();
}

const TWO_PI = Math.PI * 2;
