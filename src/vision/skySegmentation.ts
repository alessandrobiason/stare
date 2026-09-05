import { SKY_CONFIDENCE_THRESHOLD } from "../constants";
import { SkyMask, SkyMaskDetail } from "./skyMask";

/**
 * The frame-independent half of sky segmentation: how a camera frame is turned
 * into the network's input, and how the network's logits are turned back into a
 * `SkyMask`.
 *
 * Free of any runtime, canvas or camera, so the arithmetic that decides what the
 * model sees — and what the occlusion test is later asked — can be checked
 * without a browser or a phone. The platform halves live in `skySegmenter.ts`.
 */

/** Output channel order of SkyWater-Seg. */
export const CLASS_COUNT = 4;
export const SKY_CLASS = 1;

/** The normalization the model was trained with (ImageNet, per its config). */
const MEAN = [0.485, 0.456, 0.406];
const STANDARD_DEVIATION = [0.229, 0.224, 0.225];

export type Size = { width: number; height: number };

export type MaskGrid = { columns: number; rows: number };

/**
 * Pixels one inference is allowed to cover.
 *
 * The model takes any size — its ONNX graph declares both spatial axes dynamic —
 * so the only thing fixing this figure is the time a pass costs, which is
 * proportional to it. 288x512 is what a 384x384 square cost before, because a
 * square input spent 44% of itself on the black bars a portrait frame has to be
 * letterboxed with. Measured against the model's own best effort on this
 * recording, the same budget spent on the frame instead of on bars moves
 * agreement from 0.86 to 0.93 IoU.
 */
const MODEL_PIXEL_BUDGET = 288 * 512;

/**
 * Both input sides are rounded to this. SegFormer's encoder reduces by 4, 8, 16
 * and 32, so a multiple of 32 is the largest stride that divides evenly and the
 * decoder's upsample lands back on the input grid exactly.
 */
const SIZE_MULTIPLE = 32;
const MINIMUM_SIDE = 96;

/**
 * Cells in the mask grid.
 *
 * The grid is what the occlusion test actually reads, so its cells are what a
 * marker's fate is decided by. Cells are kept square in *angle* rather than in
 * count: an even split of a portrait frame into more rows than columns. The
 * 48x32 landscape grid this replaces put 0.77 x 1.92 degree cells over a
 * portrait frame — nearly three times coarser down the frame than across it,
 * and down the frame is where the roofline is.
 */
const MASK_CELL_BUDGET = 3600;

/**
 * How much finer the mask is made where sky meets not-sky
 * (`SkyMaskDetail`). Two, and that is the model's number rather than a taste.
 *
 * SegFormer's decode head predicts at a quarter of the input and the graph
 * upsamples from there, so on the 288x512 input a portrait frame is given, what
 * the network actually decided is a 72x128 field — against a 45x80 mask grid.
 * Splitting the edge cells in two carries them at an effective 90x160, which
 * covers that field with a little to spare. A third step would interpolate the
 * upsample rather than recover anything the model saw, at four times the
 * residuals to store and blend.
 */
const DETAIL_FACTOR = 2;

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/**
 * What size to hand the network for a frame of this shape: the frame's own
 * aspect ratio, scaled to the pixel budget.
 *
 * Nothing is letterboxed and nothing is stretched. Bars would spend the budget
 * on black and put a hard artificial edge next to the picture; stretching would
 * show the model a scene of the wrong shape, and it was trained on square crops
 * of undistorted ones.
 */
export function modelInputSize(frame: Size): Size {
  if (!(frame.width > 0) || !(frame.height > 0)) {
    throw new Error("Sky segmentation received a frame with no size");
  }

  const aspect = frame.width / frame.height;
  return {
    width: Math.max(MINIMUM_SIDE, roundToMultiple(Math.sqrt(MODEL_PIXEL_BUDGET * aspect), SIZE_MULTIPLE)),
    height: Math.max(MINIMUM_SIDE, roundToMultiple(Math.sqrt(MODEL_PIXEL_BUDGET / aspect), SIZE_MULTIPLE))
  };
}

