import { CameraAttitude } from "../src/camera/attitude";
import { DEVICE_LENS } from "../src/camera/projection";
import { DEVICE_CAMERA_FIELD_OF_VIEW } from "../src/constants";
import { applyHorizonPrior, horizonSkyLimit } from "../src/vision/horizonPrior";
import { fineConfidence, SkyMask } from "../src/vision/skyMask";

const aim = (pitchDeg = 0, rollDeg = 0, headingDeg = 0): CameraAttitude => ({
  headingDeg,
  pitchDeg,
  rollDeg
});

/** A mask of the given shape with every cell fully confident it is sky. */
const openSky = (columns: number, rows: number): SkyMask => ({
  columns,
  rows,
  confidence: new Array(columns * rows).fill(1)
});

const HALF_VERTICAL_FOV = DEVICE_CAMERA_FIELD_OF_VIEW.verticalDeg / 2;

test("a level camera keeps the sky it is looking up at and clears the ground", () => {
  const { confidence } = applyHorizonPrior(openSky(1, 32), aim(), DEVICE_LENS);

  expect(confidence[0]).toBeCloseTo(1);
  expect(confidence[31]).toBeCloseTo(0);
  // Nothing lower in the frame may be more confident than what is above it.
  for (let row = 1; row < 32; row += 1) {
    expect(confidence[row]).toBeLessThanOrEqual(confidence[row - 1]);
  }
});

test("the horizon itself is left exactly on the classification threshold", () => {
  // An odd row count puts one row's centre on the frame's centre line, which a
  // level camera aims straight at the horizon.
  const { confidence } = applyHorizonPrior(openSky(1, 3), aim(), DEVICE_LENS);
  expect(confidence[1]).toBeCloseTo(0.5);
});

test("a camera looking well above the horizon is left untouched", () => {
  const mask = openSky(4, 4);
  // Clear of the taper even at the bottom edge of the frame.
  const raised = applyHorizonPrior(
    mask,
    aim(HALF_VERTICAL_FOV + DEVICE_CAMERA_FIELD_OF_VIEW.verticalDeg),
    DEVICE_LENS
  );
  expect(raised.confidence).toEqual(mask.confidence);
});

test("a camera looking at the ground keeps no sky at all", () => {
  const lowered = applyHorizonPrior(
    openSky(4, 4),
    aim(-HALF_VERTICAL_FOV - DEVICE_CAMERA_FIELD_OF_VIEW.verticalDeg),
    DEVICE_LENS
  );
  expect(lowered.confidence.every((value) => value === 0)).toBe(true);
});

test("roll tilts the horizon across the frame instead of along its rows", () => {
  // Rolled fully onto its side, the horizon runs vertically: with the camera's
  // right-hand side down, the right of the frame is the ground. Every row is
  // then the same, which is the whole point — the attenuation no longer has
  // anything to do with how far down the frame a cell sits.
  const { confidence } = applyHorizonPrior(openSky(32, 32), aim(0, 90), DEVICE_LENS);

  for (let row = 0; row < 32; row += 1) {
    const start = row * 32;
    expect(confidence[start]).toBeCloseTo(1);
    expect(confidence[start + 31]).toBeCloseTo(0);
    // Mirrored about the centre line, where the horizon now runs.
    for (let column = 0; column < 32; column += 1) {
      expect(confidence[start + column] + confidence[start + 31 - column]).toBeCloseTo(1);
    }
  }
});

test("attenuates the model's confidence rather than replacing it", () => {
  const overcast: SkyMask = { columns: 1, rows: 3, confidence: [0.4, 0.4, 0.4] };
  const { confidence } = applyHorizonPrior(overcast, aim(), DEVICE_LENS);

  expect(confidence[0]).toBeCloseTo(0.4);
  expect(confidence[1]).toBeCloseTo(0.2);
  expect(confidence[2]).toBeCloseTo(0);
});

test("leaves the input mask alone", () => {
  const mask = openSky(2, 2);
  applyHorizonPrior(mask, aim(-45), DEVICE_LENS);
  expect(mask.confidence).toEqual([1, 1, 1, 1]);
});

test("the cap is centred on the horizon and saturates a taper away", () => {
  expect(horizonSkyLimit(0, 2)).toBeCloseTo(0.5);
  expect(horizonSkyLimit(1, 2)).toBeCloseTo(0.75);
  expect(horizonSkyLimit(-1, 2)).toBeCloseTo(0.25);
  expect(horizonSkyLimit(5, 2)).toBe(1);
  expect(horizonSkyLimit(-5, 2)).toBe(0);
});

test("the ground takes a cell's sub-cell detail down with it", () => {
  // A cell whose sub-cells disagree — the top of a wall against the sky — put
  // once well above the horizon and once well below it. Below, nothing inside
  // the cell may survive: the cap is what says the reflection in the wet road
  // is not sky, and detail that outlived it would hand a marker straight back.
  const columns = 1;
  const rows = 32;
  const edgeCell = (row: number): SkyMask => ({
    columns,
    rows,
    confidence: new Array(rows).fill(1).map((value, index) => (index === row ? 0.5 : value)),
    detail: {
      factor: 2,
      blockStart: new Int32Array(rows).fill(-1).map((v, i) => (i === row ? 0 : v)),
      residuals: Float32Array.from([0.5, 0.5, -0.5, -0.5])
    }
  });

  const high = applyHorizonPrior(edgeCell(0), aim(), DEVICE_LENS);
  expect(fineConfidence(high, 0, 0)).toBeCloseTo(1);
  expect(fineConfidence(high, 0, 1)).toBeCloseTo(0);

  const low = applyHorizonPrior(edgeCell(rows - 1), aim(), DEVICE_LENS);
  expect(fineConfidence(low, 0, 2 * (rows - 1))).toBeCloseTo(0);
  expect(fineConfidence(low, 0, 2 * rows - 1)).toBeCloseTo(0);
});
