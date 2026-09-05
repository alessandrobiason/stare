import { CameraAttitude } from "../src/camera/attitude";
import {
  DEVICE_LENS,
  FramePoint,
  projectToFrame,
  rayThroughFrame
} from "../src/camera/projection";
import { EnuPosition } from "../src/types";
import {
  AnchoredSkyMask,
  maskAlignment,
  maskOffsetDeg,
  skyProbe
} from "../src/vision/anchoredMask";
import { skyConfidenceAt, SkyMask } from "../src/vision/skyMask";

const LEVEL: CameraAttitude = { headingDeg: 0, pitchDeg: 0, rollDeg: 0 };

const aimed = (mask: SkyMask, attitude: CameraAttitude = LEVEL): AnchoredSkyMask => ({
  mask,
  attitude
});

/** A mask of one value everywhere, at a grid the size the segmenter produces. */
const uniform = (columns: number, rows: number, value: number): SkyMask => ({
  columns,
  rows,
  confidence: new Array<number>(columns * rows).fill(value)
});

/** The direction the camera at `attitude` sees at `point` of its frame. */
const towards = (point: FramePoint, attitude: CameraAttitude = LEVEL): EnuPosition =>
  rayThroughFrame(point, attitude, DEVICE_LENS);

test("a turn moves the marker and leaves the mask's answer about it alone", () => {
  // Sky on the left of the frame, a building on the right.
  const mask = aimed({ columns: 2, rows: 1, confidence: [1, 0] });
  const building = towards({ left: 80, top: 50 });

  // The phone turns twelve degrees to the right while the next pass is still
  // being computed. The satellite is still behind the same building.
  const turned: CameraAttitude = { ...LEVEL, headingDeg: 12 };
  expect(skyProbe(mask, DEVICE_LENS)(building)).toBe(0);

  // Read at the marker's screen position instead — the mask pinned to the
  // frame — and the same building has become a third open sky, which is a
  // satellite drawn over a roof until the next mask lands.
  const point = projectToFrame(building, turned, DEVICE_LENS);
  expect(skyConfidenceAt(mask.mask, point!.left, point!.top)).toBeGreaterThan(0.3);
});

test("sky the mask never saw has no answer rather than an open one", () => {
  const mask = aimed(uniform(48, 32, 1));
  const probe = skyProbe(mask, DEVICE_LENS);

  // Well beyond the frame the mask was cut from: the phone has turned onto sky
  // no pass has looked at yet.
  expect(probe(towards({ left: 50, top: 50 }, { ...LEVEL, headingDeg: 40 }))).toBeNull();
  // And behind the camera that took it, where the projection means nothing.
  expect(probe(towards({ left: 50, top: 50 }, { ...LEVEL, headingDeg: 180 }))).toBeNull();
});

test("a marker sitting on the mask's edge is still read", () => {
  const probe = skyProbe(aimed(uniform(48, 32, 1)), DEVICE_LENS);

  // Within a cell of the border, where the mask is only extrapolating by the
  // half cell `skyConfidenceAt` already clamps to; past that it is guessing.
  expect(probe(towards({ left: 101, top: 50 }))).toBe(1);
  expect(probe(towards({ left: 110, top: 50 }))).toBeNull();
});

describe("where the mask is drawn", () => {
  const mask = aimed(uniform(48, 32, 1));

  test("sits exactly over the picture while the phone has not moved", () => {
    const alignment = maskAlignment(mask, LEVEL, DEVICE_LENS)!;

    expect(alignment.centre.left).toBeCloseTo(50, 6);
    expect(alignment.centre.top).toBeCloseTo(50, 6);
    expect(alignment.rotationDeg).toBeCloseTo(0, 6);
    expect(alignment.scale).toBeCloseTo(1, 6);
  });

  test("turns against the roll, as the scene in the picture does", () => {
    const rolled = maskAlignment(mask, { ...LEVEL, rollDeg: 15 }, DEVICE_LENS)!;

    // Positive roll is the right-hand side down, so the scene — and the mask
    // taken from it — appears to turn anticlockwise. Nothing else changes: a
    // roll is a rotation about the optical axis and no part of it is a shift.
    expect(rolled.rotationDeg).toBeCloseTo(-15, 6);
    expect(rolled.centre.left).toBeCloseTo(50, 6);
    expect(rolled.centre.top).toBeCloseTo(50, 6);
    expect(rolled.scale).toBeCloseTo(1, 6);
  });

  test("slides with the sky when the phone pans and pitches", () => {
    const panned = maskAlignment(mask, { ...LEVEL, headingDeg: 8 }, DEVICE_LENS)!;
    expect(panned.centre.left).toBeLessThan(50);
    expect(panned.centre.top).toBeCloseTo(50, 6);

    const raised = maskAlignment(mask, { ...LEVEL, pitchDeg: 8 }, DEVICE_LENS)!;
    expect(raised.centre.top).toBeGreaterThan(50);
    expect(raised.centre.left).toBeCloseTo(50, 6);
  });

  test("is nothing to draw once the phone has turned away from it", () => {
    expect(maskAlignment(mask, { ...LEVEL, headingDeg: 100 }, DEVICE_LENS)).toBeNull();
  });
});

test("the aim offset is the angle between the two, whatever the roll", () => {
  const mask = aimed(uniform(48, 32, 1));

  expect(maskOffsetDeg(mask, LEVEL)).toBeCloseTo(0, 6);
  expect(maskOffsetDeg(mask, { ...LEVEL, headingDeg: 30 })).toBeCloseTo(30, 6);
  expect(maskOffsetDeg(mask, { ...LEVEL, pitchDeg: -12 })).toBeCloseTo(12, 6);
  // Rolling turns the frame about where it is looking, so the aim is unchanged.
  expect(maskOffsetDeg(mask, { ...LEVEL, rollDeg: 45 })).toBeCloseTo(0, 6);
});
