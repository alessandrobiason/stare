import { clamp } from "../math/angles";
import { SKY_CONFIDENCE_THRESHOLD } from "../constants";

/**
 * Sub-cell confidences for the cells an edge between sky and not-sky runs
 * through, and only for those.
 *
 * The mask grid is a compromise: every cell costs a ray in the horizon prior
 * and a re-projection in the temporal filter, so it is sized for what those can
 * afford rather than for what the model actually resolved. That is fine over a
 * roof and fine over open sky — both are flat, and a finer grid there would
 * carry the same number twice — and it is the whole error at the boundary
 * between them, where one cell has to answer for a degree and a half of sky
 * that is half branch and half air.
 *
 * So the extra resolution is spent only there. A cell whose sub-cells fall on
 * both sides of `SKY_CONFIDENCE_THRESHOLD` keeps them; every other cell keeps
 * nothing, because its sub-cells could not change what the occlusion test
 * answers anywhere inside it. On a real frame that is the outline of the
 * skyline rather than the skyline's area — a few hundred cells of the few
 * thousand — which is what makes this affordable where refining everything is
 * not.
 *
 * Stored as deviations from the cell rather than as absolute confidences, so
 * that anything that scales or blends a cell — `applyHorizonPrior`,
 * `SkyMaskTemporalFilter` — carries its detail along by doing the same
 * arithmetic to it. Each block sums to zero, which keeps the cell's own value
 * exactly the mean of its sub-cells.
 */
export type SkyMaskDetail = {
  /** Sub-cells per cell along each axis: the detail grid is this times finer. */
  factor: number;
  /**
   * Where each cell's block of `factor * factor` residuals starts in
   * `residuals`, or -1 for a cell with no edge in it. Indexed like
   * `confidence`.
   */
  blockStart: Int32Array;
  /** Sub-cell confidence minus its cell's, row-major within each block. */
  residuals: Float32Array;
};

/**
 * A coarse grid of per-cell "this is open sky" probabilities covering the
 * camera frame, produced by `segmentSky` and smoothed by
 * `SkyMaskTemporalFilter`. `confidence` is row-major, `rows * columns` long.
 *
 * `detail` sharpens the cells the sky's edge crosses, and is absent from a mask
 * whose edge falls between cells rather than through them — a mask of nothing
 * but open sky, or one built by hand in a test.
 */
export type SkyMask = {
  columns: number;
  rows: number;
  confidence: number[];
  detail?: SkyMaskDetail;
};

export function cellIndex(mask: SkyMask, column: number, row: number): number {
  return row * mask.columns + column;
}

/** Fraction of the frame classified as sky, in `[0, 1]`. */
export function skyCoverage(mask: SkyMask, threshold = SKY_CONFIDENCE_THRESHOLD): number {
  if (mask.confidence.length === 0) return 0;
  const open = mask.confidence.filter((value) => value >= threshold).length;
  return open / mask.confidence.length;
}

/** How many cells carry sub-cell detail. For the debug panel and tests. */
export function refinedCellCount(mask: SkyMask): number {
  if (!mask.detail) return 0;
  let count = 0;
  for (const start of mask.detail.blockStart) if (start >= 0) count += 1;
  return count;
}

/** The finest grid this mask can be read at: its cells, times its detail factor. */
export function fineGrid(mask: SkyMask): { columns: number; rows: number; factor: number } {
  const factor = mask.detail?.factor ?? 1;
  return { columns: mask.columns * factor, rows: mask.rows * factor, factor };
}

/** The confidence stored for one sub-cell of `fineGrid`, edge detail included. */
export function fineConfidence(mask: SkyMask, column: number, row: number): number {
  const factor = mask.detail?.factor ?? 1;
  const cell = cellIndex(mask, Math.floor(column / factor), Math.floor(row / factor));
  return clamp(mask.confidence[cell] + residualAt(mask, column, row), 0, 1);
}

/**
 * `mask.detail` with every block multiplied by `scale` for its cell, or
 * `undefined` when there is none.
 *
 * Scaling a cell has to scale what it says about its own inside: a sub-cell's
 * confidence is the cell's plus its residual, so `k * (cell + residual)` is the
 * scaled cell plus `k * residual`, and the block still sums to zero.
 */
export function scaledDetail(
  mask: SkyMask,
  scale: (cell: number) => number
): SkyMaskDetail | undefined {
  const detail = mask.detail;
  if (!detail) return undefined;

  const perCell = detail.factor * detail.factor;
  const residuals = new Float32Array(detail.residuals.length);
  for (let cell = 0; cell < detail.blockStart.length; cell += 1) {
    const start = detail.blockStart[cell];
    if (start < 0) continue;
    const factor = scale(cell);
    for (let sub = 0; sub < perCell; sub += 1) {
      residuals[start + sub] = detail.residuals[start + sub] * factor;
    }
  }

  return { factor: detail.factor, blockStart: detail.blockStart, residuals };
}