/** The mask grid for a frame of this shape: cells as square as the budget allows. */
export function maskGridFor(frame: Size): MaskGrid {
  if (!(frame.width > 0) || !(frame.height > 0)) {
    throw new Error("Sky segmentation received a frame with no size");
  }

  const aspect = frame.width / frame.height;
  return {
    columns: Math.max(2, Math.round(Math.sqrt(MASK_CELL_BUDGET * aspect))),
    rows: Math.max(2, Math.round(Math.sqrt(MASK_CELL_BUDGET / aspect)))
  };
}

/**
 * Converts interleaved 8-bit pixels, already at the model's input size, into the
 * normalized planar (CHW) float tensor the network expects.
 *
 * `channels` is 3 or 4 so both a canvas's RGBA and a decoded JPEG's RGB can be
 * passed without a copy in between; the alpha channel is ignored either way.
 */
export function toModelTensor(
  pixels: Uint8Array | Uint8ClampedArray,
  size: Size,
  channels: 3 | 4
): Float32Array {
  const plane = size.width * size.height;
  if (pixels.length < plane * channels) {
    throw new Error(
      `Sky segmentation expected ${plane * channels} bytes for ${size.width}x${size.height}, got ${pixels.length}`
    );
  }

  const data = new Float32Array(3 * plane);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[channel * plane + pixel] =
        (pixels[pixel * channels + channel] / 255 - MEAN[channel]) / STANDARD_DEVIATION[channel];
    }
  }
  return data;
}

/** Softmax over the class logits at one pixel, returning the sky probability. */
function skyProbability(logits: Float32Array, plane: number, pixel: number): number {
  let maximum = -Infinity;
  for (let klass = 0; klass < CLASS_COUNT; klass += 1) {
    maximum = Math.max(maximum, logits[klass * plane + pixel]);
  }

  let total = 0;
  for (let klass = 0; klass < CLASS_COUNT; klass += 1) {
    total += Math.exp(logits[klass * plane + pixel] - maximum);
  }

  return Math.exp(logits[SKY_CLASS * plane + pixel] - maximum) / total;
}

/** Cell boundaries that tile `extent` exactly: no gaps, no overlaps, none empty. */
function boundary(index: number, count: number, extent: number): number {
  return Math.min(extent, Math.floor((index * extent) / count));
}

/**
 * Average-pools the per-pixel sky probabilities down to the mask grid, keeping
 * sub-cell detail for the cells the sky's edge runs through.
 *
 * The average of the probabilities rather than the fraction of pixels over a
 * threshold: a cell that straddles a roofline should read as the half-open thing
 * it is, so the confidence the occlusion test compares means something in
 * between as well as at the ends.
 *
 * But half-open is all a single cell can say, and over a tree that is not
 * enough: a canopy is gaps as much as it is branches, and averaged to a cell a
 * degree and a half across, both come back as the same lukewarm number a metre
 * of solid trunk does. So the pooling happens on a grid `DETAIL_FACTOR` times
 * finer and is averaged down from there, which costs nothing — the same pixels
 * are visited either way — and the sub-cells are then kept for the cells whose
 * answer they change. `SkyMaskDetail` is what that is for.
 */
