import React from "react";
import { StyleSheet } from "react-native";
import { MarkerSource, useMarkerFrames } from "../hooks/useAnimatedMarkers";
import { MarkerLabels } from "./MarkerLabels";
import { FrameSize } from "./markerGeometry";
import { fadeShader, RadialFade, skiaColor } from "./lightShaders";
import {
  buildMarkerScene,
  Circle,
  GlyphShape,
  MarkerScene,
  PathShape,
  SelectionRing,
  TailShape
} from "./markerScene";
import { MarkerPalette } from "./palette";
import {
  PaintStyle,
  Skia,
  SkiaPictureView,
  StrokeCap,
  StrokeJoin,
  createPicture
} from "./skia";
import type { SkCanvas, SkColor, SkPaint, SkPath, SkPicture, SkShader } from "./skia";

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
 * The satellite overlay: every marker on the frame, in one drawing node.
 *
 * This is the only tree in the app under real time pressure, and it used to be
 * a tree — a view for the mark, one for its rim, one for the halo, two for the
 * trail, one for the box holding them, seventy times over, all of them moving
 * every frame. Around five hundred views is not a number React can be made
 * fast at sixty frames a second, whatever is memoized: each one still has to
 * be reconciled, have its props crossed into native, be laid out and be
 * composited, and a view that fades a group of children is composited into an
 * off-screen buffer of its own to do it. On an iPhone 12 mini the overlay ran
 * at 60 Hz with an empty sky and under 10 with a full one.
 *
 * So the marks are not views any more. `markerScene` works out the shapes,
 * and this records them into a Skia picture — one native view, one draw, a
 * cost that grows with the number of *shapes* rather than with the number of
 * views. What React does per displayed frame is render this one component.
 *
 * The picture is rebuilt rather than mutated because that is what a picture
 * is: a recorded display list, cheap to record (a few hundred calls into an
 * already-open canvas) and free to replay. `SkiaPictureView` hands it to the
 * native view as a JSI property, so a new frame does not touch the shadow tree
 * at all.
 *
 * The names are the exception, and stay views — see `MarkerLabels`.
 *
 * Memoized, because the view above it renders whenever a sky mask lands, and
 * each of those renders was one more scene built and recorded on top of the
 * frames this component is already drawing — on the frames the rest of the
 * pass is landing on.
 */
export const SatelliteMarkers: React.FC<Props> = React.memo(({
  markers,
  frame,
  palette,
  selectedName = null,
  scale
}) => {
  const drawn = useMarkerFrames(markers);
  if (!frame) return null;

  const sceneStarted = performance.now();
  const scene = buildMarkerScene(drawn, frame, palette, selectedName, scale);
  const sceneMs = performance.now() - sceneStarted;
  const picture = record(scene, frame, sceneMs);
  return (
    <>
      <SkiaPictureView
        picture={picture}
        style={[styles.canvas, frame]}
        pointerEvents="none"
      />
      <MarkerLabels labels={scene.labels} rollDeg={scene.rollDeg} palette={palette} />
    </>
  );
});

SatelliteMarkers.displayName = "SatelliteMarkers";

