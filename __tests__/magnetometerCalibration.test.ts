import { fitHardIronOffset, withoutHardIron } from "../testing/replay/magnetometerCalibration";
import { TimeSeries } from "../testing/replay/timeSeries";

/** Readings of a `radius`-strong field, biased by `offset`, over many attitudes. */
function sphere(offset: { x: number; y: number; z: number }, radius: number): TimeSeries {
  const samples: TimeSeries = [];
  for (let i = 0; i < 400; i += 1) {
    // Fibonacci sphere: an even spread of directions without a repeating grid.
    const z = 1 - (2 * i + 1) / 400;
    const r = Math.sqrt(1 - z * z);
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    samples.push([
      i / 100,
      offset.x + radius * r * Math.cos(theta),
      offset.y + radius * r * Math.sin(theta),
      offset.z + radius * z
    ]);
  }
  return samples;
}

test("the fit recovers the bias a rotating magnetometer traces its readings around", () => {
  const offset = fitHardIronOffset(sphere({ x: 190, y: 161, z: -590 }, 32));

  expect(offset.x).toBeCloseTo(190, 6);
  expect(offset.y).toBeCloseTo(161, 6);
  expect(offset.z).toBeCloseTo(-590, 6);
});

test("subtracting the fitted offset leaves readings of one strength", () => {
  const readings = sphere({ x: -12, y: 400, z: 7 }, 48);
  const offset = fitHardIronOffset(readings);

  for (const [, x, y, z] of readings) {
    const field = withoutHardIron({ x, y, z }, offset);
    expect(Math.hypot(field.x, field.y, field.z)).toBeCloseTo(48, 6);
  }
});

test("readings that do not describe a sphere are left uncorrected", () => {
  // A phone that was never turned traces a patch, not a sphere, and its centre
  // is a guess. An uncorrected reading at least fails as a constant bearing
  // error rather than one that moves with the device.
  const still: TimeSeries = [];
  for (let i = 0; i < 200; i += 1) {
    still.push([i / 100, 190 + Math.random() * 0.01, 161, -590]);
  }

  expect(fitHardIronOffset(still)).toEqual({ x: 0, y: 0, z: 0 });
});

test("a stream too short to fit is left uncorrected", () => {
  expect(fitHardIronOffset([[0, 1, 2, 3]])).toEqual({ x: 0, y: 0, z: 0 });
  expect(fitHardIronOffset([])).toEqual({ x: 0, y: 0, z: 0 });
});
