import React, { useEffect, useMemo, useRef } from "react";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { BootSkyScene, bootSkyScene, skyAngleDeg, STAR_COLOR } from "./bootSky";
import { FrameSize } from "./markerGeometry";

type Props = {
  /** The box the sky fills. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Whether the satellites are turning. Stopped, they say start-up has. */
  turning: boolean;
};

/**
 * The boot screen's sky in the replay harness: the same scene, on a 2D canvas.
 *
 * The phone draws it with Skia (`BootSky.tsx`) because that is the only
 * single-node canvas React Native has; a browser already has one. What both
 * draw is decided in `bootSky`, and neither knows anything about the
 * composition beyond how to fill a polygon and a circle.
 */
export const BootSky: React.FC<Props> = ({ frame, turning }) => {
  const elapsed = useElapsedSeconds(turning);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !frame) return;
    // Backing pixels rather than layout pixels, or the sky is drawn soft on
    // every display the harness is actually looked at on.
    const density = window.devicePixelRatio || 1;
    const width = Math.round(frame.width * density);
    const height = Math.round(frame.height * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    draw(context, scene, frame, elapsed);
  });

  if (!frame) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", left: 0, top: 0, width: frame.width, height: frame.height }}
    />
  );
};

function draw(
  context: CanvasRenderingContext2D,
  scene: BootSkyScene,
  frame: FrameSize,
  elapsed: number
): void {
  const glow = context.createRadialGradient(
    scene.glow.x,
    scene.glow.y,
    0,
    scene.glow.x,
    scene.glow.y,
    scene.glow.radius
  );
  for (const stop of scene.glow.stops) glow.addColorStop(stop.offset, stop.color);
  context.globalAlpha = 1;
  context.fillStyle = glow;
  context.fillRect(0, 0, frame.width, frame.height);

  context.fillStyle = STAR_COLOR;
  for (const star of scene.stars) {
    context.globalAlpha = star.alpha;
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, TWO_PI);
    context.fill();
  }

  context.globalAlpha = 1;
  for (const satellite of scene.satellites) {
    context.fillStyle = satellite.color;
    // The shape keeps its form as it goes round, so it is the canvas that
    // turns rather than the geometry that is rebuilt.
    context.save();
    context.translate(satellite.cx, satellite.cy);
    context.rotate(skyAngleDeg(satellite, elapsed) * (Math.PI / 180));
    context.translate(-satellite.cx, -satellite.cy);

    const trail = satellite.trail;
    context.beginPath();
    context.moveTo(trail[0], trail[1]);
    for (let index = 2; index < trail.length; index += 2) {
      context.lineTo(trail[index], trail[index + 1]);
    }
    context.closePath();
    context.fill();

    context.beginPath();
    context.arc(satellite.bodyX, satellite.bodyY, satellite.bodyRadius, 0, TWO_PI);
    context.fill();
    context.restore();
  }
}

const TWO_PI = Math.PI * 2;
