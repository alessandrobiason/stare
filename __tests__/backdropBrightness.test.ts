import { CameraAttitude } from "../src/camera/attitude";
import { DEVICE_LENS, rayThroughFrame } from "../src/camera/projection";
import { SKY_MASK_MAX_AGE_SECONDS } from "../src/constants";
import { backdropProbe, brightnessGrid } from "../src/vision/backdropBrightness";
import { FramePixels } from "../src/vision/skySegmenter";
import { Size } from "../src/vision/skySegmentation";

const SIZE: Size = { width: 96, height: 72 };
const LEVEL: CameraAttitude = { headingDeg: 0, pitchDeg: 0, rollDeg: 0 };
const NIGHT: [number, number, number] = [12, 16, 30];

type Patch = { x: number; y: number; width: number; height: number; colour: [number, number, number] };

/** An RGBA frame of night sky, with each patch painted over it. */
function frameWith(patches: Patch[]): FramePixels {
  const pixels = new Uint8Array(SIZE.width * SIZE.height * 4);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      const base = (y * SIZE.width + x) * 4;
      let colour = NIGHT;
      for (const patch of patches) {
        const inside =
          x >= patch.x && x < patch.x + patch.width && y >= patch.y && y < patch.y + patch.height;
        if (inside) colour = patch.colour;
      }
      pixels.set([...colour, 255], base);
    }
  }
  return { pixels, channels: 4 };
}

test("an open night sky is dark everywhere", () => {
  const grid = brightnessGrid(frameWith([]), SIZE, 12);

  expect(grid.columns).toBe(8);
  expect(grid.rows).toBe(6);
  expect(Math.max(...grid.confidence)).toBeLessThan(0.15);
});

test("a street lamp a few pixels across is not averaged into the dark around it", () => {
  // Five pixels square inside one twelve-pixel cell: a sixth of the cell, but
  // most of one of its quarters, which is what the cell is read by.
  const lamp: Patch = { x: 49, y: 25, width: 5, height: 5, colour: [255, 214, 150] };
  const grid = brightnessGrid(frameWith([lamp]), SIZE, 12);

  expect(grid.confidence[2 * grid.columns + 4]).toBeGreaterThan(0.6);
  // And only there: the next cell over is still the night.
  expect(grid.confidence[2 * grid.columns + 6]).toBeLessThan(0.15);
});

test("a single hot pixel is not a light", () => {
  const hot: Patch = { x: 30, y: 30, width: 1, height: 1, colour: [255, 255, 255] };
  const grid = brightnessGrid(frameWith([hot]), SIZE, 12);

  expect(Math.max(...grid.confidence)).toBeLessThan(0.25);
});

test("a warm light counts by its brightest channel, not its luma", () => {
  const sodium: Patch = { x: 0, y: 0, width: 96, height: 72, colour: [255, 140, 20] };
  const grid = brightnessGrid(frameWith([sodium]), SIZE, 12);

  expect(Math.min(...grid.confidence)).toBe(1);
});

describe("read by direction", () => {
  const moon: Patch = { x: 72, y: 0, width: 24, height: 72, colour: [240, 240, 240] };
  const backdrop = {
    grid: brightnessGrid(frameWith([moon]), SIZE, 12),
    attitude: LEVEL,
    capturedAtSeconds: 100
  };

  test("answers for the sky it was taken of, wherever the phone has turned since", () => {
    const probe = backdropProbe(backdrop, DEVICE_LENS, 100.5)!;

    expect(probe(rayThroughFrame({ left: 92, top: 50 }, LEVEL, DEVICE_LENS))).toBeGreaterThan(0.8);
    expect(probe(rayThroughFrame({ left: 20, top: 50 }, LEVEL, DEVICE_LENS))).toBeLessThan(0.15);
  });

  test("says nothing once the picture is stale, or before there is one", () => {
    expect(backdropProbe(backdrop, DEVICE_LENS, 100 + SKY_MASK_MAX_AGE_SECONDS + 1)).toBeNull();
    expect(backdropProbe(null, DEVICE_LENS, 100)).toBeNull();
  });
});
