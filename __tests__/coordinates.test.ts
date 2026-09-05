import {
  azimuthDeg,
  createObserverFrame,
  eciToEnu,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt,
  isAboveHorizon
} from "../src/coordinates/transform";
import { ObserverLocation } from "../src/types";

const observer: ObserverLocation = { latitudeDeg: 37.7749, longitudeDeg: -122.4194, heightM: 10 };
const when = new Date("2026-08-23T12:00:00Z");
const eci = { x: 4000, y: -5000, z: 3500 };

test("only positions above the local horizon are visible", () => {
  expect(isAboveHorizon({ east: 100, north: 100, up: 1 })).toBe(true);
  expect(isAboveHorizon({ east: 100, north: 100, up: -1 })).toBe(false);
  expect(isAboveHorizon({ east: 100, north: 100, up: 0 })).toBe(false);
});

test("an elevation mask excludes satellites near the horizon", () => {
  expect(isAboveHorizon({ east: 100, north: 100, up: 20 }, 15)).toBe(false);
  expect(isAboveHorizon({ east: 100, north: 100, up: 100 }, 15)).toBe(true);
});

test("azimuth is measured clockwise from north", () => {
  expect(azimuthDeg({ east: 0, north: 1, up: 0 })).toBeCloseTo(0);
  expect(azimuthDeg({ east: 1, north: 0, up: 0 })).toBeCloseTo(90);
  expect(azimuthDeg({ east: -1, north: 0, up: 0 })).toBeCloseTo(-90);
});

test("elevation is measured up from the local horizontal", () => {
  expect(elevationDeg({ east: 1, north: 0, up: 0 })).toBeCloseTo(0);
  expect(elevationDeg({ east: 0, north: 0, up: 1 })).toBeCloseTo(90);
  expect(elevationDeg({ east: 1, north: 0, up: 1 })).toBeCloseTo(45);
});

test("the precomputed-frame fast path matches the convenience conversion", () => {
  const direct = eciToEnu(eci, when, observer);
  const framed = eciToEnuInFrame(eci, gmstAt(when), createObserverFrame(observer));
  expect(framed).toEqual(direct);
});

test("a satellite directly overhead has near-vertical elevation", () => {
  // Roughly 500 km straight up from the observer, expressed in ECI.
  const gmst = gmstAt(when);
  const frame = createObserverFrame(observer);
  const overheadEcef = {
    x: frame.ecef.x * 1.078,
    y: frame.ecef.y * 1.078,
    z: frame.ecef.z * 1.078
  };
  // ECEF -> ECI is the inverse rotation about z by gmst.
  const cos = Math.cos(gmst);
  const sin = Math.sin(gmst);
  const overheadEci = {
    x: overheadEcef.x * cos - overheadEcef.y * sin,
    y: overheadEcef.x * sin + overheadEcef.y * cos,
    z: overheadEcef.z
  };
  expect(elevationDeg(eciToEnuInFrame(overheadEci, gmst, frame))).toBeGreaterThan(89);
});
