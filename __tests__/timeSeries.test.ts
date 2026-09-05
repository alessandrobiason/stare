import { nearestIndex, sampleInterpolated, sampleNearest } from "../testing/replay/timeSeries";

const series = [
  [0, 10, 100],
  [1, 20, 200],
  [3, 40, 400]
];

test("finds the nearest sample index", () => {
  expect(nearestIndex(series, -5)).toBe(0);
  expect(nearestIndex(series, 0.4)).toBe(0);
  expect(nearestIndex(series, 0.6)).toBe(1);
  expect(nearestIndex(series, 2.9)).toBe(2);
  expect(nearestIndex(series, 99)).toBe(2);
});

test("nearest sampling returns whole rows", () => {
  expect(sampleNearest(series, 0.9)).toEqual([1, 20, 200]);
});

test("interpolation clamps outside the stream", () => {
  expect(sampleInterpolated(series, -1)).toEqual([0, 10, 100]);
  expect(sampleInterpolated(series, 99)).toEqual([3, 40, 400]);
});

test("interpolation blends every channel and reports the queried time", () => {
  expect(sampleInterpolated(series, 0.5)).toEqual([0.5, 15, 150]);
  expect(sampleInterpolated(series, 2)).toEqual([2, 30, 300]);
});

test("duplicate timestamps do not produce NaN", () => {
  const duplicated = [
    [0, 0],
    [1, 10],
    [1, 20],
    [2, 30]
  ];
  for (const time of [0.5, 1, 1.5]) {
    expect(sampleInterpolated(duplicated, time).every(Number.isFinite)).toBe(true);
  }
});
