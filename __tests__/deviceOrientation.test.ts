/**
 * What the phone is asked for before it will aim the view, and what it is not.
 *
 * The module under test reaches for `expo-sensors`, which has no answer off a
 * device, so the sensors are stood in for here. What is being checked is not
 * the readings — `cameraAttitude.test.ts` and `angles.test.ts` do that — but
 * the one decision above them: whether a permission stands between the app and
 * the sensor, and what happens when the answer is no.
 *
 * The platform's compass is stood in for too. What it contributes is not a
 * bearing — the magnetometer gives that — but the two things a raw field cannot
 * say for itself: where true north is relative to magnetic, and whether any of
 * it is calibrated.
 */

import { DeviceCapabilities } from "../src/device/capabilities";
import {
  DeviceOrientation,
  subscribeToDeviceOrientation
} from "../src/device/deviceOrientation";

jest.mock("expo-location", () => ({
  watchHeadingAsync: jest.fn()
}));

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

const location = jest.requireMock("expo-location") as Record<string, jest.Mock>;

/** One heading, as the platform's compass reports one. */
type Heading = { trueHeading: number; magHeading: number; accuracy: number };

/** The compass listener the module registered, so a heading can be pushed through it. */
let report: (heading: Heading) => void;

/** The magnetometer listener, since a bearing needs a field to be taken from. */
let field: (reading: { x: number; y: number; z: number }) => void;

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
  magnetometer.addListener.mockImplementation((listener: typeof field) => {
    field = listener;
    return { remove: jest.fn() };
  });
  report = () => undefined;
  field = () => undefined;
  location.watchHeadingAsync.mockImplementation(async (listener: typeof report) => {
    report = listener;
    return { remove: jest.fn() };
  });
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

/** Lets the compass watch's own promise settle, since nothing awaits it. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A field pointing along the device's +y with the dip on -z. Held level this is
 * magnetic north dead ahead, so the offset that comes out is the declination
 * and nothing else — which is what these tests are reading.
 */
const northward = { x: 0, y: 20, z: -40 };

describe("the platform's compass", () => {
  test("fills in a declination boot never got, rather than leaving the session on magnetic north", async () => {
    // Boot waits three seconds and then goes without one. That used to cost the
    // whole session the local declination on the one launch where the compass
    // was slow — and left two phones side by side disagreeing by exactly it.
    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, null);

    field(northward);
    emit(levelMeasurement);
    expect(readings.at(-1)).toMatchObject({ northOffset: 0, declination: undefined });

    report({ trueHeading: 97, magHeading: 90, accuracy: 3 });
    emit(levelMeasurement);
    expect(readings.at(-1)).toMatchObject({ northOffset: 7, declination: 7 });
  });

  test("goes on correcting it, since the declination belongs to the place not the phone", async () => {
    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, 3);

    field(northward);
    report({ trueHeading: 108, magHeading: 90, accuracy: 3 });
    emit(levelMeasurement);

    expect(readings.at(-1)).toMatchObject({ declination: 18 });
  });

  test("grades itself even on a heading with no true north in it", async () => {
    // The grade is the half that says whether to trust the bearing at all, and
    // it arrives whether or not the platform has a declination to go with it.
    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, 4);

    field(northward);
    report({ trueHeading: -1, magHeading: 90, accuracy: 0 });
    emit(levelMeasurement);

    expect(readings.at(-1)).toMatchObject({ declination: 4, compassAccuracy: 0 });
  });

  test("the attitude does not wait on it", async () => {
    // A watch that never registers — a device that refused the fix — must not
    // hold up the view: this resolving at all is the assertion.
    location.watchHeadingAsync.mockReturnValue(new Promise(() => undefined));

    const readings: DeviceOrientation[] = [];
    await subscribeToDeviceOrientation((next) => readings.push(next), bothSensors, 0);

    emit(levelMeasurement);
    expect(readings).toHaveLength(1);
  });

  test("is not opened at all without the magnetometer it would be correcting", async () => {
    await subscribeToDeviceOrientation(() => undefined, { motion: true, magnetometer: false }, 0);

    expect(location.watchHeadingAsync).not.toHaveBeenCalled();
  });

  test("is torn down with the sensors", async () => {
    const remove = jest.fn();
    location.watchHeadingAsync.mockResolvedValue({ remove });

    const unsubscribe = await subscribeToDeviceOrientation(() => undefined, bothSensors, 0);
    await flush();
    unsubscribe();

    expect(remove).toHaveBeenCalled();
  });

  test("a watch that registers after the teardown is torn down anyway", async () => {
    // Nothing awaits it, so this is the ordering that actually happens when a
    // scene unmounts in the seconds before the compass answers.
    const remove = jest.fn();
    let settle: (subscription: { remove: () => void }) => void = () => undefined;
    location.watchHeadingAsync.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );

    const unsubscribe = await subscribeToDeviceOrientation(() => undefined, bothSensors, 0);
    unsubscribe();
    settle({ remove });
    await flush();

    expect(remove).toHaveBeenCalled();
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
