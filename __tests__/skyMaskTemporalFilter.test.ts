import { axesFromAttitude, CameraAttitude } from "../src/camera/attitude";
import { DEVICE_LENS, FrameLens, projectToFrame } from "../src/camera/projection";
import { EnuPosition } from "../src/types";
import { fineConfidence, SkyMask } from "../src/vision/skyMask";
import { SkyMaskTemporalFilter } from "../src/vision/skyMaskTemporalFilter";

const mask = (confidence: number[]) => ({ columns: 2, rows: 1, confidence });

const still = { gyroRadPerSecond: { x: 0, y: 0, z: 0 } };

test("stabilizes a nearly static sequence", () => {
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  filter.update(mask([1, 0]), { timestampSeconds: 0, ...still });
  const result = filter.update(mask([0, 1]), { timestampSeconds: 1, ...still });

  expect(result.confidence[0]).toBeGreaterThan(0);
  expect(result.confidence[1]).toBeLessThan(1);
});

test("does not blend an old mask during a fast pan or after a seek", () => {
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  filter.update(mask([1, 0]), { timestampSeconds: 1, ...still });
  const fast = filter.update(mask([0, 1]), {
    timestampSeconds: 2,
    gyroRadPerSecond: { x: 2, y: 0, z: 0 }
  });
  expect(fast.confidence).toEqual([0, 1]);

  const seek = filter.update(mask([1, 0]), { timestampSeconds: 0.5, ...still });
  expect(seek.confidence).toEqual([1, 0]);
});

test("a grid of a different shape replaces the prior instead of warping into it", () => {
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  filter.update(mask([1, 0]), { timestampSeconds: 0, ...still });
  const regridded = filter.update({ columns: 3, rows: 1, confidence: [0, 0, 0] }, {
    timestampSeconds: 1,
    ...still
  });

  expect(regridded.confidence).toEqual([0, 0, 0]);
});

/** A mask of `columns` x `rows` cells, clear everywhere but the named cell. */
function marked(columns: number, rows: number, column: number, row: number): SkyMask {
  const confidence = new Array<number>(columns * rows).fill(0);
  confidence[row * columns + column] = 1;
  return { columns, rows, confidence };
}

const blank = (columns: number, rows: number): SkyMask => ({
  columns,
  rows,
  confidence: new Array<number>(columns * rows).fill(0)
});

function peak(mask: SkyMask): { column: number; row: number } {
  const index = mask.confidence.indexOf(Math.max(...mask.confidence));
  return { column: index % mask.columns, row: Math.floor(index / mask.columns) };
}

/**
 * Where a cell of the previous mask ends up in the current frame, worked out
 * independently of the filter: the direction that cell's centre looked along,
 * put through the projection the markers themselves are placed with.
 *
 * This is the whole point of the test. The filter is supposed to move the prior
 * exactly as the scene moves, and the scene's motion is defined by
 * `projectToFrame` — so anything that disagrees with this oracle is drawing the
 * mask somewhere the picture is not.
 */
function projectedCell(
  grid: SkyMask,
  lens: FrameLens,
  from: CameraAttitude,
  to: CameraAttitude,
  cell: { column: number; row: number }
): { column: number; row: number } {
  const axes = axesFromAttitude(from);
  const horizontal = ((2 * (cell.column + 0.5)) / grid.columns - 1) * lens.horizontalScale;
  const vertical = (1 - (2 * (cell.row + 0.5)) / grid.rows) * lens.verticalScale;
  const direction: EnuPosition = {
    east: axes.forward.east + axes.right.east * horizontal + axes.up.east * vertical,
    north: axes.forward.north + axes.right.north * horizontal + axes.up.north * vertical,
    up: axes.forward.up + axes.right.up * horizontal + axes.up.up * vertical
  };

  const point = projectToFrame(direction, to, lens);
  if (!point) throw new Error("the test's own marked cell left the frame");
  return {
    column: Math.floor((point.left / 100) * grid.columns),
    row: Math.floor((point.top / 100) * grid.rows)
  };
}

