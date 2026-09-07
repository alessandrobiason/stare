import { brightBlobs, BrightBlobOptions } from "../src/vision/brightBodies";
import { FramePixels } from "../src/vision/skySegmenter";
import { Size } from "../src/vision/skySegmentation";

const SIZE: Size = { width: 64, height: 48 };

const OPTIONS: BrightBlobOptions = {
  peakDropCounts: 40,
  minimumPeakLuminance: 150,
  minimumPixels: 4,
  limit: 4
};

type Disc = { x: number; y: number; radius: number; colour: [number, number, number] };

/** An RGBA frame of `background`, with a filled disc painted for each entry. */
function frameWith(discs: Disc[], background: [number, number, number] = [10, 10, 20]): FramePixels {
  const pixels = new Uint8Array(SIZE.width * SIZE.height * 4);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      const base = (y * SIZE.width + x) * 4;
      let colour = background;
      for (const disc of discs) {
        if (Math.hypot(x + 0.5 - disc.x, y + 0.5 - disc.y) <= disc.radius) colour = disc.colour;
      }
      pixels[base] = colour[0];
      pixels[base + 1] = colour[1];
      pixels[base + 2] = colour[2];
      pixels[base + 3] = 255;
    }
  }
  return { pixels, channels: 4 };
}

const WHITE: [number, number, number] = [255, 255, 255];

test("a disc is found where it was painted", () => {
  const blobs = brightBlobs(
    frameWith([{ x: 20.5, y: 30.5, radius: 4, colour: WHITE }]),
    SIZE,
    OPTIONS
  );

  expect(blobs).toHaveLength(1);
  // In percent of the frame, which is what the projection is placed in.
  expect(blobs[0].centre.left).toBeCloseTo((20.5 / 64) * 100, 1);
  expect(blobs[0].centre.top).toBeCloseTo((30.5 / 48) * 100, 1);
  // A disc of radius 4 covers about 50 pixels, and the radius is recovered from
  // that area rather than from a bounding box.
  expect(blobs[0].radiusPx).toBeCloseTo(4, 0);
  expect(blobs[0].clipped).toBe(false);
});

test("nothing is reported for a frame with nothing bright in it", () => {
  expect(brightBlobs(frameWith([]), SIZE, OPTIONS)).toEqual([]);
  // A dim lamp is below the floor even though it is the brightest thing here,
  // which is what stops a night frame of streetlights offering four candidates.
  expect(
    brightBlobs(frameWith([{ x: 20, y: 20, radius: 4, colour: [120, 120, 120] }]), SIZE, OPTIONS)
  ).toEqual([]);
});

test("a blob running off the edge of the frame is marked, not dropped", () => {
  // Still returned, because the caller decides: the blob is perfectly real and
  // its centroid is the one thing about it that is wrong.
  const blobs = brightBlobs(frameWith([{ x: 1, y: 24, radius: 5, colour: WHITE }]), SIZE, OPTIONS);

  expect(blobs).toHaveLength(1);
  expect(blobs[0].clipped).toBe(true);
});

test("several blobs come back largest first", () => {
  const blobs = brightBlobs(
    frameWith([
      { x: 10.5, y: 10.5, radius: 2, colour: WHITE },
      { x: 45.5, y: 30.5, radius: 6, colour: WHITE },
      { x: 30.5, y: 40.5, radius: 3.5, colour: WHITE }
    ]),
    SIZE,
    OPTIONS
  );

  expect(blobs).toHaveLength(3);
  const radii = blobs.map((blob) => blob.radiusPx);
  expect(radii[0]).toBeGreaterThan(radii[1]);
  expect(radii[1]).toBeGreaterThan(radii[2]);
  expect(radii[0]).toBeCloseTo(6, 0);
  expect(radii[2]).toBeCloseTo(2, 0);
  // Ranked by area rather than by peak, because past saturation every one of
  // these reads 255 and the peak stops telling them apart.
  expect(blobs.map((blob) => blob.peak)).toEqual([255, 255, 255]);
  expect(blobs[0].centre.left).toBeCloseTo((45.5 / 64) * 100, 1);
});

test("only as many blobs as were asked for", () => {
  const discs: Disc[] = [8, 20, 32, 44, 56].map((x, index) => ({
    x: x + 0.5,
    y: 24.5,
    radius: 2 + index * 0.5,
    colour: WHITE
  }));
  expect(brightBlobs(frameWith(discs), SIZE, { ...OPTIONS, limit: 2 })).toHaveLength(2);
});

/**
 * The reason brightness is the largest channel and not a luma.
 *
 * A low sun through haze saturates red long before the weighted sum gets
 * anywhere near the top. Under a luma this disc reads 98 — below the floor, and
 * so invisible — while the sensor it came off has genuinely run out of headroom.
 */
test("a sun that has saturated only its red channel is still the brightest thing", () => {
  const blobs = brightBlobs(
    frameWith([{ x: 30.5, y: 20.5, radius: 5, colour: [255, 60, 20] }], [0, 0, 0]),
    SIZE,
    OPTIONS
  );

  expect(blobs).toHaveLength(1);
  expect(blobs[0].peak).toBe(255);
});

test("a bright pixel or two is not a body", () => {
  // Sensor noise and a dead pixel both look like this, and both would otherwise
  // be handed to the gates as a candidate with a perfectly precise centroid.
  expect(
    brightBlobs(frameWith([{ x: 30.5, y: 20.5, radius: 0.6, colour: WHITE }]), SIZE, OPTIONS)
  ).toEqual([]);
});

test("the centroid is pulled towards the core of a soft-edged disc", () => {
  // Two overlapping discs: a bright core off to one side of a dimmer halo. The
  // weighting is what keeps a bloom with a lopsided skirt from dragging the
  // centre off the body.
  const pixels = new Uint8Array(SIZE.width * SIZE.height * 4);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      const base = (y * SIZE.width + x) * 4;
      const halo = Math.hypot(x + 0.5 - 32, y + 0.5 - 24) <= 8;
      const core = Math.hypot(x + 0.5 - 30, y + 0.5 - 24) <= 3;
      const value = core ? 255 : halo ? 220 : 0;
      pixels[base] = value;
      pixels[base + 1] = value;
      pixels[base + 2] = value;
      pixels[base + 3] = 255;
    }
  }

  const [blob] = brightBlobs({ pixels, channels: 4 }, SIZE, OPTIONS);
  const centreX = (blob.centre.left / 100) * SIZE.width;
  // Between the halo's centre at 32 and the core's at 30, and on the core's side.
  expect(centreX).toBeGreaterThan(30);
  expect(centreX).toBeLessThan(32);
});

test("a frame too small for the pixels it claims is refused", () => {
  expect(() => brightBlobs({ pixels: new Uint8Array(16), channels: 4 }, SIZE, OPTIONS)).toThrow(
    /expected 12288 bytes/
  );
});
