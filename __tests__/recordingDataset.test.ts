import { existsSync, readFileSync } from "fs";
import { axesFromAttitude } from "../src/camera/attitude";

import { toRadians, wrapDegrees180 } from "../src/math/angles";
import { normalizeQuaternion, Quaternion, rotateVector } from "../src/math/quaternion";
import {
  attitudeFromArkit,
  hardIronOffset,
  sensorTimeOffsetSeconds,
  snapshotAt,
  RecordingData
} from "../testing/replay/recordingDataset";
import { MAGNETIC_DECLINATION_DEG } from "../testing/replay/constants";
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

/** ARKit pose row: `[time, x, y, z, qw, qx, qy, qz]` — scalar first. */
const pose = (rotation: Quaternion): number[] => [0, 1, 2, 3, rotation.w, rotation.x, rotation.y, rotation.z];

const IDENTITY: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

function turn(axis: { x: number; y: number; z: number }, degrees: number): Quaternion {
  const half = toRadians(degrees) / 2;
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const scale = Math.sin(half) / length;
  return { w: Math.cos(half), x: axis.x * scale, y: axis.y * scale, z: axis.z * scale };
}

/**
 * Magnetometer row for a field the device would read while held at `rotation`.
 *
 * The field is given where it belongs — in the world — and rotated into the
 * body frame, which is the only way to write a test that says anything about
 * whether north survives the phone being tilted.
 */
function magnetometerAt(rotation: Quaternion, world: { x: number; y: number; z: number }): number[] {
  const inverse = { w: rotation.w, x: -rotation.x, y: -rotation.y, z: -rotation.z };
  const body = rotateVector(inverse, world);
  return [0, body.x, body.y, body.z];
}

/** Magnetic north along ARKit's yaw origin (-z), tilted 60 degrees into the ground. */
const NORTH_ALONG_YAW_ORIGIN = { x: 0, y: -Math.sin(toRadians(60)), z: -Math.cos(toRadians(60)) };

test("a level camera at the yaw origin reads as level, and north is the declination", () => {
  const attitude = attitudeFromArkit(
    pose(IDENTITY),
    magnetometerAt(IDENTITY, NORTH_ALONG_YAW_ORIGIN)
  );

  expect(attitude.yaw).toBeCloseTo(0);
  expect(attitude.pitch).toBeCloseTo(0);
  expect(attitude.roll).toBeCloseTo(0);
  // The yaw origin points at magnetic north, so it points `declination` east
  // of true north, and so does the camera.
  expect(attitude.northOffset).toBeCloseTo(MAGNETIC_DECLINATION_DEG);
  expect(attitude.heading).toBeCloseTo(MAGNETIC_DECLINATION_DEG);
});

test("the camera's elevation comes from the lens axis, not the screen", () => {
  // Tipping the phone back 40 degrees — the way it is held to look at the
  // screen — points the rear camera 40 degrees *down*.
  const attitude = attitudeFromArkit(pose(turn({ x: 1, y: 0, z: 0 }, -40)), [0, 0, 0, -1]);

  expect(attitude.pitch).toBeCloseTo(-40);
  expect(attitude.roll).toBeCloseTo(0);
});

test("turning about the vertical is a change of yaw alone", () => {
  // A right-handed turn about ARKit's up axis swings the camera anticlockwise,
  // which is a falling compass bearing.
  const attitude = attitudeFromArkit(pose(turn({ x: 0, y: 1, z: 0 }, 90)), [0, 0, 0, -1]);

  expect(attitude.yaw).toBeCloseTo(-90);
  expect(attitude.pitch).toBeCloseTo(0);
  expect(attitude.roll).toBeCloseTo(0);
});

test("turning the phone clockwise about the lens is positive roll", () => {
  const attitude = attitudeFromArkit(pose(turn({ x: 0, y: 0, z: -1 }, 30)), [0, 0, 0, -1]);

  expect(attitude.roll).toBeCloseTo(30);
  expect(attitude.pitch).toBeCloseTo(0);
  expect(attitude.yaw).toBeCloseTo(0);
});

test("north does not move when the phone does", () => {
  // The bug this replaces: the bearing was taken from the raw body-frame x and
  // y, so tilting or turning the phone moved north with it and cancelled the
  // yaw it was supposed to anchor.
  const held = [
    IDENTITY,
    turn({ x: 1, y: 0, z: 0 }, -55),
    turn({ x: 0, y: 1, z: 0 }, 120),
    turn({ x: 0, y: 0, z: 1 }, 75),
    turn({ x: 1, y: 2, z: -3 }, 100)
  ];

  const offsets = held.map(
    (rotation) =>
      attitudeFromArkit(pose(rotation), magnetometerAt(rotation, NORTH_ALONG_YAW_ORIGIN)).northOffset
  );

  for (const offset of offsets) expect(offset).toBeCloseTo(MAGNETIC_DECLINATION_DEG, 6);
});