/** The scene as a display list, ready for the view to replay. */
export function record(scene: MarkerScene, frame: FrameSize, sceneMs = 0): SkPicture {
  const started = performance.now();
  const picture = createPicture(
    (canvas) => {
      const pen = drawingPen();
      const counted = pen.nativeCalls;

      // Under the marks, and first: a path is what the marks are read against.
      for (const path of scene.paths) drawPath(canvas, pen, path, scene.palette);

      // Every edge before any mark's light — by day, since at night a mark has
      // none (`MarkerPalette.edge`). Crew and cargo vehicles sit on the
      // station they are docked to, so the station is several marks in one
      // place, and each edge laid over the glow of the marks under it cut a
      // dark ring through the brightest thing on the frame. An edge is a pixel
      // or so wide; what it separates a mark from is the sky, not the marks
      // behind it.
      const tails = pen.tailsFor(scene.glyphs.length);
      const ink = scene.palette.outline;
      scene.glyphs.forEach((glyph, index) => {
        const edge = ink.alpha * glyph.edgeAlpha;
        if (!(edge > 0)) return;
        if (glyph.tail) {
          const tail = tails.shape(index, glyph, glyph.tail);
          if (tail) {
            canvas.save();
            canvas.translate(glyph.x, glyph.y);
            canvas.rotate(tail.angleDeg, 0, 0);
            canvas.scale(tail.chord, tail.chord);
            pen.stroke((glyph.tail.width + 2 * glyph.tail.rim) / tail.chord);
            pen.shader(fadeShader("tail", glyph.edgeColor));
            pen.alpha(edge);
            canvas.drawPath(tail.path, pen.paint);
            canvas.restore();
            pen.drew(6);
          }
        }
        circle(canvas, pen, glyph.x, glyph.y, glyph.rim, glyph.edgeColor, edge);
      });
      scene.glyphs.forEach((glyph, index) => drawGlyph(canvas, pen, tails, index, glyph, scene.palette));

      // Over every mark, including the ones in front of the selected satellite:
      // a ring half hidden behind a passing dot says nothing.
      if (scene.selection) drawSelection(canvas, pen, scene.selection);

      lastRecord.nativeCalls = pen.nativeCalls - counted;
    },
    { x: 0, y: 0, width: frame.width, height: frame.height }
  );
  lastRecord.ms = performance.now() - started;
  noteDrawCost(sceneMs);
  return picture;
}

/**
 * What the newest recording cost, for the Console: how long it took, and how
 * many calls it made into Skia. See `markerDrawStats`.
 */
const lastRecord = { ms: 0, nativeCalls: 0 };

/**
 * The paint every frame is recorded with, and what was last set on it.
 *
 * Every call into Skia from here is a call across JSI, and on a phone that is
 * the cost of a frame, not the drawing: the picture replays on the GPU in a
 * blink, while the few thousand calls that record it hold the JavaScript thread
 * for tens of milliseconds. So nothing is sent that the paint already has. A
 * mark's glows were each a fill style, a shader, an alpha and a shader cleared
 * again; most of those were the value already set, and the clearing was undone
 * by the next line.
 *
 * Kept across frames, with the paint: a recording copies the paint at each draw,
 * so the one paint can go on being changed after a picture is made from it.
 *
 * `setColor` sets the alpha too, to the colour's own, which is why it replaces
 * the alpha the pen knew.
 */
class Pen {
  readonly paint: SkPaint;
  /** Calls made into Skia through this pen and its drawing, over its life. */
  nativeCalls = 0;
  private style: PaintStyle | null = null;
  private currentShader: SkShader | null = null;
  private currentAlpha = Number.NaN;
  private width = Number.NaN;
  private currentColor: SkColor | null = null;
  private currentCap: StrokeCap | null = null;
  private readonly tailPaths = new TailPaths(this);

  constructor() {
    this.paint = Skia.Paint();
    this.paint.setAntiAlias(true);
    this.paint.setStrokeJoin(StrokeJoin.Round);
    this.cap(StrokeCap.Round);
    this.nativeCalls += 3;
  }

  /** For the calls this pen does not make itself — the canvas's and the paths'. */
  drew(calls: number): void {
    this.nativeCalls += calls;
  }

  fill(): void {
    this.setStyle(PaintStyle.Fill);
  }

  stroke(width: number): void {
    this.setStyle(PaintStyle.Stroke);
    if (width !== this.width) {
      this.width = width;
      this.paint.setStrokeWidth(width);
      this.nativeCalls += 1;
    }
  }

  shader(shader: SkShader | null): void {
    if (shader === this.currentShader) return;
    this.currentShader = shader;
    this.paint.setShader(shader);
    this.nativeCalls += 1;
  }

  color(color: string): void {
    const value = skiaColor(color);
    if (value === this.currentColor) return;
    this.currentColor = value;
    // A colour carries its own alpha, and setting it sets the paint's.
    this.currentAlpha = value[3];
    this.paint.setColor(value);
    this.nativeCalls += 1;
  }

  alpha(alpha: number): void {
    if (alpha === this.currentAlpha) return;
    this.currentAlpha = alpha;
    this.paint.setAlphaf(alpha);
    this.nativeCalls += 1;
  }