export function poolSkyLogits(
  logits: Float32Array,
  input: Size,
  grid: MaskGrid
): SkyMask {
  const plane = input.width * input.height;
  if (logits.length < CLASS_COUNT * plane) {
    throw new Error(
      `Sky segmentation expected ${CLASS_COUNT * plane} logits for ${input.width}x${input.height}, got ${logits.length}`
    );
  }

  const factor = detailFactor(input, grid);
  const fineColumns = grid.columns * factor;
  const fineRows = grid.rows * factor;
  const fine = new Float64Array(fineColumns * fineRows);

  for (let row = 0; row < fineRows; row += 1) {
    const startY = boundary(row, fineRows, input.height);
    const endY = Math.max(startY + 1, boundary(row + 1, fineRows, input.height));

    for (let column = 0; column < fineColumns; column += 1) {
      const startX = boundary(column, fineColumns, input.width);
      const endX = Math.max(startX + 1, boundary(column + 1, fineColumns, input.width));

      let sum = 0;
      let pixels = 0;
      for (let y = startY; y < endY && y < input.height; y += 1) {
        for (let x = startX; x < endX && x < input.width; x += 1) {
          sum += skyProbability(logits, plane, y * input.width + x);
          pixels += 1;
        }
      }
      fine[row * fineColumns + column] = pixels ? sum / pixels : 0;
    }
  }

  return coarsen(fine, grid, factor);
}

/**
 * How many sub-cells a cell is worth splitting into, given how many model
 * pixels it covers.
 *
 * `DETAIL_FACTOR` normally, but never finer than one pixel a sub-cell: on a
 * frame small enough that the grid is already at the model's resolution there
 * is nothing under a cell to split, and the boundaries would start landing on
 * the same pixel and reporting it as structure.
 */
function detailFactor(input: Size, grid: MaskGrid): number {
  return Math.max(
    1,
    Math.min(
      DETAIL_FACTOR,
      Math.floor(input.width / grid.columns),
      Math.floor(input.height / grid.rows)
    )
  );
}

/**
 * Averages the sub-cell field down to the mask grid, keeping the sub-cells of
 * the cells an edge runs through.
 *
 * The cell is the mean of its sub-cells rather than a separate average over its
 * pixels, so that the two always agree: a sub-cell's confidence is its cell's
 * plus its residual, and nothing downstream can read a cell and its inside as
 * saying different things about the same sky.
 *
 * Which cells are kept is a question about the sky, not about the numbers. A
 * cell whose sub-cells all sit on one side of `SKY_CONFIDENCE_THRESHOLD` has no
 * edge in it: the occlusion test would answer the same everywhere inside it
 * with the detail as without, so the detail is dropped rather than stored and
 * blended for the rest of the mask's life. What is left is the outline of the
 * skyline — the branches, the roof, the crane — a few hundred cells rather than
 * the few thousand refining everything would cost.
 */
function coarsen(fine: Float64Array, grid: MaskGrid, factor: number): SkyMask {
  const perCell = factor * factor;
  const fineColumns = grid.columns * factor;
  const confidence = new Array<number>(grid.columns * grid.rows);
  const blockStart = new Int32Array(grid.columns * grid.rows).fill(-1);
  const residuals: number[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      let sum = 0;
      let lowest = Infinity;
      let highest = -Infinity;
      for (let subRow = 0; subRow < factor; subRow += 1) {
        for (let subColumn = 0; subColumn < factor; subColumn += 1) {
          const value = fine[(row * factor + subRow) * fineColumns + column * factor + subColumn];
          sum += value;
          if (value < lowest) lowest = value;
          if (value > highest) highest = value;
        }
      }

      const cell = row * grid.columns + column;
      const mean = sum / perCell;
      confidence[cell] = mean;
      if (lowest >= SKY_CONFIDENCE_THRESHOLD || highest < SKY_CONFIDENCE_THRESHOLD) continue;

      blockStart[cell] = residuals.length;
      for (let subRow = 0; subRow < factor; subRow += 1) {
        for (let subColumn = 0; subColumn < factor; subColumn += 1) {
          residuals.push(
            fine[(row * factor + subRow) * fineColumns + column * factor + subColumn] - mean
          );
        }
      }
    }
  }

  const detail: SkyMaskDetail | undefined = residuals.length
    ? { factor, blockStart, residuals: Float32Array.from(residuals) }
    : undefined;

  return { columns: grid.columns, rows: grid.rows, confidence, detail };
}
