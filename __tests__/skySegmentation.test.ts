import { fineConfidence, refinedCellCount } from "../src/vision/skyMask";
import {
  CLASS_COUNT,
  maskGridFor,
  modelInputSize,
  poolSkyLogits,
  SKY_CLASS,
  toModelTensor
} from "../src/vision/skySegmentation";

/** The recording's displayed frame, and the phone's preview. */
const REPLAY_FRAME = { width: 720, height: 1280 };
const DEVICE_FRAME = { width: 1080, height: 1440 };

describe("model input sizing", () => {
  test("keeps the frame's aspect ratio rather than letterboxing it square", () => {
    const input = modelInputSize(REPLAY_FRAME);
    const frameAspect = REPLAY_FRAME.width / REPLAY_FRAME.height;

    expect(input.width / input.height).toBeCloseTo(frameAspect, 2);
    expect(input.width).toBeLessThan(input.height);
  });

  test("sizes both lenses to about the same amount of work", () => {
    const replay = modelInputSize(REPLAY_FRAME);
    const device = modelInputSize(DEVICE_FRAME);
    const pixels = (size: { width: number; height: number }) => size.width * size.height;

    // Within a fifth of each other: the budget is what fixes the cost of a pass,
    // and a phone must not silently be given twice the work the replay gets.
    expect(pixels(device) / pixels(replay)).toBeGreaterThan(0.8);
    expect(pixels(device) / pixels(replay)).toBeLessThan(1.2);
  });

  test("both sides are multiples of the encoder's stride", () => {
    for (const frame of [REPLAY_FRAME, DEVICE_FRAME, { width: 640, height: 480 }]) {
      const input = modelInputSize(frame);
      expect(input.width % 32).toBe(0);
      expect(input.height % 32).toBe(0);
    }
  });

  test("a frame with no size is an error, not a zero-sized tensor", () => {
    expect(() => modelInputSize({ width: 0, height: 720 })).toThrow();
    expect(() => modelInputSize({ width: 720, height: NaN })).toThrow();
  });
});

describe("mask grid", () => {
  test("cells are square in angle, so a portrait frame gets more rows than columns", () => {
    const grid = maskGridFor(REPLAY_FRAME);

    expect(grid.rows).toBeGreaterThan(grid.columns);
    // Cell aspect within a few percent of square. The grid this replaced was
    // 48x32 over the same frame: cells nearly three times taller than wide.
    const cellAspect =
      REPLAY_FRAME.width / grid.columns / (REPLAY_FRAME.height / grid.rows);
    expect(cellAspect).toBeGreaterThan(0.95);
    expect(cellAspect).toBeLessThan(1.05);
  });

  test("follows the frame round to landscape", () => {
    const grid = maskGridFor({ width: 1280, height: 720 });
    expect(grid.columns).toBeGreaterThan(grid.rows);
  });
});

describe("tensor conversion", () => {
  const size = { width: 2, height: 1 };

  test("normalizes to ImageNet statistics in planar order", () => {
    // Two pixels: pure white, then pure black, RGBA.
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const tensor = toModelTensor(pixels, size, 4);

    expect(tensor).toHaveLength(3 * 2);
    // Red plane first, both pixels, then green, then blue.
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(tensor[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);
    expect(tensor[2]).toBeCloseTo((1 - 0.456) / 0.224, 5);
    expect(tensor[4]).toBeCloseTo((1 - 0.406) / 0.225, 5);
  });

  test("reads three-channel pixels the same way, ignoring any alpha", () => {
    const rgb = new Uint8Array([255, 255, 255, 0, 0, 0]);
    const rgba = new Uint8ClampedArray([255, 255, 255, 7, 0, 0, 0, 200]);

    expect(Array.from(toModelTensor(rgb, size, 3))).toEqual(
      Array.from(toModelTensor(rgba, size, 4))
    );
  });

  test("a buffer too small for the frame is an error", () => {
    expect(() => toModelTensor(new Uint8Array(3), { width: 4, height: 4 }, 3)).toThrow();
  });
});

/** Logits for a `width` x `height` image where `isSky(x, y)` picks the class. */
function logitsFor(
  width: number,
  height: number,
  isSky: (x: number, y: number) => boolean
): Float32Array {
  const plane = width * height;
  const logits = new Float32Array(CLASS_COUNT * plane);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      // A wide margin, so the softmax lands within rounding of 0 or 1.
      logits[SKY_CLASS * plane + pixel] = isSky(x, y) ? 20 : -20;
    }
  }
  return logits;
}