  cap(cap: StrokeCap): void {
    if (cap === this.currentCap) return;
    this.currentCap = cap;
    this.paint.setStrokeCap(cap);
    this.nativeCalls += 1;
  }

  /** The trail geometry for this frame's glyphs. See `TailPaths`. */
  tailsFor(count: number): TailPaths {
    this.tailPaths.beginFrame(count);
    return this.tailPaths;
  }

  private setStyle(style: PaintStyle): void {
    if (style === this.style) return;
    this.style = style;
    this.paint.setStyle(style);
    this.nativeCalls += 1;
  }
}

/** A glyph's trail as it is drawn: the path in the trail's own units, and the transform onto it. */
type PlacedTail = { path: SkPath; chord: number; angleDeg: number };

/**
 * Each glyph's trail laid into a path once a frame, however many times it is
 * stroked.
 *
 * By day a trail is stroked twice — in the edge's ink under everything, then in
 * the mark's colour — and it used to be laid into the path twice, a `moveTo` or
 * `lineTo` a point each time: most of a frame's calls into Skia, spent writing
 * the same points again. Now the first stroke lays it and the second reuses it.
 *
 * The paths are kept from frame to frame and rewound rather than made again,
 * for the reason the one reused path always was: a native object per trail per
 * frame is the allocation this arrangement exists to avoid.
 */
class TailPaths {
  private readonly paths: SkPath[] = [];
  private placed: (PlacedTail | null | undefined)[] = [];

  constructor(private readonly pen: Pen) {}

  beginFrame(count: number): void {
    this.placed = new Array(count);
  }

  /** Glyph `index`'s trail, laid on first asking this frame. `null` for one with no length. */
  shape(index: number, glyph: GlyphShape, tail: TailShape): PlacedTail | null {
    const known = this.placed[index];
    if (known !== undefined) return known;

    // Placed the way a glow is, for the same reason: one gradient per colour
    // rather than one per mark per frame. The gradient runs a unit along `+x`,
    // so the canvas is moved onto the mark, turned towards the tip and scaled —
    // uniformly, so the curve keeps its shape — until the tip is at `(1, 0)`,
    // and the runs are laid into the path in those units.
    const dx = tail.tipX - glyph.x;
    const dy = tail.tipY - glyph.y;
    const chord = Math.hypot(dx, dy);
    if (!(chord > 0)) {
      this.placed[index] = null;
      return null;
    }
    const cos = dx / chord;
    const sin = dy / chord;

    let path = this.paths[index];
    if (!path) {
      path = Skia.Path.Make();
      this.paths[index] = path;
    }
    path.rewind();
    let calls = 1;
    for (const run of tail.runs) {
      for (let at = 0; at < run.length; at += 2) {
        const x = run[at] - glyph.x;
        const y = run[at + 1] - glyph.y;
        const u = (x * cos + y * sin) / chord;
        const v = (y * cos - x * sin) / chord;
        if (at === 0) path.moveTo(u, v);
        else path.lineTo(u, v);
        calls += 1;
      }
    }
    this.pen.drew(calls);

    const placed = { path, chord, angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI };
    this.placed[index] = placed;
    return placed;
  }
}

/** The pen, made on first use once Skia is set up, and kept. */
let pen: Pen | null = null;
function drawingPen(): Pen {
  if (!pen) pen = new Pen();
  return pen;
}

/**
 * One satellite, over the edges: its halo if it is a landmark, its bloom and
 * glow, its tail and its point.
 *
 * Drawn a marker at a time rather than a layer at a time, so the sort by range
 * holds — a nearer object's whole shape passes in front of a farther one's. The
 * edges have all gone down already (`record`), so the tail and the point are
 * laid over their own edge and no dark ring is left cutting between a point and
 * its own tail, or through the light around it.
 *
 * One move onto the mark for all of it. Its lights are each a circle of radius
 * one scaled to size — a shader is a native object, and one per mark per frame
 * is seventy allocations for what is the same gradient every time — and they
 * used to be a save, a move, a scale and a restore apiece around the same
 * point. Scaled from one size to the next instead, a mark's lights are a scale
 * and a draw each.
 */