test("the device's own field is removed before the bearing is taken", () => {
  const rotation = turn({ x: 1, y: 2, z: -3 }, 100);
  const hardIron = { x: 600, y: -250, z: 90 };
  const clean = magnetometerAt(rotation, NORTH_ALONG_YAW_ORIGIN);
  const biased = [clean[0], clean[1] + hardIron.x, clean[2] + hardIron.y, clean[3] + hardIron.z];

  expect(attitudeFromArkit(pose(rotation), biased, hardIron).northOffset).toBeCloseTo(
    MAGNETIC_DECLINATION_DEG,
    6
  );
  // And without it the bearing is somewhere else entirely.
  expect(
    Math.abs(wrapDegrees180(attitudeFromArkit(pose(rotation), biased).northOffset - MAGNETIC_DECLINATION_DEG))
  ).toBeGreaterThan(20);
});

test("the reported angles rebuild the pose they came from", () => {
  // The three angles are the interchange format between the sensors and the
  // projection, so nothing about the pose may be lost on the way through.
  const rotation = turn({ x: 0.3, y: -0.8, z: 0.5 }, 143);
  const attitude = attitudeFromArkit(pose(rotation), [0, 0, 0, -1]);
  const rebuilt = axesFromAttitude({
    headingDeg: attitude.yaw,
    pitchDeg: attitude.pitch,
    rollDeg: attitude.roll
  });

  const lens = rotateVector(rotation, { x: 0, y: 0, z: -1 });
  expect(rebuilt.forward.east).toBeCloseTo(lens.x, 6);
  expect(rebuilt.forward.north).toBeCloseTo(-lens.z, 6);
  expect(rebuilt.forward.up).toBeCloseTo(lens.y, 6);
});

const data: RecordingData = {
  frames: [
    [0, 1],
    [1, 2]
  ],
  arkit: [
    [0, 0, 0, 0, 1, 0, 0, 0],
    [2, 2, 4, 6, 1, 0, 0, 0]
  ],
  locations: [
    [0, 10, 20, 30],
    [2, 12, 24, 40]
  ],
  accelerometer: [
    [0, 0, 0, 0],
    [2, 2, 2, 2]
  ],
  gyro: [
    [0, 0, 0, 0],
    [2, 2, 2, 2]
  ],
  magnetometer: [
    [0, 1, 0, 0],
    [2, 1, 0, 0]
  ],
  barometer: [
    [0, 100, 0],
    [2, 102, 4]
  ]
};

test("streams sharing the video's clock need no offset", () => {
  expect(sensorTimeOffsetSeconds(data)).toBe(0);
});

test("a snapshot interpolates continuous channels and snaps the frame number", () => {
  const snapshot = snapshotAt(data, 1);

  expect(snapshot.elapsedSeconds).toBe(1);
  // Nearest frame at t=1 is the second one.
  expect(snapshot.frameNumber).toBe(2);
  // GPS is halfway between the two location rows.
  expect(snapshot.observer).toEqual({ latitudeDeg: 11, longitudeDeg: 22, heightM: 35 });
  expect(snapshot.arkit.x).toBeCloseTo(1);
  expect(snapshot.arkit.z).toBeCloseTo(3);
  expect(snapshot.gyro).toEqual({ x: 1, y: 1, z: 1 });
  expect(snapshot.barometer).toEqual({ pressureKpa: 101, relativeAltitudeM: 2 });
});

test("snapshots clamp to the ends of the streams", () => {
  expect(snapshotAt(data, -5).observer.latitudeDeg).toBe(10);
  expect(snapshotAt(data, 99).observer.latitudeDeg).toBe(12);
});

/**
 * The camera streams carry their own clock, offset from the IMU streams by the
 * time the camera session took to come up. `frames`/`arkit` are stamped from
 * 10 s here, everything else from 0.
 */
const twoClockData: RecordingData = {
  frames: [
    [10, 1],
    [11, 2]
  ],
  arkit: [
    [10, 0, 0, 0, 1, 0, 0, 0],
    [11, 5, 0, 0, 1, 0, 0, 0]
  ],
  locations: [
    [0, 0, 0, 0],
    [1, 100, 0, 0]
  ],
  accelerometer: [
    [0, 0, 0, 0],
    [1, 1, 1, 1]
  ],
  gyro: [
    [0, 0, 0, 0],
    [1, 7, 0, 0]
  ],
  magnetometer: [
    [0, 1, 0, 0],
    [1, 1, 0, 0]
  ],
  barometer: [
    [0, 100, 0],
    [1, 101, 1]
  ]
};

