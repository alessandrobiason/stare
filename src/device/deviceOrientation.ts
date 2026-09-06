import { DeviceMotion, DeviceMotionMeasurement, Magnetometer } from "expo-sensors";
import { attitudeFromAxes } from "../camera/attitude";
import { DeviceCapabilities } from "./capabilities";
import { subscribeToCompass } from "./location";
import { toDegrees, wrapDegrees180 } from "../math/angles";
import { Quaternion, rotateVector, Vector3 } from "../math/quaternion";
import { EnuPosition } from "../types";

/**
 * Live device attitude: how the view is aimed on a phone, and the only source
 * of aim the app itself has. The replay harness overrides it with a recorded
 * stream, which is what makes the projection checkable against a ground truth.
 *
 * Same conventions as the recording reports: `yaw`, `pitch` and `roll` describe
 * the rear camera's optical axis, and `northOffset` says where the yaw origin
 * sits relative to north. See `CameraAttitude` and `AttitudeMeasurement`.
 */
export type DeviceOrientation = {
  yaw: number;
  pitch: number;
  roll: number;
  northOffset?: number;
  gyro?: { x: number; y: number; z: number };
  /**
   * The declination folded into `northOffset`, in degrees east, or `undefined`
   * where the platform has never supplied one — in which case the offset is to
   * *magnetic* north and headings are out by the local declination.
   *
   * Reported alongside rather than left implicit because it is now a live
   * figure: boot's is a single reading behind a timeout, and the compass watch
   * corrects it as it settles and as the phone travels (`subscribeToCompass`).
   */
  declination?: number;
  /**
   * The platform's grade of its own compass, 0 to 3, or `undefined` before the
   * first heading. What `northOffset` is worth — see `CompassReading`.
   */
  compassAccuracy?: number;
};

const LEVEL: DeviceOrientation = { yaw: 0, pitch: 0, roll: 0 };

const UPDATE_INTERVAL_MS = 50;

/** The rear camera looks along the device's -z; +x is the right of the frame. */
const LENS_AXIS: Vector3 = { x: 0, y: 0, z: -1 };
const FRAME_RIGHT_AXIS: Vector3 = { x: 1, y: 0, z: 0 };

/** The device-orientation world frame is already east / north / up. */
const inWorldFrame = (vector: Vector3): EnuPosition => ({
  east: vector.x,
  north: vector.y,
  up: vector.z
});

