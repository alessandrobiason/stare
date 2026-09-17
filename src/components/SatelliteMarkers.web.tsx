import React, { useLayoutEffect, useRef } from "react";
import { MarkerSource, useMarkerFrames } from "../hooks/useAnimatedMarkers";
import { MarkerLabels } from "./MarkerLabels";
import { FrameSize } from "./markerGeometry";
import {
  BLOOM_FADE,
  buildMarkerScene,
  Circle,
  CORE_FADE,
  FadeStop,
  GLOW_FADE,
  GlyphShape,
  MarkerScene,
  PathShape,
  SelectionRing,
  TAIL_FADE,
  TailShape
} from "./markerScene";
import { cssColor, MarkerPalette } from "./palette";

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
 * The satellite overlay in the replay harness: the same scene, on a 2D canvas.
 *
 * The phone draws it with Skia (`SatelliteMarkers.tsx`) because that is the
 * only single-node canvas React Native has. A browser already has one, and it
 * needs no WebAssembly to start, no 100 MB of prebuilt binaries in the
 * harness's bundle and no second copy of Skia to keep in step with the first.
 *
 * What both backends draw is decided in `markerScene`, which is where the look
 * of a marker is defined and where the tests read it from. This file, like its
 * native sibling, only knows how to fill a circle and a polygon and fade one.
 * Memoized for the reason its sibling is.
 */
export const SatelliteMarkers: React.FC<Props> = React.memo(({
  markers,
  frame,
  palette,
  selectedName = null,
  scale
}) => {
  const drawn = useMarkerFrames(markers);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = frame ? buildMarkerScene(drawn, frame, palette, selectedName, scale) : null;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !frame) return;
    // Backing pixels rather than layout pixels, or the marks are drawn soft on
    // every display the harness is actually looked at on.
    const density = window.devicePixelRatio || 1;
    const width = Math.round(frame.width * density);
    const height = Math.round(frame.height * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, frame.width, frame.height);
    draw(context, scene);
  });

  if (!frame || !scene) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: frame.width,
          height: frame.height,
          // As the Skia view has it on the phone: the marks are drawn over the
          // picture, and the picture is what takes the tap that selects one.
          // Without this the canvas swallows every press over the frame.
          pointerEvents: "none"
        }}
      />
      <MarkerLabels labels={scene.labels} rollDeg={scene.rollDeg} palette={palette} />
    </>
  );
});

SatelliteMarkers.displayName = "SatelliteMarkers";

function draw(context: CanvasRenderingContext2D, scene: MarkerScene): void {
  context.lineJoin = "round";
  context.lineCap = "round";
  // Under the marks, and first: a path is what the marks are read against.
  for (const path of scene.paths) drawPath(context, path, scene.palette);
  // Every edge before any mark's light, as on the phone — by day; at night a
  // mark has none. the station is several
  // marks in one place, and each edge over the glow beneath it cut a dark ring.
  for (const glyph of scene.glyphs) drawRim(context, glyph, scene.palette);
  for (const glyph of scene.glyphs) drawGlyph(context, glyph, scene.palette);
  // Over every mark, including the ones in front of the selected satellite: a
  // ring half hidden behind a passing dot says nothing.
  if (scene.selection) drawSelection(context, scene.selection);
}

/**
 * One landmark's path: the wake behind the object, the dashes ahead of it, and
 * the clock minutes on them.
 *
 * Rims for the whole shape first and colour afterwards, as on the phone: an
 * arrowhead sits on the line it belongs to, and drawn in pairs each mark's rim
 * would cut a dark notch through the arc it is measuring. The wake's steps are
 * cut square so they meet end to end rather than overlapping into beads.
 */
