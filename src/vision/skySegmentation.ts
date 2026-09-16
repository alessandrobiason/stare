import { SKY_CONFIDENCE_THRESHOLD } from "../constants";
import { runSliced, runToEnd, SlicedJob, Slices } from "../timeSlice";
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
  return runToEnd(modelTensorJob(pixels, size, channels));
}

/**
 * `toModelTensor`, handing the thread back between rows.
 *
 * What the app runs. It is the first thing after the capture comes back, and
 * the capture's own decode has just held the thread too: run in one go the two
 * were a single stretch of frames the sky did not move on, every pass. Same
 * rows, same lookups, and so the same tensor to the bit.
 */
export function toModelTensorSliced(
  pixels: Uint8Array | Uint8ClampedArray,
  size: Size,
  channels: 3 | 4,
  slices: Slices
): Promise<Float32Array> {
  return runSliced(modelTensorJob(pixels, size, channels), slices);
}

function* modelTensorJob(
  pixels: Uint8Array | Uint8ClampedArray,
  size: Size,
  channels: 3 | 4
): SlicedJob<Float32Array> {
  const plane = size.width * size.height;
  if (pixels.length < plane * channels) {
    throw new Error(
      `Sky segmentation expected ${plane * channels} bytes for ${size.width}x${size.height}, got ${pixels.length}`
    );
  }

  const [red, green, blue] = normalizationTables();
  const data = new Float32Array(3 * plane);
  const redPlane = data.subarray(0, plane);
  const greenPlane = data.subarray(plane, 2 * plane);
  const bluePlane = data.subarray(2 * plane);
  for (let row = 0, pixel = 0, source = 0; row < size.height; row += 1) {
    for (const end = pixel + size.width; pixel < end; pixel += 1, source += channels) {
      redPlane[pixel] = red[pixels[source]];
      greenPlane[pixel] = green[pixels[source + 1]];
      bluePlane[pixel] = blue[pixels[source + 2]];
    }
    yield;
  }
  return data;
}

/**
 * What every 8-bit value of each channel normalizes to, worked out once.
 *
 * A pass is three divisions for every pixel of the model's input — over four
 * hundred thousand of them — of only 768 distinct values, and on the phone each
 * one was an interpreted division on the thread that draws the markers. Held as
 * float32, which is exactly what writing the computed double into the tensor
 * rounds it to, so a lookup is the same value to the bit.
 */
let normalization: readonly Float32Array[] | null = null;
function normalizationTables(): readonly Float32Array[] {
  if (normalization) return normalization;
  normalization = MEAN.map((mean, channel) => {
    const table = new Float32Array(256);
    for (let value = 0; value < 256; value += 1) {
      table[value] = (value / 255 - mean) / STANDARD_DEVIATION[channel];
    }
    return table;
  });
  return normalization;
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
  const pooling = startSkyPooling(logits, input, grid);
  for (let row = 0; row < pooling.rows; row += 1) pooling.poolRow(row);
  return pooling.finish();
}

/**
 * `poolSkyLogits`, a row of sub-cells at a time.
 *
 * A pass over every pixel of the model's output is the longest stretch of work
 * the segmentation puts on the JS thread, and that is the thread the markers are
 * drawn from: run in one go on the phone it is several frames of a frozen sky,
 * every time a mask lands. Split by row, a caller can hand the thread back
 * between rows (`startSlicing`) and the mask comes out the same — each sub-cell
 * is pooled from its own pixels, so when its row is pooled changes nothing.
 */
export type SkyPooling = {
  /** Rows of sub-cells, each of which has to be pooled before `finish`. */
  rows: number;
  poolRow(row: number): void;
  /** The mask, once every row has been pooled. */
  finish(): SkyMask;
};

export function startSkyPooling(logits: Float32Array, input: Size, grid: MaskGrid): SkyPooling {
  const { width, height } = input;
  const plane = width * height;
  if (logits.length < CLASS_COUNT * plane) {
    throw new Error(
      `Sky segmentation expected ${CLASS_COUNT * plane} logits for ${width}x${height}, got ${logits.length}`
    );
  }

  const factor = detailFactor(input, grid);
  const fineColumns = grid.columns * factor;
  const fineRows = grid.rows * factor;
  const fine = new Float64Array(fineColumns * fineRows);

  // The same span for a column on every row, so worked out once rather than
  // per sub-cell. Clamped to the image here instead of on every pixel.
  const startsX = new Int32Array(fineColumns);
  const endsX = new Int32Array(fineColumns);
  for (let column = 0; column < fineColumns; column += 1) {
    const startX = boundary(column, fineColumns, width);
    startsX[column] = startX;
    endsX[column] = Math.min(width, Math.max(startX + 1, boundary(column + 1, fineColumns, width)));
  }

  // SkyWater-Seg's four classes, one plane each (`CLASS_COUNT`), with sky the
  // second of them (`SKY_CLASS`).
  const first = logits.subarray(0, plane);
  const sky = logits.subarray(plane, 2 * plane);
  const third = logits.subarray(2 * plane, 3 * plane);
  const fourth = logits.subarray(3 * plane, 4 * plane);

  return {
    rows: fineRows,
    poolRow(row: number) {
      const startY = boundary(row, fineRows, height);
      const endY = Math.min(height, Math.max(startY + 1, boundary(row + 1, fineRows, height)));

      for (let column = 0; column < fineColumns; column += 1) {
        const startX = startsX[column];
        const endX = endsX[column];

        let sum = 0;
        let pixels = 0;
        for (let y = startY; y < endY; y += 1) {
          const end = y * width + endX;
          for (let pixel = y * width + startX; pixel < end; pixel += 1) {
            // The softmax's sky probability, unrolled: one call for the
            // largest logit and one exponential per class, summed in class
            // order. That order is what keeps the result identical to the bit
            // to the per-class loop this replaced, and the calls it saves are
            // most of what a pass cost in an interpreter.
            const skyLogit = sky[pixel];
            const maximum = Math.max(first[pixel], skyLogit, third[pixel], fourth[pixel]);
            const skyWeight = Math.exp(skyLogit - maximum);
            sum +=
              skyWeight /
              (Math.exp(first[pixel] - maximum) +
                skyWeight +
                Math.exp(third[pixel] - maximum) +
                Math.exp(fourth[pixel] - maximum));
            pixels += 1;
          }
        }
        fine[row * fineColumns + column] = pixels ? sum / pixels : 0;
      }
    },
    finish: () => coarsen(fine, grid, factor)
  };
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
