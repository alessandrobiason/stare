import { existsSync, readFileSync } from "fs";
import { ORIENTATION_FILTER } from "../src/constants";
import { AttitudeMeasurement, OrientationFilter } from "../src/fusion/orientationFilter";
import { toDegrees, wrapDegrees180 } from "../src/math/angles";
import {
  RecordingData,
  attitudeFromArkit,
  hardIronOffset,
  sensorTimeOffsetSeconds
} from "../testing/replay/recordingDataset";
import { sampleInterpolated } from "../testing/replay/timeSeries";

/**
 * A staged recording is dev-only test fixture (see `TEST_DATA_DIR` in
 * `testing/tools/prepare-test-data.mjs`) and is never committed, so this block skips
 * itself rather than failing when nobody has staged one.
 */
const DATASET_PATH = "public/dataset-iphone-sensors.json";
// `describe.skip` still runs its callback to discover child tests, so a
// missing file would throw at collection time; guarding the call itself is
// what actually skips reading it.
const describeIfStaged = existsSync(DATASET_PATH)
  ? describe
  : (name: string, _fn: () => void) => describe.skip(name, () => undefined);

const RATE = 1 / 60;

function level(overrides: Partial<AttitudeMeasurement> = {}): AttitudeMeasurement {
  return { timestampSeconds: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, ...overrides };
}

test("the heading is the yaw plus the bearing to north", () => {
  const filter = new OrientationFilter();
  const orientation = filter.update(level({ yawDeg: 100, northOffsetDeg: 30 }));
  expect(orientation.headingDeg).toBeCloseTo(130);
});

test("the heading is reported in [0, 360)", () => {
  const filter = new OrientationFilter();
  const orientation = filter.update(level({ yawDeg: -100, northOffsetDeg: -30 }));
  expect(orientation.headingDeg).toBeCloseTo(230);
});

test("noise on the north reference does not reach the heading", () => {
  const steady = new OrientationFilter();
  const noisy = new OrientationFilter();

  // The same yaw either way; one gets a magnetic bearing that jitters by a
  // degree every frame, which is roughly what the sensor actually does.
  let worst = 0;
  for (let step = 0; step < 600; step += 1) {
    const timestampSeconds = step * RATE;
    const yawDeg = 20;
    const jitter = step % 2 === 0 ? 1 : -1;
    const a = steady.update(level({ timestampSeconds, yawDeg, northOffsetDeg: 40 }));
    const b = noisy.update(level({ timestampSeconds, yawDeg, northOffsetDeg: 40 + jitter }));
    if (step > 60) worst = Math.max(worst, Math.abs(wrapDegrees180(a.headingDeg - b.headingDeg)));
  }

  expect(worst).toBeLessThan(0.1);
});

test("the north reference still follows a slow drift", () => {
  const filter = new OrientationFilter();
  let orientation = filter.update(level({ yawDeg: 0, northOffsetDeg: 0 }));

  // Five minutes of north creeping round by 10 degrees.
  const steps = 5 * 60 * 60;
  for (let step = 1; step <= steps; step += 1) {
    orientation = filter.update(
      level({
        timestampSeconds: step * RATE,
        yawDeg: 0,
        northOffsetDeg: (step / steps) * 10
      })
    );
  }

  expect(orientation.headingDeg).toBeGreaterThan(8.5);
  expect(orientation.headingDeg).toBeLessThan(10.5);
});

test("sampling ahead of the last reading carries the attitude on at its rate", () => {
  const filter = new OrientationFilter();
  for (let step = 0; step <= 300; step += 1) {
    filter.update(level({ timestampSeconds: step * RATE, yawDeg: step * RATE * 60 }));
  }

  const last = filter.sample(300 * RATE);
  const ahead = filter.sample(300 * RATE + 0.05);
  // Turning at 60 deg/s, so 50 ms on is about 3 degrees further round.
  expect(wrapDegrees180(ahead.headingDeg - last.headingDeg)).toBeCloseTo(3, 0);
});

test("extrapolation is capped so a stalled stream cannot drift away", () => {
  const filter = new OrientationFilter();
  for (let step = 0; step <= 300; step += 1) {
    filter.update(level({ timestampSeconds: step * RATE, yawDeg: step * RATE * 60 }));
  }

  const capped = filter.sample(300 * RATE + ORIENTATION_FILTER.maxExtrapolationSeconds);
  const wayPast = filter.sample(300 * RATE + 30);
  expect(wayPast.headingDeg).toBeCloseTo(capped.headingDeg);
});

test("sampling before any reading reports a level attitude rather than guessing", () => {
  expect(new OrientationFilter().sample(10)).toEqual({
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    rotationRateDegPerSecond: 0
  });
});

test("a gap in the readings restarts the estimate instead of sweeping across it", () => {
  const filter = new OrientationFilter();
  for (let step = 0; step <= 120; step += 1) {
    filter.update(level({ timestampSeconds: step * RATE, yawDeg: 10 }));
  }

  // A seek: time jumps, and the device is pointing somewhere else entirely.
  const afterSeek = filter.update(
    level({ timestampSeconds: 120 * RATE + 60, yawDeg: 200 })
  );
  expect(afterSeek.headingDeg).toBeCloseTo(200);
});

