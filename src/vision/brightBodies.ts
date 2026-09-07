import { FramePoint } from "../camera/projection";
import { FramePixels } from "./skySegmenter";
import { Size } from "./skySegmentation";

/**
 * Finding the brightest compact things in a camera frame — which, when one of
 * them is where the ephemeris says the sun is, is what tells the app which way
 * the phone is actually pointing (`src/fusion/celestialNorth.ts`).
 *
 * Deliberately not a detector of the sun, or of the moon, or of anything else.
 * It knows nothing about the sky, the time of day or where the phone is aimed:
 * it returns the few brightest blobs in the picture and says how big and how
 * bright each one was. Everything that decides whether one of them *is* a body
 * happens elsewhere, against the ephemeris and the attitude, because that is
 * where the evidence is. A street lamp and the moon are the same blob here, and
 * the thing that tells them apart is that one of them is at the elevation the
 * moon is at, which is not a question about pixels.
 *
 * Written out rather than taken from a library, and that is the one place in
 * this pipeline where that is the cheaper answer. The obvious candidate is
 * OpenCV — `react-native-fast-opencv` (MIT) is a real, maintained port and
 * would do this in three calls — but it links a prebuilt native binary on both
 * platforms, and what it would be linked for is a threshold, a flood fill and a
 * weighted mean over a 320x448 buffer that is already sitting in JavaScript
 * because `skySegmenter` put it there. That is a millisecond of arithmetic and
 * about a hundred lines. The ephemeris is the opposite trade and is a
 * dependency for exactly that reason: nobody should be writing VSOP87 by hand.
 *
 * Runs on the frame the sky segmentation already captured, so a sighting costs
 * no camera capture, no extra exposure and no battery beyond this arithmetic.
 */

/** One compact bright region of a frame. */
export type BrightBlob = {
  /** Intensity-weighted centroid, in percent of the frame from the top-left. */
  centre: FramePoint;
  /** Pixels the blob covers. */
  area: number;
  /**
   * Radius of a disc of the same area, in pixels of the frame it was found in.
   *
   * Area rather than the bounding box, because a bloom with a spike of lens
   * flare running out of it has a box half the frame wide and is still a disc.
   */
  radiusPx: number;
  /** Brightest pixel in the blob, 0 to 255. */
  peak: number;
  /**
   * Whether the blob runs into the edge of the frame.
   *
   * Fatal for a sighting even though the blob is perfectly real: half a sun has
   * its centroid in the wrong place, by up to its own radius, and nothing about
   * the blob says how much of it is missing.
   */
  clipped: boolean;
};

export type BrightBlobOptions = {
  /** How far below the frame's brightest pixel a blob still extends. */
  peakDropCounts: number;
  /** No blob may be dimmer than this at its peak. */
  minimumPeakLuminance: number;
  /** Nor smaller than this, in pixels. */
  minimumPixels: number;
  /** How many blobs to return, brightest and largest first. */
  limit: number;
};

/**
 * The brightest compact regions of `frame`, at most `limit` of them.
 *
 * Ordered by area within the threshold rather than by peak brightness: past
 * saturation every pixel reads 255 and the peak stops discriminating at exactly
 * the point a body is easiest to see, so what is left to rank by is size.
 *
 * Returns an empty list when nothing in the frame is bright enough to be a
 * body — an overcast sky, a lens cap, a night with the moon down. That is the
 * common case and it costs one pass over the pixels.
 */
export function brightBlobs(
  frame: FramePixels,
  size: Size,
  options: BrightBlobOptions
): BrightBlob[] {
  const { pixels, channels } = frame;
  const plane = size.width * size.height;
  if (pixels.length < plane * channels) {
    throw new Error(
      `Bright-body detection expected ${plane * channels} bytes for ${size.width}x${size.height}, got ${pixels.length}`
    );
  }

  const luminance = luminanceOf(pixels, plane, channels);

  let peak = 0;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    if (luminance[pixel] > peak) peak = luminance[pixel];
  }
  if (peak < options.minimumPeakLuminance) return [];

  const threshold = Math.max(peak - options.peakDropCounts, options.minimumPeakLuminance);

  // Above the threshold and unclaimed, or above it and already part of a blob.
  // A byte per pixel rather than a set, because the flood fill below tests
  // membership far more often than there are members.
  const state = new Uint8Array(plane);
  const bright: number[] = [];
  for (let pixel = 0; pixel < plane; pixel += 1) {
    if (luminance[pixel] >= threshold) {
      state[pixel] = UNCLAIMED;
      bright.push(pixel);
    }
  }

  const blobs: BrightBlob[] = [];
  for (let found = 0; found < options.limit; found += 1) {
    const seed = brightestUnclaimed(bright, luminance, state);
    if (seed === null) break;
    const blob = growFrom(seed, luminance, state, size, threshold);
    if (blob.area >= options.minimumPixels) blobs.push(blob);
  }

  return blobs.sort((a, b) => b.area - a.area);
}