/**
 * Warps `marked` from `from` to `to` and checks it lands where the projection
 * says it should.
 *
 * One cell of tolerance in each axis: the filter resamples the prior bilinearly,
 * so a source landing between two cells spreads across both and the brighter of
 * the pair is a rounding decision. The errors this is guarding against are whole
 * fractions of the frame, not single cells.
 */
function expectWarpMatchesProjection(
  columns: number,
  rows: number,
  cell: { column: number; row: number },
  from: CameraAttitude,
  to: CameraAttitude,
  lens: FrameLens = DEVICE_LENS
): void {
  const filter = new SkyMaskTemporalFilter(lens);
  const grid = marked(columns, rows, cell.column, cell.row);

  filter.update(grid, { timestampSeconds: 0, ...attitudeSample(from), ...still });
  const blended = filter.update(blank(columns, rows), {
    timestampSeconds: 1,
    ...attitudeSample(to),
    ...still
  });

  const expected = projectedCell(grid, lens, from, to, cell);
  const actual = peak(blended);

  expect(Math.abs(actual.column - expected.column)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.row - expected.row)).toBeLessThanOrEqual(1);
}

const attitudeSample = (attitude: CameraAttitude) => ({
  headingDeg: attitude.headingDeg,
  pitchDeg: attitude.pitchDeg,
  rollDeg: attitude.rollDeg
});

const level = (headingDeg: number, pitchDeg = 0, rollDeg = 0): CameraAttitude => ({
  headingDeg,
  pitchDeg,
  rollDeg
});

test("turning right carries the prior across to the left", () => {
  // The camera turns right, so the scene — and the mask of it — slides left.
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  filter.update(marked(10, 1, 4, 0), { timestampSeconds: 0, ...attitudeSample(level(0)), ...still });
  const blended = filter.update(blank(10, 1), {
    timestampSeconds: 1,
    ...attitudeSample(level(4)),
    ...still
  });

  expect(peak(blended).column).toBeLessThan(4);
});

test("tilting up carries the prior down the frame", () => {
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  filter.update(marked(1, 8, 0, 3), { timestampSeconds: 0, ...attitudeSample(level(0)), ...still });
  const blended = filter.update(blank(1, 8), {
    timestampSeconds: 1,
    ...attitudeSample(level(0, 6)),
    ...still
  });

  expect(peak(blended).row).toBeGreaterThan(3);
});

describe("the warp agrees with the projection the markers use", () => {
  // A grid of the shape the segmenter actually produces for the replay's frame.
  const COLUMNS = 45;
  const ROWS = 80;

  test("on a yaw, away from the centre line where a linear shift is right", () => {
    expectWarpMatchesProjection(COLUMNS, ROWS, { column: 40, row: 12 }, level(0), level(6));
  });

  test("on a pitch, high up the frame", () => {
    expectWarpMatchesProjection(COLUMNS, ROWS, { column: 22, row: 8 }, level(0, 20), level(0, 26));
  });

  test("on a roll, out at the corner", () => {
    // The case the previous implementation got badly wrong: it rotated in cell
    // coordinates, where a cell was far taller than it was wide, so a corner of
    // the prior was thrown degrees away from the sky it belonged to.
    // Not the very corner: a roll swings it clean out of a frame this tall.
    expectWarpMatchesProjection(COLUMNS, ROWS, { column: 38, row: 62 }, level(0), level(0, 0, 8));
  });

  test("on all three at once", () => {
    expectWarpMatchesProjection(
      COLUMNS,
      ROWS,
      { column: 9, row: 60 },
      level(350, 12, -8),
      level(356, 18, 4)
    );
  });

  test("with cells far from square, which is what broke roll before", () => {
    expectWarpMatchesProjection(16, 96, { column: 13, row: 80 }, level(0), level(0, 0, 12));
  });
});

test("sky that was not in the last frame keeps the new mask's own value", () => {
  // Turn far enough that the two frames barely overlap: the cells that are new
  // have no prior to blend and must be left exactly as the model saw them.
  const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
  const columns = 20;
  filter.update(marked(columns, 1, 10, 0), {
    timestampSeconds: 0,
    ...attitudeSample(level(0)),
    ...still
  });

  const fresh: SkyMask = { columns, rows: 1, confidence: new Array<number>(columns).fill(0.7) };
  const blended = filter.update(fresh, {
    timestampSeconds: 1,
    ...attitudeSample(level(34)),
    ...still
  });

  // A 37-degree frame turned 34 degrees: the leading edge is sky never seen.
  expect(blended.confidence[columns - 1]).toBeCloseTo(0.7, 6);
});