function drawGlyph(
  canvas: SkCanvas,
  pen: Pen,
  tails: TailPaths,
  index: number,
  glyph: GlyphShape,
  palette: MarkerPalette
): void {
  canvas.save();
  canvas.translate(glyph.x, glyph.y);
  pen.drew(2);
  let scale = 1;

  const glow = (radius: number, kind: RadialFade, color: string, alpha: number) => {
    if (!(radius > 0) || !(alpha > 0)) return;
    pen.fill();
    pen.shader(fadeShader(kind, color));
    pen.alpha(alpha);
    canvas.scale(radius / scale, radius / scale);
    scale = radius;
    canvas.drawCircle(0, 0, 1, pen.paint);
    pen.drew(2);
  };

  if (glyph.halo !== null) {
    glow(glyph.halo, "glow", palette.halo.color, palette.halo.alpha * glyph.alpha);
  }
  glow(glyph.bloom.radius, "bloom", glyph.bloomColor, glyph.bloom.alpha * glyph.alpha);
  glow(glyph.glow.radius, "glow", glyph.color, glyph.glow.alpha * glyph.alpha);

  if (glyph.tail) {
    const alpha = glyph.tail.alpha * glyph.alpha;
    const tail = alpha > 0 ? tails.shape(index, glyph, glyph.tail) : null;
    if (tail) {
      // Turned and scaled onto the trail from wherever the lights left the
      // scale: a uniform scale and a rotation commute, so this is the move,
      // the turn and the scale the trail has always been drawn with.
      canvas.save();
      canvas.rotate(tail.angleDeg, 0, 0);
      canvas.scale(tail.chord / scale, tail.chord / scale);
      pen.stroke(glyph.tail.width / tail.chord);
      pen.shader(fadeShader("tail", glyph.color));
      pen.alpha(alpha);
      canvas.drawPath(tail.path, pen.paint);
      canvas.restore();
      pen.drew(5);
    }
  }

  // A moving mark's point is light too, soft at its rim (`CORE_FADE`); a parked
  // ring is stroked, and stays sharp — in the frame's own units, after the move
  // is undone.
  if (glyph.core.width === null) glow(glyph.core.radius, "core", glyph.color, glyph.alpha);
  canvas.restore();
  pen.drew(1);
  if (glyph.core.width !== null) circle(canvas, pen, glyph.x, glyph.y, glyph.core, glyph.color, glyph.alpha);
}

/**
 * One landmark's path: the wake behind the object, the dashes ahead of it, and
 * the clock minutes on them.
 *
 * Rims first for the whole shape and colour afterwards, rather than rim and
 * colour a piece at a time. An arrowhead sits on the line it belongs to, so drawn
 * in pairs the mark's own rim is laid over the line's colour and every mark
 * cuts a dark notch through the arc it is measuring.
 *
 * The dashes are one path and one draw, however many there are; the wake is a
 * draw per step, since each step has a strength of its own. Its steps are cut
 * square, so they meet end to end — rounded, each join would be two caps laid
 * over each other, and a bead on the line. Each piece is laid into its path
 * once and stroked twice, rim and colour, rather than laid in again for each.
 */
