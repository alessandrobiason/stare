import { FramePixels } from "./skySegmenter";
import { Size } from "./skySegmentation";

/**
 * Whether a video frame and a still of the same moment are the same picture the
 * same way up.
 *
 * The phone's frames come from the video stream now rather than from stills
 * (`cameraFrameGrabber`), turned upright by native code that cannot be run
 * anywhere but on a phone. A frame turned the wrong way would not fail: it would
 * segment perfectly well and file the sky under the ground, with nothing on
 * screen saying so except markers vanishing. So the first frames are checked
 * against a still, which is the path the mask was built and verified on, and the
 * answer decides which of the two the app goes on reading.
 *
 * Coarse on purpose. The two are taken a moment apart, through different
 * processing, and a hand is holding the phone: what is compared is the layout of
 * light and dark across a small grid, correlated, for the frame as it is and
 * turned, mirrored and flipped. A picture with no layout to speak of — a blank
 * wall, open sky — correlates with everything or nothing, and is reported as
 * such rather than guessed at.
 */

export type FrameVerdict = "matches" | "turned" | "mirrored" | "flipped" | "inconclusive";

export type FrameAgreement = {
  /** Correlation of the video frame with the still as it is, in `[-1, 1]`. */
  upright: number;
  /** The same, with the video frame turned half round. */
  turned: number;
  /** Mirrored left to right. */
  mirrored: number;
  /** Mirrored top to bottom. */
  flipped: number;
  verdict: FrameVerdict;
};

/** Cells the thumbnails are averaged into, across and down. */
export const AGREEMENT_GRID = { columns: 16, rows: 22 };

/** The best correlation must reach this to say anything at all. */
const MINIMUM_CORRELATION = 0.5;
/** And beat the next best by this, or the picture could be any of them. */
const MINIMUM_MARGIN = 0.2;

export function frameAgreement(video: FramePixels, still: FramePixels, size: Size): FrameAgreement {
  const a = thumbnail(video, size);
  const b = thumbnail(still, size);
  const { columns, rows } = AGREEMENT_GRID;

  const transformed = (map: (column: number, row: number) => number) => {
    const out = new Float64Array(columns * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        out[row * columns + column] = a[map(column, row)];
      }
    }
    return out;
  };

  const scores = {
    matches: correlation(a, b),
    turned: correlation(transformed((c, r) => (rows - 1 - r) * columns + (columns - 1 - c)), b),
    mirrored: correlation(transformed((c, r) => r * columns + (columns - 1 - c)), b),
    flipped: correlation(transformed((c, r) => (rows - 1 - r) * columns + c), b)
  };

  const ranked = (Object.entries(scores) as [Exclude<FrameVerdict, "inconclusive">, number][]).sort(
    (one, other) => other[1] - one[1]
  );
  const [best, second] = ranked;
  const decisive = best[1] >= MINIMUM_CORRELATION && best[1] - second[1] >= MINIMUM_MARGIN;

  return {
    upright: scores.matches,
    turned: scores.turned,
    mirrored: scores.mirrored,
    flipped: scores.flipped,
    verdict: decisive ? best[0] : "inconclusive"
  };
}

/** Mean brightness per grid cell, as the largest of the three channels. */
function thumbnail({ pixels, channels }: FramePixels, size: Size): Float64Array {
  const { columns, rows } = AGREEMENT_GRID;
  const sums = new Float64Array(columns * rows);
  const counts = new Uint32Array(columns * rows);
  for (let y = 0; y < size.height; y += 1) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / size.height));
    for (let x = 0; x < size.width; x += 1) {
      const column = Math.min(columns - 1, Math.floor((x * columns) / size.width));
      const base = (y * size.width + x) * channels;
      const red = pixels[base];
      const green = pixels[base + 1];
      const blue = pixels[base + 2];
      sums[row * columns + column] += red > green ? (red > blue ? red : blue) : green > blue ? green : blue;
      counts[row * columns + column] += 1;
    }
  }
  for (let cell = 0; cell < sums.length; cell += 1) {
    sums[cell] = counts[cell] > 0 ? sums[cell] / counts[cell] : 0;
  }
  return sums;
}

/** Pearson correlation; zero where either side has no variation to correlate. */
function correlation(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  return varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : 0;
}
