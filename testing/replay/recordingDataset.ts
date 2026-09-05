import { attitudeFromAxes } from "../../src/camera/attitude";
import { toDegrees, wrapDegrees180, wrapDegrees360 } from "../../src/math/angles";
import { normalizeQuaternion, Quaternion, rotateVector } from "../../src/math/quaternion";
import { EnuPosition, ObserverLocation } from "../../src/types";
import { MAGNETIC_DECLINATION_DEG } from "./constants";
import { fitHardIronOffset, HardIronOffset, withoutHardIron } from "./magnetometerCalibration";
import { sampleInterpolated, sampleNearest, TimeSeries } from "./timeSeries";

/**
 * A recorded iPhone stream, from whichever recording
 * `testing/tools/prepare-test-data.mjs` last staged (see `TEST_DATA_DIR`).
 *
 * The extracted JSON keeps one array per sensor. Every row is
 * `[elapsedSeconds, ...channels]`; timestamps are seconds from the start of
 * the recording, not an absolute date.
 */
export type RecordingData = {
  frames: TimeSeries;
  arkit: TimeSeries;
  locations: TimeSeries;
  accelerometer: TimeSeries;
  gyro: TimeSeries;
  magnetometer: TimeSeries;
  barometer: TimeSeries;
};

export type Vector3 = { x: number; y: number; z: number };

/**
 * Where the rear camera pointed, in the conventions `CameraAttitude` fixes:
 * `heading` is the compass bearing of the optical axis in `[0, 360)`, `pitch`
 * its elevation, and `roll` the bank about it, right-hand side down positive.
 */
export type DeviceAttitude = {
  heading: number;
  pitch: number;
  roll: number;
  /** The same bearing measured from ARKit's own yaw origin instead of north. */
  yaw: number;
  /** Bearing of that yaw origin, clockwise from true north. */
  northOffset: number;
};

/** Every sensor stream resolved to a single video timestamp. */
export type RecordingSnapshot = {
  elapsedSeconds: number;
  frameNumber: number;
  observer: ObserverLocation;
  orientation: DeviceAttitude;
  arkit: Vector3 & { qx: number; qy: number; qz: number; qw: number };
  accelerometer: Vector3;
  gyro: Vector3;
  magnetometer: Vector3;
  barometer: { pressureKpa: number; relativeAltitudeM: number };
};

const DATASET_URL = "/dataset-iphone-sensors.json";

const REQUIRED_STREAMS: (keyof RecordingData)[] = [
  "frames",
  "arkit",
  "locations",
  "accelerometer",
  "gyro",
  "magnetometer",
  "barometer"
];

let datasetPromise: Promise<RecordingData> | null = null;

function assertComplete(data: RecordingData): RecordingData {
  const missing = REQUIRED_STREAMS.filter(
    (stream) => !Array.isArray(data[stream]) || data[stream].length === 0
  );
  if (missing.length > 0) {
    throw new Error(`Recorded sensor data is incomplete (missing: ${missing.join(", ")})`);
  }
  return data;
}