/**
 * How confident the mask is that the frame position at (`xPercent`,
 * `yPercent`) — both 0-100, origin top-left — is open sky.
 *
 * A position in the mask's *own* frame, which is not the frame on screen once
 * the phone has moved: what hides satellites behind buildings and trees comes
 * in through `skyProbe`, which turns a direction in the sky into a position
 * here before asking. See `anchoredMask.ts`.
 *
 * Interpolated between cell centres rather than read from the cell the point
 * falls in. A cell is several degrees of sky across, and the nearest-cell
 * answer steps at its edges: a satellite tracking along a roof line crosses
 * those edges every few seconds and blinks each time, from the grid rather than
 * from anything in the picture. Positions outside the frame clamp to the
 * nearest edge cell.
 */
export function skyConfidenceAt(mask: SkyMask, xPercent: number, yPercent: number): number {
  if (mask.confidence.length === 0) return 0;
  const x = clamp((xPercent / 100) * mask.columns - 0.5, 0, mask.columns - 1);
  const y = clamp((yPercent / 100) * mask.rows - 0.5, 0, mask.rows - 1);
  return sampleMask(mask, x, y) ?? 0;
}

/** Bilinear sample of the mask in cell coordinates; `null` when out of bounds. */
export function sampleMask(mask: SkyMask, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x > mask.columns - 1 || y > mask.rows - 1) return null;

  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(left + 1, mask.columns - 1);
  const bottom = Math.min(top + 1, mask.rows - 1);
  const xWeight = x - left;
  const yWeight = y - top;

  const topValue =
    mask.confidence[cellIndex(mask, left, top)] * (1 - xWeight) +
    mask.confidence[cellIndex(mask, right, top)] * xWeight;
  const bottomValue =
    mask.confidence[cellIndex(mask, left, bottom)] * (1 - xWeight) +
    mask.confidence[cellIndex(mask, right, bottom)] * xWeight;

  return clamp(topValue * (1 - yWeight) + bottomValue * yWeight + detailAt(mask, x, y), 0, 1);
}

/**
 * What the sub-cell detail adds to the interpolated cell value at (`x`, `y`),
 * in cell coordinates. Zero wherever no cell nearby carries any.
 *
 * A correction on top of the smooth reading rather than a replacement for it,
 * and that is the point. Reading the detail grid directly would mean falling
 * back to the cell's own value across the whole of every unrefined cell, which
 * is the nearest-cell answer this sampler exists to avoid — the blinking would
 * come back everywhere the edge is not. Added, the detail is exactly zero where
 * there is none, so open sky and solid wall read as they always did, and near a
 * boundary it bends the reading towards what the model saw inside that cell.
 *
 * Bilinear over the same detail grid the residuals are stored on, with absent
 * blocks reading as zero, so the correction is continuous everywhere including
 * at the border of a refined cell: a marker crossing into one is not stepped.
 * At a cell's centre the surrounding residuals cancel and the reading is the
 * cell's own value, unchanged.
 */
function detailAt(mask: SkyMask, x: number, y: number): number {
  const detail = mask.detail;
  if (!detail) return 0;

  // Cell coordinates measure from cell centres; these measure from sub-cell
  // centres on the grid `factor` times finer, which is where residuals sit.
  const fineX = (x + 0.5) * detail.factor - 0.5;
  const fineY = (y + 0.5) * detail.factor - 0.5;

  const left = Math.floor(fineX);
  const top = Math.floor(fineY);
  const right = Math.min(left + 1, mask.columns * detail.factor - 1);
  const bottom = Math.min(top + 1, mask.rows * detail.factor - 1);
  const xWeight = fineX - left;
  const yWeight = fineY - top;

  const topValue =
    residualAt(mask, left, top) * (1 - xWeight) + residualAt(mask, right, top) * xWeight;
  const bottomValue =
    residualAt(mask, left, bottom) * (1 - xWeight) + residualAt(mask, right, bottom) * xWeight;

  return topValue * (1 - yWeight) + bottomValue * yWeight;
}

/** The residual stored for one sub-cell, or zero where its cell has no block. */
function residualAt(mask: SkyMask, column: number, row: number): number {
  const detail = mask.detail;
  if (!detail) return 0;

  const cell = cellIndex(mask, Math.floor(column / detail.factor), Math.floor(row / detail.factor));
  const start = detail.blockStart[cell];
  if (start < 0) return 0;

  return detail.residuals[
    start + (row % detail.factor) * detail.factor + (column % detail.factor)
  ];
}