describe("pooling logits into a mask", () => {
  test("a wholly sky frame reads as sky everywhere", () => {
    const input = { width: 8, height: 8 };
    const mask = poolSkyLogits(logitsFor(8, 8, () => true), input, { columns: 4, rows: 4 });

    expect(mask.confidence).toHaveLength(16);
    for (const value of mask.confidence) expect(value).toBeCloseTo(1, 4);
  });

  test("a horizon halfway down the frame lands halfway down the grid", () => {
    const input = { width: 8, height: 8 };
    const mask = poolSkyLogits(logitsFor(8, 8, (_x, y) => y < 4), input, { columns: 2, rows: 4 });

    // Rows 0 and 1 are above the horizon, rows 2 and 3 below it.
    expect(mask.confidence.slice(0, 4).every((value) => value > 0.99)).toBe(true);
    expect(mask.confidence.slice(4).every((value) => value < 0.01)).toBe(true);
  });

  test("a cell straddling the horizon reads as the average, not as one side", () => {
    const input = { width: 4, height: 4 };
    // Top half sky, and one grid row covering the whole frame.
    const mask = poolSkyLogits(logitsFor(4, 4, (_x, y) => y < 2), input, { columns: 1, rows: 1 });

    expect(mask.confidence[0]).toBeCloseTo(0.5, 3);
  });

  test("every cell is covered even when the grid is finer than the image", () => {
    const input = { width: 3, height: 3 };
    const mask = poolSkyLogits(logitsFor(3, 3, () => true), input, { columns: 8, rows: 8 });

    expect(mask.confidence).toHaveLength(64);
    // No cell may come back as an empty average, which would read as obstruction.
    for (const value of mask.confidence) expect(value).toBeCloseTo(1, 4);
  });

  test("logits of the wrong length are an error rather than a mask of NaN", () => {
    expect(() =>
      poolSkyLogits(new Float32Array(8), { width: 8, height: 8 }, { columns: 2, rows: 2 })
    ).toThrow();
  });
});

describe("sub-cell detail where sky meets not-sky", () => {
  const input = { width: 8, height: 8 };
  const grid = { columns: 2, rows: 2 };

  test("an edge inside a cell is kept at sub-cell resolution", () => {
    // A branch two pixels wide down the middle of the left column of cells: the
    // cell straddles it, and averaged to the cell it is half-open sky.
    const mask = poolSkyLogits(logitsFor(8, 8, (x) => x < 2 || x >= 4), input, grid);

    expect(mask.detail?.factor).toBe(2);
    expect(refinedCellCount(mask)).toBe(2);
    expect(mask.confidence[0]).toBeCloseTo(0.5, 3);

    // And inside it, the branch and the sky either side of it, told apart.
    expect(fineConfidence(mask, 0, 0)).toBeCloseTo(1, 3);
    expect(fineConfidence(mask, 1, 0)).toBeCloseTo(0, 3);
    expect(fineConfidence(mask, 2, 0)).toBeCloseTo(1, 3);
  });

  test("a cell is the mean of its sub-cells, so the two cannot disagree", () => {
    const mask = poolSkyLogits(logitsFor(8, 8, (x, y) => x + y < 6), input, grid);

    for (let cell = 0; cell < mask.confidence.length; cell += 1) {
      const column = cell % mask.columns;
      const row = Math.floor(cell / mask.columns);
      let sum = 0;
      for (let subRow = 0; subRow < 2; subRow += 1) {
        for (let subColumn = 0; subColumn < 2; subColumn += 1) {
          sum += fineConfidence(mask, column * 2 + subColumn, row * 2 + subRow);
        }
      }
      expect(sum / 4).toBeCloseTo(mask.confidence[cell], 5);
    }
  });

  test("a frame with no edge in it carries no detail to blend for the rest of its life", () => {
    // Both sides of the classification threshold have to be inside one cell for
    // its sub-cells to be worth keeping. Open sky is not, and neither is a
    // horizon that happens to fall between two rows of cells.
    expect(poolSkyLogits(logitsFor(8, 8, () => true), input, grid).detail).toBeUndefined();
    expect(poolSkyLogits(logitsFor(8, 8, (_x, y) => y < 4), input, grid).detail).toBeUndefined();
  });

  test("a grid already at the model's resolution is not split further", () => {
    // Nothing under a cell to look at: the sub-cells would land on the same
    // pixel and report it back as structure.
    const mask = poolSkyLogits(logitsFor(3, 3, (x) => x < 1), { width: 3, height: 3 }, {
      columns: 3,
      rows: 3
    });
    expect(mask.detail).toBeUndefined();
    expect(mask.confidence).toHaveLength(9);
  });
});