function drawPath(canvas: SkCanvas, pen: Pen, shape: PathShape, palette: MarkerPalette): void {
  const ink = shape.rim;
  const lines = pathLines();

  // Laid on first use, so a piece drawn at no strength is not laid at all.
  const laid: (SkPath | undefined)[] = [];
  const piece = (slot: number, runs: number[][]) => () => (laid[slot] ??= lines.trace(slot, runs));
  const dashes = shape.dashes.length > 0 ? piece(0, shape.dashes) : null;
  const arrows = shape.arrows.length > 0 ? piece(1, shape.arrows) : null;
  const steps = shape.past.map((step, index) => piece(2 + index, [step.points]));

  const draw = (path: (() => SkPath) | null, color: string, alpha: number, width: number) => {
    if (!path || !(alpha > 0)) return;
    pen.shader(null);
    pen.stroke(width);
    pen.color(color);
    pen.alpha(alpha);
    canvas.drawPath(path(), pen.paint);
    pen.drew(1);
  };
  const wake = (color: string, strength: number, width: number) => {
    pen.cap(StrokeCap.Butt);
    shape.past.forEach((step, index) => draw(steps[index], color, strength * step.alpha, width));
    pen.cap(StrokeCap.Round);
  };

  // No edge at night (`PathShape.rim`), so these draw nothing then.
  wake(ink.color, ink.alpha, shape.pastRimWidth);
  draw(dashes, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  draw(arrows, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  wake(shape.color, 1, shape.pastWidth);
  draw(dashes, shape.color, shape.alpha, shape.width);
  draw(arrows, shape.color, shape.alpha, shape.width);

  /** Kept from frame to frame, a path per piece, rewound when it is laid again. */
  function pathLines() {
    return {
      trace(slot: number, runs: number[][]): SkPath {
        let path = linePaths[slot];
        if (!path) {
          path = Skia.Path.Make();
          linePaths[slot] = path;
        }
        path.rewind();
        let calls = 1;
        for (const points of runs) {
          path.moveTo(points[0], points[1]);
          calls += 1;
          for (let at = 2; at < points.length; at += 2) {
            path.lineTo(points[at], points[at + 1]);
            calls += 1;
          }
        }
        pen.drew(calls);
        return path;
      }
    };
  }
}

/** The paths the landmark arcs are laid into, by piece. See `drawPath`. */
const linePaths: SkPath[] = [];

/** The ring that says which satellite the info card is describing. */
function drawSelection(canvas: SkCanvas, pen: Pen, ring: SelectionRing): void {
  pen.shader(null);
  if (ring.rim.alpha > 0) {
    pen.stroke(ring.rimWidth);
    pen.color(ring.rim.color);
    pen.alpha(ring.rim.alpha * ring.alpha);
    canvas.drawCircle(ring.x, ring.y, ring.radius, pen.paint);
    pen.drew(1);
  }
  pen.stroke(ring.width);
  pen.color(ring.color);
  pen.alpha(ring.alpha);
  canvas.drawCircle(ring.x, ring.y, ring.radius, pen.paint);
  pen.drew(1);
}

/** One of the scene's circles: a disc, or a band stroked on its own radius. */
function circle(
  canvas: SkCanvas,
  pen: Pen,
  x: number,
  y: number,
  shape: Circle,
  color: string,
  alpha: number
): void {
  pen.shader(null);
  if (shape.width === null) pen.fill();
  else pen.stroke(shape.width);
  pen.color(color);
  pen.alpha(alpha);
  canvas.drawCircle(x, y, shape.radius, pen.paint);
  pen.drew(1);
}

/**
 * What drawing a frame of markers costs on the JavaScript thread: working out the
 * shapes (`buildMarkerScene`) and recording them into a picture, smoothed over
 * the frames, and how many calls into Skia the newest recording made. The last
 * is the figure to read on a phone — each is a crossing between JavaScript and
 * native code, and a frame of a few thousand of them is where its milliseconds
 * go. Exact rather than smoothed, since it moves only with what is on screen.
 */
export type MarkerDrawStats = { sceneMs: number; recordMs: number; nativeCalls: number };

/** Weight of the newest frame in `MarkerDrawStats`. */
const DRAW_COST_SMOOTHING = 0.1;
const drawCost: MarkerDrawStats = { sceneMs: 0, recordMs: 0, nativeCalls: 0 };

function noteDrawCost(sceneMs: number): void {
  const smooth = (previous: number, next: number) =>
    previous === 0 ? next : previous + (next - previous) * DRAW_COST_SMOOTHING;
  drawCost.sceneMs = smooth(drawCost.sceneMs, sceneMs);
  drawCost.recordMs = smooth(drawCost.recordMs, lastRecord.ms);
  drawCost.nativeCalls = lastRecord.nativeCalls;
}

/**
 * The smoothed cost of drawing markers, for the Console. Read on its timer rather
 * than published per frame, so offering it costs the frame nothing.
 */
export function markerDrawStats(): MarkerDrawStats | null {
  return drawCost.recordMs === 0 ? null : { ...drawCost };
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
