import {
  fineConfidence,
  fineGrid,
  refinedCellCount,
  sampleMask,
  scaledDetail,
  skyConfidenceAt,
  skyCoverage,
  SkyMask
} from "../src/vision/skyMask";

const checkerboard: SkyMask = { columns: 2, rows: 2, confidence: [1, 0, 0, 1] };

test("reads the confidence at a frame percentage", () => {
  // Cell centres, where the interpolation returns the cell's own value.
  expect(skyConfidenceAt(checkerboard, 25, 25)).toBeCloseTo(1);
  expect(skyConfidenceAt(checkerboard, 75, 25)).toBeCloseTo(0);
  expect(skyConfidenceAt(checkerboard, 25, 75)).toBeCloseTo(0);
  expect(skyConfidenceAt(checkerboard, 75, 75)).toBeCloseTo(1);
});

test("interpolates between cell centres rather than stepping at their edges", () => {
  // The cell boundary itself: half of each neighbour, not one or the other.
  expect(skyConfidenceAt(checkerboard, 50, 25)).toBeCloseTo(0.5);
  expect(skyConfidenceAt(checkerboard, 50, 50)).toBeCloseTo(0.5);
  // And a point between the centres leans towards the nearer one.
  expect(skyConfidenceAt(checkerboard, 40, 25)).toBeCloseTo(0.7);
});

test("clamps out-of-range frame percentages to the edge cells", () => {
  expect(skyConfidenceAt(checkerboard, -50, -50)).toBeCloseTo(1);
  expect(skyConfidenceAt(checkerboard, 150, 150)).toBeCloseTo(1);
  // 100% must land in the last column, not one past it.
  expect(skyConfidenceAt(checkerboard, 100, 100)).toBeCloseTo(1);
});

test("reports no confidence at all for an empty mask", () => {
  expect(skyConfidenceAt({ columns: 1, rows: 1, confidence: [] }, 50, 50)).toBe(0);
});

test("reports the fraction of the frame that is open sky", () => {
  expect(skyCoverage(checkerboard)).toBe(0.5);
  expect(skyCoverage({ columns: 1, rows: 1, confidence: [] })).toBe(0);
});

test("bilinear sampling interpolates and rejects out-of-bounds", () => {
  expect(sampleMask(checkerboard, 0, 0)).toBeCloseTo(1);
  expect(sampleMask(checkerboard, 0.5, 0)).toBeCloseTo(0.5);
  expect(sampleMask(checkerboard, 0.5, 0.5)).toBeCloseTo(0.5);
  expect(sampleMask(checkerboard, -0.1, 0)).toBeNull();
  expect(sampleMask(checkerboard, 0, 1.1)).toBeNull();
});

/**
 * A mask carrying sub-cell detail for one cell, built the way `coarsen` builds
 * it: the cell is the mean of its sub-cells, and the block holds their
 * deviations from it.
 */
function refined(
  columns: number,
  rows: number,
  confidence: number[],
  cell: number,
  subCells: number[]
): SkyMask {
  const factor = Math.round(Math.sqrt(subCells.length));
  const mean = subCells.reduce((total, value) => total + value, 0) / subCells.length;
  const blockStart = new Int32Array(confidence.length).fill(-1);
  blockStart[cell] = 0;

  return {
    columns,
    rows,
    confidence: confidence.map((value, index) => (index === cell ? mean : value)),
    detail: { factor, blockStart, residuals: Float32Array.from(subCells.map((v) => v - mean)) }
  };
}

/**
 * Open sky with a branch through the right half of the second cell: exactly
 * what one cell cannot say on its own, since averaged over the cell it is the
 * lukewarm 0.5 that reads as thin haze rather than as wood.
 */
const branch = refined(4, 1, [1, 0, 1, 1], 1, [1, 0, 1, 0]);

describe("sub-cell detail at the sky's edge", () => {
  test("the cell's own centre still reads as the cell", () => {
    // The residuals of a block sum to zero and cancel at its centre, so
    // everything that reads a cell rather than a point is left alone.
    expect(branch.confidence[1]).toBeCloseTo(0.5);
    expect(skyConfidenceAt(branch, 37.5, 50)).toBeCloseTo(0.5);
  });

  test("inside the cell, each side reads as what the model saw there", () => {
    // The two sub-cell centres, at 31.25% and 43.75% of the frame.
    expect(skyConfidenceAt(branch, 31.25, 50)).toBeGreaterThan(0.9);
    expect(skyConfidenceAt(branch, 43.75, 50)).toBeLessThan(0.2);

    // What the same mask says without its detail, and why this is worth the
    // trouble: the cell averages to thin haze, so both sides of the branch read
    // the same and a satellite behind the wood is drawn as if in the clear.
    const coarse = { columns: 4, rows: 1, confidence: branch.confidence };
    expect(skyConfidenceAt(coarse, 31.25, 50)).toBeCloseTo(0.625);
    expect(skyConfidenceAt(coarse, 43.75, 50)).toBeCloseTo(0.625);
  });

  test("the reading is still continuous across a refined cell's border", () => {
    // A marker crossing out of a refined cell must not step: stepping is what
    // makes it blink, which is the whole reason this is interpolated at all.
    const border = 1.5;
    const inside = sampleMask(branch, border - 0.002, 0) ?? 0;
    const outside = sampleMask(branch, border + 0.002, 0) ?? 0;
    expect(Math.abs(inside - outside)).toBeLessThan(0.01);
  });

  test("a sample can never leave [0, 1] however sharp the detail is", () => {
    for (let x = 0; x <= 3; x += 0.05) {
      const value = sampleMask(branch, x, 0) ?? 0;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("counts and exposes the refined cells for the debug panel", () => {
    expect(refinedCellCount(branch)).toBe(1);
    expect(refinedCellCount(checkerboard)).toBe(0);

    expect(fineGrid(branch)).toEqual({ columns: 8, rows: 2, factor: 2 });
    expect(fineGrid(checkerboard)).toEqual({ columns: 2, rows: 2, factor: 1 });

    // The refined cell's two halves, and a neighbour that carries no block and
    // so repeats its own value.
    expect(fineConfidence(branch, 2, 0)).toBeCloseTo(1);
    expect(fineConfidence(branch, 3, 0)).toBeCloseTo(0);
    expect(fineConfidence(branch, 0, 0)).toBeCloseTo(1);
  });

  test("scales a block with its cell, keeping the cell the mean of its inside", () => {
    const dimmed = { ...branch, detail: scaledDetail(branch, (cell) => (cell === 1 ? 0.5 : 1)) };
    const halved = { ...dimmed, confidence: branch.confidence.map((v, i) => (i === 1 ? v * 0.5 : v)) };

    expect(fineConfidence(halved, 2, 0)).toBeCloseTo(0.5);
    expect(fineConfidence(halved, 3, 0)).toBeCloseTo(0);
    // Still the mean of its sub-cells: 0.5 * (1 + 0) / 2.
    expect(halved.confidence[1]).toBeCloseTo(0.25);
  });
});
