import React, { useEffect, useMemo, useRef } from "react";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import {
  BootSkyScene,
  bootSkyScene,
  passPose,
  SkyPass,
  SkyPose,
  skyMoment,
  skyPass,
  STAR_COLOR,
  starAlpha
} from "./bootSky";
import { FrameSize } from "./markerGeometry";
import { BLOOM_FADE, COMET_FADE, CORE_FADE, FadeStop, GLOW_FADE } from "./markerScene";
import { cssColor } from "./palette";

type Props = {
  /** The box the sky fills. Geometry is pixels, not percent. */
  frame: FrameSize | null;
  /** Whether the satellite is moving. Stopped, it says start-up has. */
  turning: boolean;
};

/**
 * The boot screen's sky in the replay harness: the same scene, on a 2D canvas.
 *
 * The phone draws it with Skia (`BootSky.tsx`) because that is the only
 * single-node canvas React Native has; a browser already has one. What both
 * draw is decided in `bootSky`, and neither knows anything about the
 * composition beyond how to fade a circle and a polygon.
 */
export const BootSky: React.FC<Props> = ({ frame, turning }) => {
  const elapsed = useElapsedSeconds(turning);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = useMemo(() => (frame ? bootSkyScene(frame) : null), [frame]);
  const moment = skyMoment(elapsed);
  const pass = useMemo(
    () => (scene ? skyPass(scene, moment.index) : null),
    [scene, moment.index]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !pass || !frame) return;
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
    draw(context, scene, pass, passPose(pass, moment.progress), elapsed);
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
  pass: SkyPass,
  pose: SkyPose,
  elapsed: number
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

  if (!(pose.alpha > 0)) return;
  const { light } = pass;
  // The light keeps its shape along the arc, so it is the canvas that turns
  // rather than the geometry that is rebuilt.
  context.save();
  context.translate(pass.cx, pass.cy);
  context.rotate(pose.angleDeg * (Math.PI / 180));
  context.translate(-pass.cx, -pass.cy);

  glow(context, light.x, light.y, light.bloom.radius, BLOOM_FADE, light.bloomColor, light.bloom.alpha * pose.alpha);
  glow(context, light.x, light.y, light.glow.radius, GLOW_FADE, light.color, light.glow.alpha * pose.alpha);

  const { tail } = light;
  const fade = context.createLinearGradient(light.x, light.y, tail.tipX, tail.tipY);
  for (const stop of COMET_FADE) {
    fade.addColorStop(stop.at, cssColor({ color: light.color, alpha: stop.strength }));
  }
  context.globalAlpha = tail.alpha * pose.alpha;
  context.fillStyle = fade;
  context.beginPath();
  context.moveTo(tail.points[0], tail.points[1]);
  for (let index = 2; index < tail.points.length; index += 2) {
    context.lineTo(tail.points[index], tail.points[index + 1]);
  }
  context.closePath();
  context.fill();

  glow(context, light.x, light.y, light.coreRadius, CORE_FADE, light.color, pose.alpha);
  context.restore();
}

/** Light fading out from a centre, at the rate `fade` gives. */
function glow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fade: readonly FadeStop[],
  color: string,
  alpha: number
): void {
  if (!(radius > 0) || !(alpha > 0)) return;
  const light = context.createRadialGradient(x, y, 0, x, y, radius);
  for (const stop of fade) light.addColorStop(stop.at, cssColor({ color, alpha: stop.strength }));
  context.globalAlpha = alpha;
  context.fillStyle = light;
  context.beginPath();
  context.arc(x, y, radius, 0, TWO_PI);
  context.fill();
}

const TWO_PI = Math.PI * 2;
