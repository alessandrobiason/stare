/**
 * What the phone is asked for before it will aim the view, and what it is not.
 *
 * The module under test reaches for `expo-sensors`, which has no answer off a
 * device, so the sensors are stood in for here. What is being checked is not
 * the readings — `cameraAttitude.test.ts` and `angles.test.ts` do that — but
 * the one decision above them: whether a permission stands between the app and
 * the sensor, and what happens when the answer is no.
 */

import { DeviceCapabilities } from "../src/device/capabilities";
import {
  DeviceOrientation,
  subscribeToDeviceOrientation
} from "../src/device/deviceOrientation";

jest.mock("expo-sensors", () => ({
  DeviceMotion: {
    requestPermissionsAsync: jest.fn(),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn()
  },
  Magnetometer: {
    requestPermissionsAsync: jest.fn(),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn()
  }
}));

type Sensor = Record<string, jest.Mock>;

const { DeviceMotion: deviceMotion, Magnetometer: magnetometer } = jest.requireMock(
  "expo-sensors"
) as { DeviceMotion: Sensor; Magnetometer: Sensor };

const bothSensors: DeviceCapabilities = { motion: true, magnetometer: true };

/** A reading of the phone held level, as `DeviceMotion` reports one. */
const levelMeasurement = { rotation: { alpha: 0, beta: 0, gamma: 0 }, rotationRate: null };

/** The listener the module registered, so a reading can be pushed through it. */
type Emit = (measurement: unknown) => void;

let emit: Emit;

beforeEach(() => {
  jest.clearAllMocks();
  emit = () => undefined;
  deviceMotion.addListener.mockImplementation((listener: Emit) => {
    emit = listener;
    return { remove: jest.fn() };
  });
  magnetometer.addListener.mockImplementation(() => ({ remove: jest.fn() }));
  deviceMotion.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  magnetometer.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  delete (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent;
});

afterEach(() => {
  delete (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent;
});

/** Puts the browser's gate in place: the API iOS Safari asks through. */
function browserGate(): void {
  (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent = {
    requestPermission: () => Promise.resolve("granted")
  };
}

describe("on a phone, where the reading is not behind a permission", () => {
  test("nothing is asked for, and the sensors are subscribed to directly", async () => {
    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, 0);

    // The prompt this used to raise was "Motion & Fitness", which is the
    // pedometer's. Nothing here reads a step count, and the attitude arrives
    // whatever that permission says.
    expect(deviceMotion.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(deviceMotion.addListener).toHaveBeenCalled();

    emit(levelMeasurement);
    expect(readings).toHaveLength(1);
  });

  test("a phone with Motion & Fitness turned off still aims the view", async () => {
    // The setting is a common enough thing to have turned off once, and it has
    // no bearing on `CMMotionManager`. Refusing to subscribe over it left a
    // live camera under a sky frozen at level, with nothing on screen saying
    // why — so the answer is not asked for, and not acted on if it were.
    deviceMotion.requestPermissionsAsync.mockResolvedValue({ status: "denied" });

    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, 0);

    // Subscribed, and nothing published in place of a reading: what came back
    // used to be a single level attitude and no subscription at all.
    expect(deviceMotion.addListener).toHaveBeenCalled();
    expect(readings).toEqual([]);

    emit(levelMeasurement);
    expect(readings).toHaveLength(1);
  });

  test("the magnetometer is taken without a prompt of its own", async () => {
    await subscribeToDeviceOrientation(() => undefined, bothSensors, 0);

    expect(magnetometer.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(magnetometer.addListener).toHaveBeenCalled();
  });
});

describe("in a browser, where it is", () => {
  test("the permission is asked for, since no event fires without it", async () => {
    browserGate();
    await subscribeToDeviceOrientation(() => undefined, bothSensors, 0);

    expect(deviceMotion.requestPermissionsAsync).toHaveBeenCalled();
    expect(deviceMotion.addListener).toHaveBeenCalled();
  });

  test("a refusal reports level once rather than waiting on a reading that cannot come", async () => {
    browserGate();
    deviceMotion.requestPermissionsAsync.mockResolvedValue({ status: "denied" });

    const readings: DeviceOrientation[] = [];
    const unsubscribe = await subscribeToDeviceOrientation(
      (next) => readings.push(next),
      bothSensors,
      0
    );

    expect(readings).toEqual([{ yaw: 0, pitch: 0, roll: 0 }]);
    expect(deviceMotion.addListener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

test("a device with no motion sensor is not asked for anything", async () => {
  browserGate();
  const readings: DeviceOrientation[] = [];
  await subscribeToDeviceOrientation(
    (next) => readings.push(next),
    { motion: false, magnetometer: false },
    0
  );

  expect(deviceMotion.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(readings).toEqual([{ yaw: 0, pitch: 0, roll: 0 }]);
});
