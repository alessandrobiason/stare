import { existsSync, readFileSync } from "fs";
import { ORIENTATION_FILTER } from "../src/constants";
import {
  AttitudeMeasurement,
  northOffsetNoiseDeg,
  OrientationFilter
} from "../src/fusion/orientationFilter";
import { toDegrees, toRadians, wrapDegrees180 } from "../src/math/angles";
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

describe("how far a bearing to north is trusted", () => {
  test("a compass the platform will not vouch for moves the reference far less", () => {
    // The failure this is for: a magnetometer captured by a magnet reports a
    // field like any other, thirty degrees out, and used to be fused as though
    // it were a good one.
    //
    // Measured after the reference has settled, not from the first reading.
    // The first correction seeds the estimate outright and the next few behave
    // like a running average whatever the noise is — what the grade buys is the
    // *steady-state* gain, which is where the ratio between the two lives.
    //
    // Two minutes of it, because settling is slower than it looks: a bearing is
    // fused with its noise widened for how correlated the readings are
    // (`magneticCorrelationSeconds`), and the poor grade starts from a variance
    // that much larger. Ten seconds left it still on its way down, and a
    // reference still falling has a gain higher than the one being compared.
    const headingAfterJump = (noiseDeg: number): number => {
      const filter = new OrientationFilter();
      let timestampSeconds = 0;
      const feed = (northOffsetDeg: number) => {
        filter.update(
          level({ timestampSeconds, northOffsetDeg, northOffsetNoiseDeg: noiseDeg })
        );
        timestampSeconds += RATE;
      };
      for (let step = 0; step < 7200; step += 1) feed(0);
      for (let step = 0; step < 30; step += 1) feed(40);
      return filter.sample(timestampSeconds).headingDeg;
    };

    const trusted = headingAfterJump(northOffsetNoiseDeg(3));
    const doubted = headingAfterJump(northOffsetNoiseDeg(0));

    expect(doubted).toBeLessThan(trusted / 4);
    // Not zero, though: a compass that has genuinely moved has to be able to
    // win eventually, so what this buys is time — for the platform to
    // recalibrate, and for the view to have said so on screen.
    expect(doubted).toBeGreaterThan(0);
  });

  test("a source with no grade to give gets the fitted constant", () => {
    // A recording is one device on one evening and has no opinion of its own,
    // so it must fuse exactly as it did before any of this existed.
    expect(northOffsetNoiseDeg(undefined)).toBe(ORIENTATION_FILTER.magneticNoiseDeg);
    expect(northOffsetNoiseDeg(3)).toBe(ORIENTATION_FILTER.magneticNoiseDeg);
  });

  test("the worse the grade the less the bearing counts", () => {
    const noise = [0, 1, 2, 3].map(northOffsetNoiseDeg);
    expect(noise).toEqual([...noise].sort((a, b) => b - a));
  });

  test("a level off the end of the table is untrusted, not trusted best", () => {
    // Clamping to the end would have handed an ungradable compass the row a
    // well-calibrated one earns, which is the wrong direction to fail in.
    expect(northOffsetNoiseDeg(9)).toBe(northOffsetNoiseDeg(0));
    expect(northOffsetNoiseDeg(-1)).toBe(northOffsetNoiseDeg(0));
  });
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

describe("readings the platform delivered late", () => {
  /**
   * A pan at `rateDegPerSecond`, with the JavaScript thread blocked for
   * `stallSeconds` in the middle of it.
   *
   * The sensor goes on sampling through the block and every reading it took
   * arrives afterwards, back to back, each stamped as it is *handled* — which is
   * the only clock the render loop shares with it (`useSmoothedOrientation`). So
   * the filter is handed several degrees of turn per half millisecond, which is
   * the shape of the failure this is about: it used to be believed, and the view
   * then coasted a tenth of a second on a rate of thousands of degrees a second
   * and drew the sky nowhere near where the phone was pointing.
   *
   * Returns the worst error the frames drawn over the next third of a second
   * would have been placed with, and the fastest rate the filter reported.
   */
  function afterAStall(rateDegPerSecond: number, stallSeconds: number) {
    const filter = new OrientationFilter();
    const sensor = 0.05;
    const yawAt = (seconds: number) => wrapDegrees180(seconds * rateDegPerSecond);
    const feed = (stamp: number, seconds: number) =>
      filter.update({
        timestampSeconds: stamp,
        yawDeg: yawAt(seconds),
        pitchDeg: 20,
        rollDeg: 0,
        northOffsetDeg: 0,
        gyroRadPerSecond: { x: 0, y: toRadians(rateDegPerSecond), z: 0 }
      });

    let sensorSeconds = 0;
    for (; sensorSeconds < 3; sensorSeconds += sensor) feed(sensorSeconds, sensorSeconds);

    // The queue, flushed: every reading taken during the block, in order, a
    // fraction of a millisecond apart.
    const resumedAt = sensorSeconds + stallSeconds;
    let stamp = resumedAt;
    let reported = 0;
    for (let index = 1; index <= Math.floor(stallSeconds / sensor); index += 1) {
      reported = Math.max(
        reported,
        feed(stamp, sensorSeconds + index * sensor).rotationRateDegPerSecond
      );
      stamp += 0.0005;
    }

    let worstErrorDeg = 0;
    let nextReadingAt = resumedAt + sensor;
    for (let now = stamp; now < resumedAt + 0.3; now += 1 / 60) {
      while (nextReadingAt <= now) {
        reported = Math.max(reported, feed(nextReadingAt, nextReadingAt).rotationRateDegPerSecond);
        nextReadingAt += sensor;
      }
      const drawn = filter.sample(now);
      worstErrorDeg = Math.max(
        worstErrorDeg,
        Math.abs(wrapDegrees180(drawn.headingDeg - yawAt(now)))
      );
    }

    return { worstErrorDeg, reported };
  }

  test("are not read as a turn no hand could make", () => {
    // 150 deg/s is a brisk but ordinary sweep across the sky, and 200 ms is one
    // chased sky pass' worth of blocked main thread. Unbounded, this drew the
    // heading 170 degrees out — the whole sky off the frame, which is the
    // fraction of a second of empty view this guards.
    const { worstErrorDeg, reported } = afterAStall(150, 0.2);
    expect(worstErrorDeg).toBeLessThan(15);
    expect(reported).toBeLessThan(4 * 150);
  });

  test("leave an error that grows with the stall rather than exploding at one", () => {
    // What is left is honest: readings a fifth of a second old fused as though
    // they were current, which lags the estimate and then decays as real ones
    // arrive. It has to stay a lag rather than becoming a launch.
    const errors = [0.1, 0.2, 0.3, 0.45].map(
      (stall) => afterAStall(150, stall).worstErrorDeg
    );
    for (const error of errors) expect(error).toBeLessThan(20);
    expect(errors[0]).toBeLessThan(errors[2]);
  });

  test("cannot be got round by turning fast enough to justify anything", () => {
    // The bound is the gyro's, so a reading claiming a rate the gyro does not
    // support is held whatever the pan underneath it is doing.
    for (const rate of [40, 90, 250, 400]) {
      const { worstErrorDeg } = afterAStall(rate, 0.3);
      expect(worstErrorDeg).toBeLessThan(40);
    }
  });
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