test("time running backwards restarts the estimate too", () => {
  const filter = new OrientationFilter();
  filter.update(level({ timestampSeconds: 10, yawDeg: 10 }));
  const rewound = filter.update(level({ timestampSeconds: 2, yawDeg: 250 }));
  expect(rewound.headingDeg).toBeCloseTo(250);
});

describeIfStaged("against a staged recording", () => {
  const data: RecordingData = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
  const offset = sensorTimeOffsetSeconds(data);

  const readings: AttitudeMeasurement[] = data.arkit.map((pose) => {
    const sensorSeconds = pose[0] - offset;
    const attitude = attitudeFromArkit(
      pose,
      sampleInterpolated(data.magnetometer, sensorSeconds),
      hardIronOffset(data)
    );
    const gyro = sampleInterpolated(data.gyro, sensorSeconds);
    return {
      timestampSeconds: pose[0],
      yawDeg: attitude.yaw,
      pitchDeg: attitude.pitch,
      rollDeg: attitude.roll,
      northOffsetDeg: attitude.northOffset,
      gyroRadPerSecond: { x: gyro[1], y: gyro[2], z: gyro[3] }
    };
  });

  const filtered: number[] = [];
  const raw: number[] = [];
  const filter = new OrientationFilter();
  for (const reading of readings) {
    filtered.push(filter.update(reading).headingDeg);
    raw.push(reading.yawDeg + (reading.northOffsetDeg ?? 0));
  }
  // Drop the first ten seconds, while the filter is still settling.
  const settled = 600;

  test("the north reference is held steady rather than chased", () => {
    // Indoors the bearing to north is not a constant: walking past a steel
    // door frame swings it by tens of degrees, and across this recording the
    // raw one wanders over a 30 degree range. Averaging it over minutes is the
    // whole point — what the heading follows frame to frame has to be ARKit's
    // yaw, with the reference underneath it barely moving.
    const rawReference = readings.map((reading) => reading.northOffsetDeg ?? 0);
    const heldReference = filtered.map((angle, i) => wrapDegrees180(angle - readings[i].yawDeg));

    const step = (angles: number[]) => {
      let sum = 0;
      for (let i = settled + 1; i < angles.length; i += 1) {
        const change = wrapDegrees180(angles[i] - angles[i - 1]);
        sum += change * change;
      }
      return Math.sqrt(sum / (angles.length - settled - 1));
    };

    expect(step(rawReference)).toBeGreaterThan(1);
    expect(step(heldReference)).toBeLessThan(step(rawReference) / 20);
  });

  test("the filtered heading does not lag the sensors", () => {
    // Lag is a time shift, so measure it as one: line the filtered heading up
    // against the yaw at a range of offsets and see which fits best. A filter
    // that traded jitter for lag would fit best several frames late.
    //
    // Frame-to-frame changes rather than the angles themselves, and against
    // the yaw rather than the raw heading: the reference the filter adds to
    // the yaw is deliberately slow, and comparing the angles directly would
    // count its trail — tens of degrees indoors — as a tracking error.
    const from = settled;
    const to = filtered.length - 60;
    const yaw = readings.map((reading) => reading.yawDeg);

    const misfit = (shift: number) => {
      let sum = 0;
      for (let i = from; i < to; i += 1) {
        const followed = wrapDegrees180(filtered[i] - filtered[i - 1]);
        const measured = wrapDegrees180(yaw[i - shift] - yaw[i - shift - 1]);
        sum += (followed - measured) * (followed - measured);
      }
      return Math.sqrt(sum / (to - from));
    };

    let best = { shift: 0, error: Infinity };
    for (let shift = 0; shift <= 30; shift += 1) {
      const error = misfit(shift);
      if (error < best.error) best = { shift, error };
    }

    // At 60 Hz, within two frames of no delay at all.
    expect(best.shift).toBeLessThanOrEqual(2);
    // And what remains is the noise the filter removed, not a tracking error:
    // hundredths of a degree per frame against a 37 degree field of view.
    expect(best.error).toBeLessThan(0.1);
  });

  test("the recording's turn rates are tracked, not smoothed away", () => {
    let peak = 0;
    const filter = new OrientationFilter();
    for (const reading of readings) {
      const { rotationRateDegPerSecond } = filter.update(reading);
      peak = Math.max(peak, rotationRateDegPerSecond);
    }
    const peakGyro = Math.max(
      ...readings.map((r) =>
        r.gyroRadPerSecond ? toDegrees(Math.hypot(r.gyroRadPerSecond.x, r.gyroRadPerSecond.y, r.gyroRadPerSecond.z)) : 0
      )
    );

    // The filter should see motion of the same order the gyro reports, not a
    // fraction of it.
    expect(peak).toBeGreaterThan(peakGyro / 3);
  });
});
