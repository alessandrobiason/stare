import { attitudeFromAxes, axesFromAttitude, CameraAttitude } from "../src/camera/attitude";
import { EnuPosition } from "../src/types";

const dot = (a: EnuPosition, b: EnuPosition) => a.east * b.east + a.north * b.north + a.up * b.up;
const angleBetween = (a: EnuPosition, b: EnuPosition) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;

test("a level camera facing north looks north, with east to its right", () => {
  const { forward, right, up } = axesFromAttitude({ headingDeg: 0, pitchDeg: 0, rollDeg: 0 });

  expect(forward).toEqual({ east: 0, north: 1, up: 0 });
  expect(right.east).toBeCloseTo(1);
  expect(right.north).toBeCloseTo(0);
  expect(up.up).toBeCloseTo(1);
});

test("the axes stay orthonormal wherever the camera points", () => {
  for (const headingDeg of [0, 73, 180, 299]) {
    for (const pitchDeg of [-80, -20, 0, 35, 80]) {
      for (const rollDeg of [-150, -30, 0, 45, 179]) {
        const { forward, right, up } = axesFromAttitude({ headingDeg, pitchDeg, rollDeg });
        for (const axis of [forward, right, up]) {
          expect(Math.hypot(axis.east, axis.north, axis.up)).toBeCloseTo(1);
        }
        expect(dot(forward, right)).toBeCloseTo(0);
        expect(dot(forward, up)).toBeCloseTo(0);
        expect(dot(right, up)).toBeCloseTo(0);
      }
    }
  }
});

test("attitude and axes are inverses of each other", () => {
  for (const headingDeg of [0, 73, 180, 299]) {
    for (const pitchDeg of [-80, -20, 0, 35, 80]) {
      for (const rollDeg of [-150, -30, 0, 45, 170]) {
        const attitude: CameraAttitude = { headingDeg, pitchDeg, rollDeg };
        const { forward, right } = axesFromAttitude(attitude);
        const recovered = attitudeFromAxes(forward, right);

        expect(recovered.headingDeg).toBeCloseTo(headingDeg, 6);
        expect(recovered.pitchDeg).toBeCloseTo(pitchDeg, 6);
        expect(recovered.rollDeg).toBeCloseTo(rollDeg, 6);
      }
    }
  }
});

test("positive roll puts the camera's right-hand side down", () => {
  const { right } = axesFromAttitude({ headingDeg: 0, pitchDeg: 0, rollDeg: 30 });

  expect(right.up).toBeLessThan(0);
  expect(right.up).toBeCloseTo(-Math.sin((30 * Math.PI) / 180));
});

test("pointing at the zenith, the heading is where the top of the frame faces", () => {
  // Straight up with the top of the frame towards the south: heading is south,
  // and what would otherwise be an arbitrary split between heading and roll is
  // resolved into the heading alone.
  const attitude = attitudeFromAxes(
    { east: 0, north: 0, up: 1 },
    { east: -1, north: 0, up: 0 }
  );

  expect(attitude.pitchDeg).toBeCloseTo(90);
  expect(attitude.headingDeg).toBeCloseTo(180);
  expect(attitude.rollDeg).toBe(0);
});

test("an unnormalised forward axis is still placed correctly", () => {
  const attitude = attitudeFromAxes(
    { east: 0, north: 1000, up: 1000 },
    { east: 1, north: 0, up: 0 }
  );

  expect(attitude.pitchDeg).toBeCloseTo(45);
  expect(attitude.headingDeg).toBeCloseTo(0);
});

test("a small attitude change moves the view by the same small angle", () => {
  // The three angles are a rotation, not three sliders: a degree of heading
  // near the horizon and a degree of pitch have to move the optical axis by a
  // degree each, or the markers drift against the scene as the camera turns.
  const base = axesFromAttitude({ headingDeg: 40, pitchDeg: 10, rollDeg: 25 });
  const turned = axesFromAttitude({ headingDeg: 41, pitchDeg: 10, rollDeg: 25 });
  const tilted = axesFromAttitude({ headingDeg: 40, pitchDeg: 11, rollDeg: 25 });

  expect(angleBetween(base.forward, turned.forward)).toBeCloseTo(Math.cos((10 * Math.PI) / 180), 2);
  expect(angleBetween(base.forward, tilted.forward)).toBeCloseTo(1, 6);
});
