import { CameraAttitude } from "../camera/attitude";
import { FrameLens } from "../camera/projection";
import { BRIGHT_BACKDROP, SKY_MASK_MAX_AGE_SECONDS } from "../constants";
import { EnuPosition } from "../types";
import { skyProbe } from "./anchoredMask";
import { SkyMask } from "./skyMask";
import { FramePixels } from "./skySegmenter";
import { Size } from "./skySegmentation";

/**
 * How bright the picture is behind the marks.
 *
 * At night a mark is drawn as light with no edge (`MarkerPalette.edge`), which
 * is right against a dark sky and wrong against anything as bright as the mark
 * itself: over the moon, a street lamp or a floodlit cloud a white point with a
 * white glow is simply gone. What decides it is the picture, not the sun, so it
 * is read off the picture — the frame the sky segmentation has already
 * captured, so it costs no capture of its own, only a pass over pixels that are
 * already sitting in JavaScript.
 *
 * Carried like the mask is: a grid over the frame together with where the camera
 * was aimed when it was taken, and read by a satellite's *direction* rather than
 * by where its mark is on screen now. A second after the shutter the phone has
 * moved, and a lamp read at the screen position a mark has reached would be a
 * lamp somewhere it no longer is. See `AnchoredSkyMask`.
 */
export type BackdropBrightness = {
  /**
   * The brightness grid, in the mask's own shape so it can be read the way a
   * mask is: `confidence` holds each cell's brightness in `[0, 1]` rather than
   * a probability of sky.
   */
  grid: SkyMask;
  /** Where the camera was aimed when the frame behind it was captured. */
  attitude: CameraAttitude;
  /** When that was, in `performance.now()` seconds. */
  capturedAtSeconds: number;
};

/**
 * A frame's brightness as a coarse grid, `BRIGHT_BACKDROP.cellPx` on a side.
 *
 * Per pixel, the largest of the three channels, for the reason
 * `brightBodies` gives: a warm lamp saturates red long before its luma says so.
 * Per cell, the brightest of its four quarters' means — a lamp a few pixels
 * across is the thing to catch, and a plain mean over the whole cell would
 * average it into the night around it, while a single hot pixel is still
 * averaged away inside its quarter.
 */
export function brightnessGrid(
  frame: FramePixels,
  size: Size,
  cellPx: number = BRIGHT_BACKDROP.cellPx
): SkyMask {
  const { pixels, channels } = frame;
  const plane = size.width * size.height;
  if (pixels.length < plane * channels) {
    throw new Error(
      `Backdrop brightness expected ${plane * channels} bytes for ${size.width}x${size.height}, got ${pixels.length}`
    );
  }

  const columns = Math.max(1, Math.round(size.width / cellPx));
  const rows = Math.max(1, Math.round(size.height / cellPx));
  // Quarters rather than cells are summed, and the cell takes the brightest.
  const sums = new Float64Array(columns * 2 * rows * 2);
  const counts = new Uint32Array(sums.length);
  const quarterWidth = size.width / (columns * 2);
  const quarterHeight = size.height / (rows * 2);

  for (let y = 0; y < size.height; y += 1) {
    const quarterRow = Math.min(rows * 2 - 1, Math.floor(y / quarterHeight));
    for (let x = 0; x < size.width; x += 1) {
      const quarterColumn = Math.min(columns * 2 - 1, Math.floor(x / quarterWidth));
      const base = (y * size.width + x) * channels;
      const red = pixels[base];
      const green = pixels[base + 1];
      const blue = pixels[base + 2];
      const quarter = quarterRow * columns * 2 + quarterColumn;
      sums[quarter] += red > green ? (red > blue ? red : blue) : green > blue ? green : blue;
      counts[quarter] += 1;
    }
  }

  const confidence = new Array<number>(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let brightest = 0;
      for (let quarterRow = row * 2; quarterRow < row * 2 + 2; quarterRow += 1) {
        for (let quarterColumn = column * 2; quarterColumn < column * 2 + 2; quarterColumn += 1) {
          const quarter = quarterRow * columns * 2 + quarterColumn;
          if (counts[quarter] > 0) brightest = Math.max(brightest, sums[quarter] / counts[quarter]);
        }
      }
      confidence[row * columns + column] = brightest / 255;
    }
  }

  return { columns, rows, confidence };
}

/**
 * Reads the backdrop in world directions, the way `skyProbe` reads a mask:
 * the brightness behind a direction in `[0, 1]`, or `null` where it falls
 * outside the frame the grid was taken from.
 *
 * `null` for the whole probe when the grid has gone stale, for the reason a
 * stale mask is dropped: a picture of where the lamps were several seconds ago
 * is not a picture of anything.
 */
export function backdropProbe(
  backdrop: BackdropBrightness | null,
  lens: FrameLens,
  nowSeconds: number
): ((position: EnuPosition) => number | null) | null {
  if (!backdrop || nowSeconds - backdrop.capturedAtSeconds > SKY_MASK_MAX_AGE_SECONDS) return null;
  return skyProbe({ mask: backdrop.grid, attitude: backdrop.attitude }, lens);
}