/** True when the sensor answers for itself; a probe that throws counts as absent. */
async function isAvailable(sensor: { isAvailableAsync(): Promise<boolean> }): Promise<boolean> {
  try {
    return await sensor.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Whether the platform makes the *readings* conditional on a permission.
 *
 * A browser does: iOS Safari hands out `DeviceMotionEvent.requestPermission`,
 * and until that is granted no motion event fires at all. A phone does not.
 * `CMMotionManager` — the attitude, the rotation rate and the magnetic field,
 * which is everything this module reads — is unauthenticated on iOS. The
 * "Motion & Fitness" prompt that `requestPermissionsAsync` raises there belongs
 * to `CMPedometer`: step counts and activity, none of which this app touches.
 *
 * So the phone is not asked. Asking put a system prompt in front of someone for
 * data the app never reads, and then took the answer — or a phone with Motion &
 * Fitness turned off in Settings, which is a common enough thing to have done
 * once — as a reason to stop aiming the view altogether: a live camera under a
 * sky frozen at level, with nothing on screen to say why.
 *
 * Detected by the API that does the gating rather than by asking React Native
 * which platform this is, as with the persistent store.
 *
 * The Info.plist follows: `app.json` turns off the `NSMotionUsageDescription`
 * both `expo-sensors` and `expo-location` would otherwise write, since the app
 * no longer reaches the prompt it is there for. A purpose string for a
 * permission nothing asks for is a promise about data the app does not take.
 */
function readingsNeedPermission(): boolean {
  const events = globalThis as {
    DeviceMotionEvent?: { requestPermission?: unknown };
    DeviceOrientationEvent?: { requestPermission?: unknown };
  };
  return (
    typeof events.DeviceMotionEvent?.requestPermission === "function" ||
    typeof events.DeviceOrientationEvent?.requestPermission === "function"
  );
}

/**
 * Probes the two sensors this module reads. Availability only — asking for
 * permission here would put a system prompt in front of someone before the view
 * they asked for; `subscribeToDeviceOrientation` asks when it subscribes, and
 * only where the reading needs it.
 */
export async function readDeviceCapabilities(): Promise<DeviceCapabilities> {
  const [motion, magnetometer] = await Promise.all([
    isAvailable(DeviceMotion),
    isAvailable(Magnetometer)
  ]);
  return { motion, magnetometer };
}

/**
 * Subscribes to whatever `capabilities` says this device has, resolving to an
 * unsubscribe function.
 *
 * Without motion there is no attitude at all: it reports level once and returns
 * a no-op. Boot stops a device that lacks the sensor outright, so what is
 * handled here is a browser refusing the reading — the one platform where a
 * permission stands between this and the sensor (`readingsNeedPermission`).
 *
 * The magnetometer is taken separately, since losing it still leaves a usable
 * pitch and roll — only the bearing to north goes, which `northOffset` already
 * reports as absent.
 *
 * `declinationDeg` is boot's reading, or `null` where it had none by the time
 * the view opened. Either way it is only a starting point: the compass watch
 * below corrects it as the platform settles and as the phone travels.
 */
export async function subscribeToDeviceOrientation(
  onChange: (orientation: DeviceOrientation) => void,
  capabilities: DeviceCapabilities,
  declinationDeg: number | null
): Promise<() => void> {
  const gated = readingsNeedPermission();

  if (
    !capabilities.motion ||
    (gated && (await DeviceMotion.requestPermissionsAsync()).status !== "granted")
  ) {
    onChange(LEVEL);
    return () => undefined;
  }

  const useMagnetometer =
    capabilities.magnetometer &&
    (!gated || (await Magnetometer.requestPermissionsAsync()).status === "granted");

  let rotation: Quaternion | null = null;
  let field: Vector3 | null = null;
  let orientation = LEVEL;
  let declination = declinationDeg;
  let compassAccuracy: number | undefined;

  DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
  if (useMagnetometer) Magnetometer.setUpdateInterval(UPDATE_INTERVAL_MS);

  const publish = () => {
    if (!rotation) return;
    const attitude = attitudeFromAxes(
      inWorldFrame(rotateVector(rotation, LENS_AXIS)),
      inWorldFrame(rotateVector(rotation, FRAME_RIGHT_AXIS))
    );
    orientation = {
      ...orientation,
      yaw: wrapDegrees180(attitude.headingDeg),
      pitch: attitude.pitchDeg,
      roll: attitude.rollDeg,
      // Magnetic north where there is no declination to be had, which is a
      // heading out by the local figure rather than a heading out by anything.
      // Reported as such below, so a view that is quietly a few degrees off
      // says so instead of looking like a view that is not.
      northOffset: field ? northOffsetDeg(rotation, field, declination ?? 0) : undefined,
      declination: declination ?? undefined,
      compassAccuracy
    };
    onChange(orientation);
  };

  const motionSubscription = DeviceMotion.addListener(
    ({ rotation: euler, rotationRate }: DeviceMotionMeasurement) => {
      if (!euler) return;
      rotation = fromDeviceOrientationAngles(euler.alpha, euler.beta, euler.gamma);
      orientation = {
        ...orientation,
        gyro: rotationRate
          ? { x: rotationRate.alpha, y: rotationRate.beta, z: rotationRate.gamma }
          : undefined
      };
      publish();
    }
  );

  const magnetometerSubscription = useMagnetometer
    ? Magnetometer.addListener(({ x, y, z }) => {
        // A dead sensor reports exactly zero on every axis, which has no bearing
        // in it at all.
        if (x === 0 && y === 0 && z === 0) return;
        field = { x, y, z };
        publish();
      })
    : null;

  /**
   * The platform's compass, for the two things the raw magnetometer cannot say
   * for itself: where true north is relative to magnetic, and whether any of
   * this is calibrated (`subscribeToCompass`).
   *
   * Not awaited. The attitude is what the view is aimed with and it must not
   * wait on a heading watch that may never register — on a device that refused
   * the fix, it never will. So it starts alongside, and until it reports the
   * readings carry boot's declination and no accuracy at all.
   *
   * Nothing is published from here either: the motion listener fires twenty
   * times a second and picks these up on its next reading, which is 50 ms and
   * saves a publish per heading.
   */
  let stopCompass: (() => void) | null = null;
  let stopped = false;
  if (useMagnetometer) {
    subscribeToCompass(({ declinationDeg: fromCompass, accuracy }) => {
      // A heading with no true north in it still grades the compass, and the
      // grade is the half that says whether to trust the bearing.
      if (fromCompass !== null) declination = fromCompass;
      compassAccuracy = accuracy;
    })
      .then((cleanup) => {
        // The watch can register after this subscription has been torn down.
        if (stopped) cleanup();
        else stopCompass = cleanup;
      })
      // Boot already read a declination, or decided there was none; losing the
      // watch only means it stops being corrected.
      .catch((error) => console.warn("Compass updates unavailable", error));
  }

  return () => {
    stopped = true;
    motionSubscription.remove();
    magnetometerSubscription?.remove();
    stopCompass?.();
  };
}

/**
 * Bearing of the attitude source's yaw origin, clockwise from true north.
 *
 * The reading is rotated out of the body frame before its bearing is taken, so
 * tilting the phone does not move north — which is why a raw `atan2(y, x)` of
 * the sensor is not a heading. It need not know whether the platform's yaw is
 * north-referenced already: if it is, the field comes out pointing north and
 * this reduces to the declination.
 *
 * No hard-iron term, unlike the recording: the platform calibrates its own
 * magnetometer. It does not always calibrate it *well*, and there is nothing in
 * a field reading that says which — a bias reads exactly like a field — so what
 * the platform thinks of its own compass is carried alongside as
 * `compassAccuracy` rather than assumed away here.
 *
 * `declinationDeg` is the caller's: boot's figure corrected by the compass
 * watch on a phone, the recording's constant under the harness.
 */
function northOffsetDeg(
  rotation: Quaternion,
  field: Vector3,
  declinationDeg: number
): number {
  const world = inWorldFrame(rotateVector(rotation, field));
  return declinationDeg - toDegrees(Math.atan2(world.east, world.north));
}

/**
 * The rotation behind the W3C device-orientation angles: an intrinsic Z-X'-Y''
 * sequence taking the device's axes onto east / north / up.
 *
 * Composed as a quaternion, not read as three tilts. `beta` and `gamma` are the
 * pitch and roll of the *screen* held upright; the camera's axes are a
 * different rotation of the same pose, and composing first is what keeps that
 * distinction from becoming a tilt-dependent error.
 */
function fromDeviceOrientationAngles(alpha: number, beta: number, gamma: number): Quaternion {
  const halfX = beta / 2;
  const halfY = gamma / 2;
  const halfZ = alpha / 2;
  const cx = Math.cos(halfX);
  const sx = Math.sin(halfX);
  const cy = Math.cos(halfY);
  const sy = Math.sin(halfY);
  const cz = Math.cos(halfZ);
  const sz = Math.sin(halfZ);

  return {
    w: cx * cy * cz - sx * sy * sz,
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz
  };
}
