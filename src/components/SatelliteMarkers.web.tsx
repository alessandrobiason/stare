import React, { useLayoutEffect, useRef } from "react";
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
 * The satellite overlay in the replay harness: the same scene, on a 2D canvas.
 *
 * The phone draws it with Skia (`SatelliteMarkers.tsx`) because that is the
 * only single-node canvas React Native has. A browser already has one, and it
 * needs no WebAssembly to start, no 100 MB of prebuilt binaries in the
 * harness's bundle and no second copy of Skia to keep in step with the first.
 *
 * What both backends draw is decided in `markerScene`, which is where the look
 * of a marker is defined and where the tests read it from. This file, like its
 * native sibling, only knows how to fill a circle and a polygon.
 */
export const SatelliteMarkers: React.FC<Props> = ({
  markers,
  frame,
  palette,
  selectedName = null
}) => {
  const drawn = useMarkerFrames(markers);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = frame ? buildMarkerScene(drawn, frame, palette, selectedName) : null;

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
        style={{ position: "absolute", left: 0, top: 0, width: frame.width, height: frame.height }}
      />
      <MarkerLabels labels={scene.labels} rollDeg={scene.rollDeg} palette={palette} />
    </>
  );
};

function draw(context: CanvasRenderingContext2D, scene: MarkerScene): void {
  // Round, so the rim stroked around a tail follows it to the tip instead of
  // running two edges out to the spike where they would have met.
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const glyph of scene.glyphs) drawGlyph(context, glyph, scene.palette);
  // Over every mark, including the ones in front of the selected satellite: a
  // ring half hidden behind a passing dot says nothing.
  if (scene.selection) drawSelection(context, scene.selection);
}

/** The ring that says which satellite the info card is describing. */
function drawSelection(context: CanvasRenderingContext2D, ring: SelectionRing): void {
  const band = (color: string, alpha: number, width: number) => {
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
 * One satellite: its halo if it is a landmark, its tail, its rim and its mark.
 *
 * Drawn a marker at a time rather than a layer at a time, so the sort by range
 * holds — a nearer object's whole shape passes in front of a farther one's. The
 * order within a marker is what joins the tail to the body: the rim goes down
 * first, in both shapes, and the two coloured shapes are laid over it
 * afterwards, so no dark ring is left cutting between a body and its own tail.
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

  if (glyph.halo !== null) {
    circle({ radius: glyph.halo, width: null }, palette.halo.color, palette.halo.alpha * glyph.alpha);
  }
  if (glyph.tail) rim(context, glyph.tail, palette.outline, glyph.alpha);
  circle(glyph.rim, palette.outline.color, palette.outline.alpha * glyph.alpha);
  if (glyph.tail) {
    trace(context, glyph.tail);
    context.globalAlpha = glyph.alpha;
    context.fillStyle = glyph.color;
    context.fill();
  }
  circle(glyph.core, glyph.color, glyph.alpha);
}

/**
 * The dark shape under a tail: the same polygon filled and stroked, so the rim
 * reaches half the stroke past every edge and the tip stays a tip.
 */
function rim(
  context: CanvasRenderingContext2D,
  shape: TailShape,
  ink: Ink,
  alpha: number
): void {
  trace(context, shape);
  context.globalAlpha = ink.alpha * alpha;
  context.fillStyle = ink.color;
  context.fill();
  context.strokeStyle = ink.color;
  context.lineWidth = shape.rimWidth;
  context.stroke();
}

/** The tail's polygon, as the context's current path. */
function trace(context: CanvasRenderingContext2D, shape: TailShape): void {
  context.beginPath();
  context.moveTo(shape.points[0], shape.points[1]);
  for (let index = 2; index < shape.points.length; index += 2) {
    context.lineTo(shape.points[index], shape.points[index + 1]);
  }
  context.closePath();
}

const TWO_PI = Math.PI * 2;