/** Pixel states during the fill. Zero — below the threshold — is the fill value. */
const UNCLAIMED = 1;
const CLAIMED = 2;

/**
 * Per-pixel brightness as the largest of the three channels, not a luma.
 *
 * A luma would be the right answer for how bright something looks and the wrong
 * one here. What is being found is a sensor that has run out of headroom, and
 * it runs out per channel: a low sun through haze reads (255, 205, 130), fully
 * saturated in red and nowhere near it in the weighted sum, which puts the
 * brightest object in the sky forty counts below where a threshold expects it.
 * The maximum says what this is really asking — is any channel at the top —
 * and treats a warm sun, a white one and a blue-white moon alike.
 */
function luminanceOf(
  pixels: Uint8Array | Uint8ClampedArray,
  plane: number,
  channels: 3 | 4
): Uint8Array {
  const luminance = new Uint8Array(plane);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    const base = pixel * channels;
    const red = pixels[base];
    const green = pixels[base + 1];
    const blue = pixels[base + 2];
    luminance[pixel] = red > green ? (red > blue ? red : blue) : green > blue ? green : blue;
  }
  return luminance;
}

/** The brightest pixel not yet part of a blob, or `null` when none are left. */
function brightestUnclaimed(
  bright: number[],
  luminance: Uint8Array,
  state: Uint8Array
): number | null {
  let best: number | null = null;
  let bestLuminance = -1;
  for (const pixel of bright) {
    if (state[pixel] !== UNCLAIMED) continue;
    if (luminance[pixel] > bestLuminance) {
      bestLuminance = luminance[pixel];
      best = pixel;
    }
  }
  return best;
}

/**
 * Floods outwards from `seed` over everything above the threshold that touches
 * it, and measures what it covered.
 *
 * Eight-connected: a disc a few pixels across, resampled and then JPEG
 * compressed on the way here, has a ragged enough edge that four-connectivity
 * can shear a corner off it. Merging two lamps that touch diagonally is the
 * cost, and it is not one — a blob of two lamps fails the size and the
 * elevation gates the same way each of them would have.
 *
 * The centroid is weighted by how far each pixel stands above the threshold, so
 * a disc with a soft edge is placed by its core. On a saturated body every
 * weight is equal and this is the plain centroid of the saturated region, which
 * is the middle of the disc.
 */
function growFrom(
  seed: number,
  luminance: Uint8Array,
  state: Uint8Array,
  size: Size,
  threshold: number
): BrightBlob {
  const stack = [seed];
  state[seed] = CLAIMED;

  let area = 0;
  let weightTotal = 0;
  let weightedX = 0;
  let weightedY = 0;
  let peak = 0;
  let clipped = false;

  while (stack.length > 0) {
    const pixel = stack.pop() as number;
    const x = pixel % size.width;
    const y = (pixel - x) / size.width;

    // Plus one, so that a pixel sitting exactly on the threshold still counts
    // for something rather than dropping out of the mean it belongs to.
    const weight = luminance[pixel] - threshold + 1;
    area += 1;
    weightTotal += weight;
    weightedX += weight * (x + 0.5);
    weightedY += weight * (y + 0.5);
    if (luminance[pixel] > peak) peak = luminance[pixel];
    if (x === 0 || y === 0 || x === size.width - 1 || y === size.height - 1) clipped = true;

    for (let dy = -1; dy <= 1; dy += 1) {
      const neighbourY = y + dy;
      if (neighbourY < 0 || neighbourY >= size.height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbourX = x + dx;
        if (neighbourX < 0 || neighbourX >= size.width) continue;
        const neighbour = neighbourY * size.width + neighbourX;
        if (state[neighbour] !== UNCLAIMED) continue;
        state[neighbour] = CLAIMED;
        stack.push(neighbour);
      }
    }
  }

  return {
    centre: {
      left: ((weightedX / weightTotal) / size.width) * 100,
      top: ((weightedY / weightTotal) / size.height) * 100
    },
    area,
    radiusPx: Math.sqrt(area / Math.PI),
    peak,
    clipped
  };
}