test("the camera streams are read on their own clock", () => {
  expect(sensorTimeOffsetSeconds(twoClockData)).toBe(10);
});

test("a snapshot reads camera and IMU streams on the clock each belongs to", () => {
  // Video time 0 is the first frame, which is ARKit time 10 and IMU time 0.
  const start = snapshotAt(twoClockData, 0);
  expect(start.frameNumber).toBe(1);
  expect(start.arkit.x).toBeCloseTo(0);
  expect(start.gyro.x).toBeCloseTo(0);
  expect(start.observer.latitudeDeg).toBeCloseTo(0);

  // One second later: the second frame, and one second into the IMU streams.
  const later = snapshotAt(twoClockData, 1);
  expect(later.frameNumber).toBe(2);
  expect(later.arkit.x).toBeCloseTo(5);
  expect(later.gyro.x).toBeCloseTo(7);
  expect(later.observer.latitudeDeg).toBeCloseTo(100);
});

test("sampling the ARKit stream on the IMU clock would lag by the offset", () => {
  // Guards the bug this offset exists to fix: without it, video time 1 reads
  // the pose from before the recording's first frame and the overlay trails
  // the scene by the whole offset.
  const withoutOffset = snapshotAt({ ...twoClockData, frames: [[0, 1], [1, 2]] }, 1);
  expect(withoutOffset.arkit.x).toBeCloseTo(0);
  expect(snapshotAt(twoClockData, 1).arkit.x).toBeCloseTo(5);
});

/**
 * Checks the staged recording itself, not just the code that reads it.
 *
 * Both of these compare the ARKit stream against a sensor it has no way of
 * agreeing with by accident, and both failed outright on a mismatched asset
 * once: its poses turned out to belong to a different recording from its IMU
 * streams — and to a different one from the video, so the overlay was being
 * aimed by a walk that was not the walk on screen. Run
 * `npm run prepare-test-data` if either of these goes red.
 */
describeIfStaged("against a staged recording", () => {
  const data: RecordingData = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
  const offset = sensorTimeOffsetSeconds(data);
  const every = 51;

  test("the poses agree with the recording's own accelerometer", () => {
    // Averaged over a walk, what the accelerometer feels is gravity, so
    // rotating it into ARKit's frame by ARKit's own pose has to land on that
    // frame's up axis. Footsteps and the odd swing are what the tolerance is
    // for; a pose stream that did not belong here would not point anywhere.
    let east = 0;
    let north = 0;
    let up = 0;
    let count = 0;

    for (let index = 0; index < data.arkit.length; index += every) {
      const row = data.arkit[index];
      const rotation = normalizeQuaternion({ w: row[4], x: row[5], y: row[6], z: row[7] });
      const [, x, y, z] = sampleInterpolated(data.accelerometer, row[0] - offset);
      const length = Math.hypot(x, y, z);
      const world = rotateVector(rotation, { x: x / length, y: y / length, z: z / length });
      east += world.x;
      north += -world.z;
      up += world.y;
      count += 1;
    }

    const mean = Math.hypot(east, north, up) / count;
    // Within five degrees of straight up, and consistent enough that the
    // samples have not averaged themselves away.
    expect(mean).toBeGreaterThan(0.9);
    expect(Math.acos(up / count / mean) * (180 / Math.PI)).toBeLessThan(5);
  });

  test("north stands still while the phone turns, once its own field is removed", () => {
    const bearings = (hardIron: { x: number; y: number; z: number }) => {
      const angles: number[] = [];
      for (let index = 0; index < data.arkit.length; index += every) {
        const row = data.arkit[index];
        const magnetometer = sampleInterpolated(data.magnetometer, row[0] - offset);
        angles.push(attitudeFromArkit(row, magnetometer, hardIron).northOffset);
      }
      return angles;
    };

    // Circular standard deviation: the ordinary one is meaningless on a
    // quantity that wraps.
    const wander = (angles: number[]) => {
      const sin = angles.reduce((total, angle) => total + Math.sin(toRadians(angle)), 0);
      const cos = angles.reduce((total, angle) => total + Math.cos(toRadians(angle)), 0);
      const resultant = Math.hypot(sin, cos) / angles.length;
      return Math.sqrt(-2 * Math.log(resultant)) * (180 / Math.PI);
    };

    // The phone turns through most of a circle over the recording. A reference
    // that turned with it — as the raw reading's does — is no reference at all.
    expect(wander(bearings(hardIronOffset(data)))).toBeLessThan(15);
    expect(wander(bearings({ x: 0, y: 0, z: 0 }))).toBeGreaterThan(90);
  });
});
