import {
  angleDeltaDegrees,
  clamp,
  lerp,
  toDegrees,
  toRadians,
  wrapDegrees180,
  wrapDegrees360
} from "../src/math/angles";

test("wraps headings into [0, 360)", () => {
  expect(wrapDegrees360(0)).toBe(0);
  expect(wrapDegrees360(370)).toBeCloseTo(10);
  expect(wrapDegrees360(-10)).toBeCloseTo(350);
});

test("wraps signed angles into [-180, 180)", () => {
  expect(wrapDegrees180(0)).toBe(0);
  expect(wrapDegrees180(190)).toBeCloseTo(-170);
  expect(wrapDegrees180(-190)).toBeCloseTo(170);
});

test("angle delta takes the short way round north", () => {
  expect(angleDeltaDegrees(1, 359)).toBeCloseTo(2);
  expect(angleDeltaDegrees(359, 1)).toBeCloseTo(-2);
  expect(angleDeltaDegrees(90, 0)).toBeCloseTo(90);
  // Stays bounded even outside the usual [0, 360) input domain.
  expect(angleDeltaDegrees(-700, 0)).toBeCloseTo(20);
});

test("degree and radian conversion round-trips", () => {
  expect(toDegrees(Math.PI)).toBeCloseTo(180);
  expect(toRadians(180)).toBeCloseTo(Math.PI);
});

test("clamp and lerp", () => {
  expect(clamp(5, 0, 1)).toBe(1);
  expect(clamp(-5, 0, 1)).toBe(0);
  expect(lerp(10, 20, 0.25)).toBe(12.5);
});
