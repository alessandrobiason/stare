import { CameraAttitude } from "../src/camera/attitude";
import { DEVICE_LENS, projectToFrame, rayThroughFrame } from "../src/camera/projection";
import { DEVICE_CAMERA_FIELD_OF_VIEW } from "../src/constants";
import { EnuPosition } from "../src/types";

/** A position at the given azimuth/elevation, 100 km away. */
function at(azimuthDeg: number, elevationDeg: number): EnuPosition {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * 100_000;
  return {
    east: horizontal * Math.sin(azimuth),
    north: horizontal * Math.cos(azimuth),
    up: Math.sin(elevation) * 100_000
  };
}

const aim = (headingDeg = 0, pitchDeg = 0, rollDeg = 0): CameraAttitude => ({
  headingDeg,
  pitchDeg,
  rollDeg
});

test("a target straight ahead lands in the centre of the frame", () => {
  const point = projectToFrame(at(0, 0), aim(), DEVICE_LENS);
  expect(point).not.toBeNull();
  expect(point!.left).toBeCloseTo(50);
  expect(point!.top).toBeCloseTo(50);
});

test("frame edges sit at the half field of view", () => {
  // Just inside the limit: an exact-boundary target can land either side of
  // the cut by a float epsilon.
  const epsilon = 1e-6;
  const right = projectToFrame(
    at(DEVICE_CAMERA_FIELD_OF_VIEW.horizontalDeg / 2 - epsilon, 0),
    aim(),
    DEVICE_LENS
  );
  expect(right!.left).toBeCloseTo(100, 4);

  const top = projectToFrame(
    at(0, DEVICE_CAMERA_FIELD_OF_VIEW.verticalDeg / 2 - epsilon),
    aim(),
    DEVICE_LENS
  );
  expect(top!.top).toBeCloseTo(0, 4);
});

test("targets outside the field of view are rejected", () => {
  expect(projectToFrame(at(90, 0), aim(), DEVICE_LENS)).toBeNull();
  expect(projectToFrame(at(0, 80), aim(), DEVICE_LENS)).toBeNull();
});

test("targets behind the camera are rejected rather than mirrored", () => {
  // The tangent of the off-axis angle is the same 180 degrees away, so a
  // target directly behind the camera projects onto the same point as one in
  // front of it unless the depth is checked.
  expect(projectToFrame(at(180, 0), aim(), DEVICE_LENS)).toBeNull();
  expect(projectToFrame(at(180, 10), aim(0, 10), DEVICE_LENS)).toBeNull();
});

test("camera heading and pitch move the target within the frame", () => {
  // Turning towards a target off to the right re-centres it.
  const point = projectToFrame(at(15, 0), aim(15), DEVICE_LENS);
  expect(point!.left).toBeCloseTo(50);

  // Tilting up pushes a level target towards the bottom of the frame.
  const tilted = projectToFrame(at(0, 0), aim(0, 10), DEVICE_LENS);
  expect(tilted!.top).toBeGreaterThan(50);
});

test("azimuth wrap-around across north is handled", () => {
  const point = projectToFrame(at(355, 0), aim(5), DEVICE_LENS);
  expect(point).not.toBeNull();
  expect(point!.left).toBeLessThan(50);
});

test("roll turns the frame about its centre", () => {
  // A target on the horizon, off to the right of a camera rolled right-hand
  // side down, has to rise in the frame by the same rotation the scene does.
  const level = projectToFrame(at(10, 0), aim(), DEVICE_LENS)!;
  const rolled = projectToFrame(at(10, 0), aim(0, 0, 90), DEVICE_LENS)!;

  expect(level.top).toBeCloseTo(50);
  expect(rolled.left).toBeCloseTo(50);
  expect(rolled.top).toBeLessThan(50);
});

test("a target on the optical axis stays centred at any roll", () => {
  for (const rollDeg of [-120, -45, 0, 30, 150]) {
    const point = projectToFrame(at(30, 20), aim(30, 20, rollDeg), DEVICE_LENS)!;
    expect(point.left).toBeCloseTo(50);
    expect(point.top).toBeCloseTo(50);
  }
});

test("angles off the centre line are not confused with angles along it", () => {
  // Subtracting the camera's heading from a target's azimuth is only the
  // off-axis angle on the horizon. Ten degrees of azimuth at 40 degrees of
  // elevation is a much smaller angle than ten degrees on the horizon, and a
  // camera that treats the two alike drags its markers across the scene as it
  // pitches up.
  const nearHorizon = projectToFrame(at(10, 0), aim(), DEVICE_LENS)!;
  const highUp = projectToFrame(at(10, 40), aim(0, 40), DEVICE_LENS)!;

  expect(highUp.left - 50).toBeLessThan((nearHorizon.left - 50) * 0.8);
  expect(highUp.left).toBeGreaterThan(50);
});

test("a frame point casts back to the direction that projects onto it", () => {
  const attitude = aim(212, 24, -17);

  for (const target of [at(212, 24), at(200, 30), at(225, 12), at(206, 40)]) {
    const point = projectToFrame(target, attitude, DEVICE_LENS)!;
    expect(point).not.toBeNull();

    const ray = rayThroughFrame(point, attitude, DEVICE_LENS);
    const length = Math.hypot(target.east, target.north, target.up);
    expect(ray.east).toBeCloseTo(target.east / length);
    expect(ray.north).toBeCloseTo(target.north / length);
    expect(ray.up).toBeCloseTo(target.up / length);
  }
});

test("the centre of the frame looks along the optical axis", () => {
  const ray = rayThroughFrame({ left: 50, top: 50 }, aim(90, 35), DEVICE_LENS);
  // Elevation of the ray is the camera's own pitch, bearing its own heading.
  expect((Math.asin(ray.up) * 180) / Math.PI).toBeCloseTo(35);
  expect((Math.atan2(ray.east, ray.north) * 180) / Math.PI).toBeCloseTo(90);
});