/** Loads the extracted sensor JSON once per session. */
export function loadRecordingDataset(): Promise<RecordingData> {
  if (!datasetPromise) {
    datasetPromise = fetch(DATASET_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load recorded sensor data (${response.status})`);
        return response.json() as Promise<RecordingData>;
      })
      .then(assertComplete)
      .catch((error) => {
        // Do not cache a rejected promise: a transient failure would otherwise
        // make every later load fail too.
        datasetPromise = null;
        throw error;
      });
  }
  return datasetPromise;
}

/**
 * Seconds to add to a video timestamp to reach the `frames`/`arkit` timeline.
 *
 * The recording carries two clocks: the IMU streams are stamped from zero,
 * while `frames` and `arkit` start when the camera session came up — and the
 * video cut from those frames starts at zero again. So video time `t` is IMU
 * time `t` but ARKit time `t + this`.
 *
 * Measured, not assumed: correlating the ARKit quaternions' body rates against
 * the gyro peaks sharply when the stream is shifted by exactly its own first
 * timestamp, and drops off either side of that value.
 *
 * Ignoring it costs a third of a second of attitude lag — a quarter of the
 * frame at a 60 deg/s pan, snapping back the moment the device stops.
 */
export function sensorTimeOffsetSeconds(data: RecordingData): number {
  return data.frames[0][0];
}

/**
 * ARKit reports its poses in a gravity-aligned, right-handed frame with +y up
 * and the heading of its -z axis fixed arbitrarily when the session started.
 * These map it onto the level frame the rest of the app works in, whose
 * "north" is that arbitrary axis until the magnetometer says where north is.
 */
const inSessionFrame = (vector: Vector3): EnuPosition => ({
  east: vector.x,
  north: -vector.z,
  up: vector.y
});

/** The rear camera looks along the device's -z; +x is the right of the frame. */
const LENS_AXIS: Vector3 = { x: 0, y: 0, z: -1 };
const FRAME_RIGHT_AXIS: Vector3 = { x: 1, y: 0, z: 0 };

const NO_HARD_IRON: HardIronOffset = { x: 0, y: 0, z: 0 };

/**
 * Where the rear camera pointed, from the ARKit pose and the magnetometer.
 *
 * Pose columns are `[time, x, y, z, qw, qx, qy, qz]` — scalar first, the one
 * thing here worth checking against the data rather than assuming. Read as
 * scalar-last it is a different rotation: the optical axis came out a median
 * 62 degrees off, rolling through the full circle over a recording the phone
 * was never tilted more than 10 degrees in.
 *
 * The sources answer different questions. ARKit's yaw is smooth and driftless
 * but measured from wherever the session started, so it says how the camera has
 * turned, not which way it faces; the magnetometer is noisy but knows north. So
 * the axes come from ARKit alone, and the magnetometer fixes only the constant
 * relating ARKit's yaw origin to north.
 */
export function attitudeFromArkit(
  pose: number[],
  magnetometer: number[],
  hardIron: HardIronOffset = NO_HARD_IRON
): DeviceAttitude {
  const rotation = normalizeQuaternion({ w: pose[4], x: pose[5], y: pose[6], z: pose[7] });
  const attitude = attitudeFromAxes(
    inSessionFrame(rotateVector(rotation, LENS_AXIS)),
    inSessionFrame(rotateVector(rotation, FRAME_RIGHT_AXIS))
  );
  const northOffset = northOffsetDeg(rotation, magnetometer, hardIron);

  return {
    heading: wrapDegrees360(attitude.headingDeg + northOffset),
    pitch: attitude.pitchDeg,
    roll: attitude.rollDeg,
    // Kept apart as well as summed: the two terms are trustworthy over
    // different timescales, and the attitude filter fuses them separately.
    yaw: wrapDegrees180(attitude.headingDeg),
    northOffset: wrapDegrees180(northOffset)
  };
}

/**
 * Bearing of ARKit's yaw origin, clockwise from true north.
 *
 * The reading is rotated into ARKit's frame before its bearing is taken, which
 * makes this a property of the room rather than of how the phone is held.
 * `atan2` of the raw body-frame x and y — the obvious thing — measures the
 * field in a frame that turns with the device, so the "reference" swings by
 * roughly the device's own yaw and cancels the rotation it should anchor.
 * `__tests__/recordingDataset.test.ts` checks the circular deviation of both
 * against a real recording, where the difference is stark.
 */
function northOffsetDeg(
  rotation: Quaternion,
  magnetometer: number[],
  hardIron: HardIronOffset
): number {
  const reading = withoutHardIron(
    { x: magnetometer[1], y: magnetometer[2], z: magnetometer[3] },
    hardIron
  );
  const field = inSessionFrame(rotateVector(rotation, reading));
  const magneticNorth = toDegrees(Math.atan2(field.east, field.north));

  return MAGNETIC_DECLINATION_DEG - magneticNorth;
}

/**
 * The recording's hard-iron offset, fitted once and remembered.
 *
 * Keyed off the dataset rather than held in a module variable so that two
 * recordings in one session cannot inherit each other's calibration.
 */
const hardIronByDataset = new WeakMap<RecordingData, HardIronOffset>();

export function hardIronOffset(data: RecordingData): HardIronOffset {
  let offset = hardIronByDataset.get(data);
  if (!offset) {
    offset = fitHardIronOffset(data.magnetometer);
    hardIronByDataset.set(data, offset);
  }
  return offset;
}

/**
 * Resolves every sensor stream at a video timestamp. Continuous channels are
 * interpolated; the frame number is snapped to the nearest actual frame.
 *
 * `elapsedSeconds` is the video's own clock. The camera streams are read on
 * their own timeline and the IMU streams on theirs — see
 * `sensorTimeOffsetSeconds`.
 */
export function snapshotAt(data: RecordingData, elapsedSeconds: number): RecordingSnapshot {
  // Column 0 of every row is its timestamp, so each stream's channels start at
  // index 1: locations are [lat, lon, height], the IMU streams [x, y, z], and
  // ARKit [x, y, z, qw, qx, qy, qz].
  const cameraSeconds = elapsedSeconds + sensorTimeOffsetSeconds(data);
  const frame = sampleNearest(data.frames, cameraSeconds);
  const pose = sampleInterpolated(data.arkit, cameraSeconds);
  const location = sampleInterpolated(data.locations, elapsedSeconds);
  const accelerometer = sampleInterpolated(data.accelerometer, elapsedSeconds);
  const gyro = sampleInterpolated(data.gyro, elapsedSeconds);
  const magnetometer = sampleInterpolated(data.magnetometer, elapsedSeconds);
  const barometer = sampleInterpolated(data.barometer, elapsedSeconds);

  return {
    elapsedSeconds,
    frameNumber: frame[1],
    observer: { latitudeDeg: location[1], longitudeDeg: location[2], heightM: location[3] },
    orientation: attitudeFromArkit(pose, magnetometer, hardIronOffset(data)),
    arkit: {
      x: pose[1],
      y: pose[2],
      z: pose[3],
      qw: pose[4],
      qx: pose[5],
      qy: pose[6],
      qz: pose[7]
    },
    accelerometer: { x: accelerometer[1], y: accelerometer[2], z: accelerometer[3] },
    gyro: { x: gyro[1], y: gyro[2], z: gyro[3] },
    magnetometer: { x: magnetometer[1], y: magnetometer[2], z: magnetometer[3] },
    barometer: { pressureKpa: barometer[1], relativeAltitudeM: barometer[2] }
  };
}
