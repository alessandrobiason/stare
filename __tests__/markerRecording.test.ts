import { buildMarkerScene } from "../src/components/markerScene";
import { DAYLIGHT_PALETTE, NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteMarker } from "../src/hooks/useAnimatedMarkers";

/**
 * The marker overlay's recording into Skia, against a Skia that keeps the state
 * a real canvas would: the transform stack, the paint, and what each path holds.
 * Every draw is kept with the transform and the paint it was made with, so a test
 * can say what reached the picture rather than which calls were made.
 */
type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
];

const mockSkia = { calls: 0, unchangedSets: 0, rewinds: 0 };

jest.mock("../src/components/skia", () => {
  class Paint {
    // Nothing assumed about a fresh paint's defaults: the first value sent for
    // each property is never an unchanged one.
    state: Record<string, unknown> = {};
    private set(key: string, value: unknown) {
      mockSkia.calls += 1;
      if (this.state[key] === value) mockSkia.unchangedSets += 1;
      this.state[key] = value;
    }
    setAntiAlias() { mockSkia.calls += 1; }
    setStrokeJoin() { mockSkia.calls += 1; }
    setStrokeCap(cap: number) { this.set("cap", cap); }
    setStyle(style: number) { this.set("style", style); }
    setShader(shader: unknown) { this.set("shader", shader); }
    setAlphaf(alpha: number) { this.set("alpha", alpha); }
    setStrokeWidth(width: number) { this.set("width", width); }
    setColor(color: Float32Array) { this.set("color", color); this.state.alpha = color[3]; }
  }
  class Path {
    points: number[][] = [];
    rewind() { mockSkia.calls += 1; mockSkia.rewinds += 1; this.points = []; }
    moveTo(x: number, y: number) { mockSkia.calls += 1; this.points.push([x, y]); }
    lineTo(x: number, y: number) { mockSkia.calls += 1; this.points.push([x, y]); }
  }
  class Canvas {
    matrix: Matrix = [1, 0, 0, 1, 0, 0];
    stack: Matrix[] = [];
    draws: { kind: string; matrix: Matrix; paint: Record<string, unknown>; path?: Path; circle?: number[] }[] = [];
    save() { mockSkia.calls += 1; this.stack.push(this.matrix); }
    restore() { mockSkia.calls += 1; this.matrix = this.stack.pop() as Matrix; }
    translate(x: number, y: number) { mockSkia.calls += 1; this.matrix = multiply(this.matrix, [1, 0, 0, 1, x, y]); }
    scale(x: number, y: number) { mockSkia.calls += 1; this.matrix = multiply(this.matrix, [x, 0, 0, y, 0, 0]); }
    rotate(degrees: number) {
      mockSkia.calls += 1;
      const r = (degrees * Math.PI) / 180;
      this.matrix = multiply(this.matrix, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    }
    drawCircle(x: number, y: number, radius: number, paint: Paint) {
      mockSkia.calls += 1;
      this.draws.push({ kind: "circle", matrix: this.matrix, paint: { ...paint.state }, circle: [x, y, radius] });
    }
    drawPath(path: Path, paint: Paint) {
      mockSkia.calls += 1;
      this.draws.push({ kind: "path", matrix: this.matrix, paint: { ...paint.state }, path });
    }
  }
  let shaders = 0;
  return {
    PaintStyle: { Fill: 0, Stroke: 1 },
    StrokeCap: { Butt: 0, Round: 1 },
    StrokeJoin: { Round: 1 },
    TileMode: { Clamp: 0 },
    SkiaPictureView: () => null,
    Skia: {
      Paint: () => new Paint(),
      Path: { Make: () => new Path() },
      Color: () => Float32Array.of(0.5, 0.5, 0.5, 1),
      Point: (x: number, y: number) => ({ x, y }),
      Shader: {
        MakeLinearGradient: () => ({ shader: ++shaders }),
        MakeRadialGradient: () => ({ shader: ++shaders })
      }
    },
    createPicture: (draw: (canvas: Canvas) => void) => {
      const canvas = new Canvas();
      draw(canvas);
      return canvas;
    }
  };
});

// The native component, which is what records into Skia. The test run resolves
// `.web` files first, and the web overlay draws into a browser canvas instead,
// so it is asked for by its full name.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markerDrawStats, record } = require("../src/components/SatelliteMarkers.tsx") as typeof import("../src/components/SatelliteMarkers");

const BOX = { width: 600, height: 800 };

function marker(name: string, left: number, top: number, overrides: Partial<SatelliteMarker> = {}): SatelliteMarker {
  return {
    name,
    category: "INTERNET",
    parked: false,
    point: { left, top },
    rangeKm: 900,
    trail: Array.from({ length: 9 }, (_, step) => ({ left: left - (step + 1) * 1.5, top: top + (step + 1) * 0.4 })),
    opacity: 1,
    sunlit: "sunlit",
    ...overrides
  };
}

function recorded(markers: SatelliteMarker[], palette = DAYLIGHT_PALETTE) {
  const scene = buildMarkerScene({ markers, paths: [], rollDeg: 0 }, BOX, palette, null);
  mockSkia.calls = 0;
  mockSkia.unchangedSets = 0;
  mockSkia.rewinds = 0;
  const canvas = record(scene, BOX) as unknown as {
    draws: { kind: string; matrix: number[]; paint: Record<string, unknown>; path?: { points: number[][] }; circle?: number[] }[];
  };
  return { scene, draws: canvas.draws };
}

const SKY = [
  marker("A", 30, 40),
  marker("B", 60, 20),
  marker("PARKED", 70, 70, { parked: true, trail: null, rangeKm: 36000 }),
  marker("C", 45, 55, { opacity: 0.4 })
];

test("a trail is laid into its path once, though by day it is stroked twice", () => {
  const { draws } = recorded(SKY);
  const tails = draws.filter((draw) => draw.kind === "path");
  // Three moving marks, each stroked in the edge's ink and then in its colour…
  expect(tails).toHaveLength(6);
  // …from three paths, each laid once.
  expect(new Set(tails.map((draw) => draw.path)).size).toBe(3);
  expect(mockSkia.rewinds).toBe(3);
});

test("no paint property is sent the value it already has", () => {
  recorded(SKY);
  expect(mockSkia.unchangedSets).toBe(0);
  // And again on the next frame, with the paint carried over from this one.
  recorded(SKY, NIGHT_PALETTE);
  expect(mockSkia.unchangedSets).toBe(0);
});

test("each light lands on its mark at its own size, whatever size came before it", () => {
  // At night, when a mark is all light and every layer of it is drawn.
  const { scene, draws } = recorded(SKY, NIGHT_PALETTE);
  for (const glyph of scene.glyphs.filter((one) => one.core.width === null)) {
    const sizes = [glyph.bloom.radius, glyph.glow.radius, glyph.core.radius, glyph.halo];
    const lights = draws.filter(
      (draw) =>
        draw.kind === "circle" &&
        draw.paint.shader !== null &&
        Math.abs(draw.matrix[4] - glyph.x) < 1e-9 &&
        Math.abs(draw.matrix[5] - glyph.y) < 1e-9
    );
    expect(lights.length).toBeGreaterThanOrEqual(2);
    for (const light of lights) {
      // A uniform scale about the mark, nothing turned, and one of its own sizes:
      // a circle of radius one there.
      expect(light.matrix[1]).toBeCloseTo(0, 12);
      expect(light.matrix[2]).toBeCloseTo(0, 12);
      expect(light.matrix[3]).toBeCloseTo(light.matrix[0], 12);
      expect(sizes.some((size) => size !== null && Math.abs(light.matrix[0] - size) < 1e-9)).toBe(true);
      expect(light.circle).toEqual([0, 0, 1]);
    }
  }
});

test("a trail is drawn from its mark to its tip, in the width it was worked out at", () => {
  const { scene, draws } = recorded(SKY);
  const glyph = scene.glyphs.find((one) => one.tail !== null) as (typeof scene.glyphs)[number];
  const tail = glyph.tail as NonNullable<typeof glyph.tail>;
  const coloured = draws.find(
    (draw) =>
      draw.kind === "path" &&
      Math.abs(draw.matrix[4] - glyph.x) < 1e-9 &&
      Math.abs((draw.paint.width as number) * Math.hypot(draw.matrix[0], draw.matrix[1]) - tail.width) < 1e-9
  );
  expect(coloured).toBeDefined();
  const m = coloured!.matrix;
  // The path's (1, 0) is the tip, in the frame's own coordinates.
  expect(m[0] + m[4]).toBeCloseTo(tail.tipX, 9);
  expect(m[1] + m[5]).toBeCloseTo(tail.tipY, 9);
});

test("the Console's count of calls into Skia is the number actually made", () => {
  recorded(SKY);
  expect(markerDrawStats()?.nativeCalls).toBe(mockSkia.calls);
  recorded(SKY, NIGHT_PALETTE);
  expect(markerDrawStats()?.nativeCalls).toBe(mockSkia.calls);
});