describe("sub-cell detail through the blend", () => {
  const COLUMNS = 9;
  const ROWS = 3;
  /** The middle cell of the grid, well inside the frame. */
  const CELL = 1 * COLUMNS + 4;

  /**
   * A grid of open sky with a hard edge down the middle of one cell: sky on the
   * left of it, a branch on the right.
   */
  function branchInCell(): SkyMask {
    const blockStart = new Int32Array(COLUMNS * ROWS).fill(-1);
    blockStart[CELL] = 0;
    return {
      columns: COLUMNS,
      rows: ROWS,
      confidence: new Array<number>(COLUMNS * ROWS).fill(1).map((v, i) => (i === CELL ? 0.5 : v)),
      detail: {
        factor: 2,
        blockStart,
        // Left sub-column sky, right sub-column branch, in both sub-rows.
        residuals: Float32Array.from([0.5, -0.5, 0.5, -0.5])
      }
    };
  }

  const clear = (): SkyMask => ({
    columns: COLUMNS,
    rows: ROWS,
    confidence: new Array<number>(COLUMNS * ROWS).fill(1)
  });

  /** The four sub-cells of `CELL`, as absolute confidences. */
  const inside = (mask: SkyMask): number[] => [
    fineConfidence(mask, 8, 2),
    fineConfidence(mask, 9, 2),
    fineConfidence(mask, 8, 3),
    fineConfidence(mask, 9, 3)
  ];

  const attitude = { ...attitudeSample(level(0)), ...still };

  test("a still camera holds the edge rather than averaging it away", () => {
    // Two passes agreeing about a branch. A filter that reused one prior for the
    // whole cell would pull both sub-cells towards the cell's own 0.5, smoothing
    // out the very edge this exists to hold steady.
    const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
    filter.update(branchInCell(), { timestampSeconds: 0, ...attitude });
    const blended = filter.update(branchInCell(), { timestampSeconds: 1, ...attitude });

    // Not to the last decimal: the prior is resampled at each sub-cell's own
    // direction, and a bilinear read a sub-cell wide borrows a little from the
    // sky next door. A few percent of softening a pass is the cost of carrying
    // the edge at all, against the 45% the cell's own value would blur it by.
    const [sky, branch] = inside(blended);
    expect(sky).toBeGreaterThan(0.9);
    expect(branch).toBeLessThan(0.1);
    expect(blended.confidence[CELL]).toBeCloseTo(0.5, 1);
  });

  test("a cell and its inside move together when the prior disagrees", () => {
    // The filter may move a refined cell — that is its job — but the cell has to
    // stay the mean of its sub-cells, or a marker at the cell's centre and one a
    // sub-cell away would be told contradictory things about the same sky.
    const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
    filter.update(clear(), { timestampSeconds: 0, ...attitude });
    const blended = filter.update(branchInCell(), { timestampSeconds: 1, ...attitude });

    const sub = inside(blended);
    expect(sub.reduce((total, value) => total + value, 0) / 4).toBeCloseTo(
      blended.confidence[CELL],
      5
    );
    // Pulled towards the clear prior, but nowhere near all the way to it, and
    // the branch is still the darker half of the cell.
    expect(blended.confidence[CELL]).toBeGreaterThan(0.5);
    expect(blended.confidence[CELL]).toBeLessThan(0.8);
    expect(sub[1]).toBeLessThan(sub[0]);
  });

  test("detail is dropped with the prior when the grid changes shape", () => {
    const filter = new SkyMaskTemporalFilter(DEVICE_LENS);
    filter.update(branchInCell(), { timestampSeconds: 0, ...attitude });
    const regridded = filter.update(
      { columns: 4, rows: 1, confidence: [1, 1, 1, 1] },
      { timestampSeconds: 1, ...attitude }
    );

    expect(regridded.detail).toBeUndefined();
    expect(regridded.confidence).toEqual([1, 1, 1, 1]);
  });
});