function drawPath(
  context: CanvasRenderingContext2D,
  shape: PathShape,
  palette: MarkerPalette
): void {
  const draw = (runs: number[][], color: string, alpha: number, width: number) => {
    if (runs.length === 0 || !(alpha > 0)) return;
    trace(context, runs);
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  };
  const wake = (color: string, strength: number, width: number) => {
    context.lineCap = "butt";
    for (const step of shape.past) draw([step.points], color, strength * step.alpha, width);
    context.lineCap = "round";
  };

  // No edge at night (`PathShape.rim`), so these draw nothing then.
  const ink = shape.rim;
  wake(ink.color, ink.alpha, shape.pastRimWidth);
  draw(shape.dashes, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  draw(shape.arrows, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  wake(shape.color, 1, shape.pastWidth);
  draw(shape.dashes, shape.color, shape.alpha, shape.width);
  draw(shape.arrows, shape.color, shape.alpha, shape.width);
}

/** The ring that says which satellite the info card is describing. */
function drawSelection(context: CanvasRenderingContext2D, ring: SelectionRing): void {
  const band = (color: string, alpha: number, width: number) => {
    if (!(alpha > 0)) return;
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.arc(ring.x, ring.y, Math.max(0, ring.radius), 0, TWO_PI);
    context.stroke();
  };

  band(ring.rim.color, ring.rim.alpha * ring.alpha, ring.rimWidth);
  band(ring.color, ring.alpha, ring.width);
}

/**
 * One satellite, over the edges: its halo if it is a landmark, its bloom and
 * glow, its tail and its point.
 *
 * Drawn a marker at a time rather than a layer at a time, so the sort by range
 * holds — a nearer object's whole shape passes in front of a farther one's. The
 * edges are already down (`drawRim`), so no dark ring is left cutting between a
 * point and its own tail, or through the light around it.
 */
function drawGlyph(
  context: CanvasRenderingContext2D,
  glyph: GlyphShape,
  palette: MarkerPalette
): void {
  const circle = (shape: Circle, color: string, alpha: number) => {
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(glyph.x, glyph.y, Math.max(0, shape.radius), 0, TWO_PI);
    if (shape.width === null) {
      context.fillStyle = color;
      context.fill();
    } else {
      context.strokeStyle = color;
      context.lineWidth = shape.width;
      context.stroke();
    }
  };
  const glow = (
    radius: number,
    fade: readonly FadeStop[],
    color: string,
    alpha: number
  ) => {
    if (!(radius > 0) || !(alpha > 0)) return;
    const light = context.createRadialGradient(glyph.x, glyph.y, 0, glyph.x, glyph.y, radius);
    for (const stop of fade) {
      light.addColorStop(stop.at, cssColor({ color, alpha: stop.strength }));
    }
    context.globalAlpha = alpha;
    context.fillStyle = light;
    context.beginPath();
    context.arc(glyph.x, glyph.y, radius, 0, TWO_PI);
    context.fill();
  };

  if (glyph.halo !== null) {
    glow(glyph.halo, GLOW_FADE, palette.halo.color, palette.halo.alpha * glyph.alpha);
  }
  glow(glyph.bloom.radius, BLOOM_FADE, glyph.bloomColor, glyph.bloom.alpha * glyph.alpha);
  glow(glyph.glow.radius, GLOW_FADE, glyph.color, glyph.glow.alpha * glyph.alpha);
  if (glyph.tail) {
    drawTail(context, glyph, glyph.tail, glyph.color, glyph.tail.alpha * glyph.alpha, 0);
  }
  // A moving mark's point is light too, soft at its rim; a parked ring stays sharp.
  if (glyph.core.width === null) {
    glow(glyph.core.radius, CORE_FADE, glyph.color, glyph.alpha);
  } else {
    circle(glyph.core, glyph.color, glyph.alpha);
  }
}

/** The dark edge under a mark and under its tail: a disc, or a band under a ring. */
function drawRim(
  context: CanvasRenderingContext2D,
  glyph: GlyphShape,
  palette: MarkerPalette
): void {
  const ink = palette.outline;
  if (!(glyph.edgeAlpha > 0)) return;
  if (glyph.tail) {
    drawTail(context, glyph, glyph.tail, glyph.edgeColor, ink.alpha * glyph.edgeAlpha, glyph.tail.rim);
  }
  const { rim } = glyph;
  context.globalAlpha = ink.alpha * glyph.edgeAlpha;
  context.beginPath();
  context.arc(glyph.x, glyph.y, Math.max(0, rim.radius), 0, TWO_PI);
  if (rim.width === null) {
    context.fillStyle = glyph.edgeColor;
    context.fill();
  } else {
    context.strokeStyle = glyph.edgeColor;
    context.lineWidth = rim.width;
    context.stroke();
  }
}

/**
 * The trail, faded from the point to its tip: its runs stroked in the mark's
 * colour, or — `outset` wider on every side — in the edge's ink under it.
 */
function drawTail(
  context: CanvasRenderingContext2D,
  glyph: GlyphShape,
  tail: TailShape,
  color: string,
  alpha: number,
  outset: number
): void {
  if (!(alpha > 0)) return;
  const fade = context.createLinearGradient(glyph.x, glyph.y, tail.tipX, tail.tipY);
  for (const stop of TAIL_FADE) {
    fade.addColorStop(stop.at, cssColor({ color, alpha: stop.strength }));
  }
  trace(context, tail.runs);
  context.globalAlpha = alpha;
  context.strokeStyle = fade;
  context.lineWidth = tail.width + 2 * outset;
  context.stroke();
}

/**
 * Runs of flat `x, y` pairs as the context's current path, each its own open
 * stretch: a dash, a step of a wake, an arrowhead — or, closed after, a tail.
 */
function trace(context: CanvasRenderingContext2D, runs: number[][]): void {
  context.beginPath();
  for (const points of runs) {
    context.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      context.lineTo(points[index], points[index + 1]);
    }
  }
}

const TWO_PI = Math.PI * 2;

/**
 * The native overlay's drawing cost, for the Console. The browser draws into a
 * 2D canvas instead, where there are no calls across to native code to count.
 */
export function markerDrawStats(): null {
  return null;
}
