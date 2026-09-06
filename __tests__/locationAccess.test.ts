/**
 * The order the fix is asked for in, and what the compass behind the same
 * permission does when it is asked too early or answers too late.
 *
 * `expo-location` has no answer off a device, so it is stood in for here. What
 * is checked is the sequence: a permission before a reading, and a bounded wait
 * on a compass that has no answer at all.
 */

import { readMagneticDeclinationDeg, requestObserverFix } from "../src/device/location";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getHeadingAsync: jest.fn(),
  Accuracy: { Balanced: 3 }
}));

const location = jest.requireMock("expo-location") as Record<string, jest.Mock>;

const position = {
  coords: { latitude: 60.17, longitude: 24.94, altitude: 12 }
};

beforeEach(() => {
  jest.clearAllMocks();
  location.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });
  location.hasServicesEnabledAsync.mockResolvedValue(true);
  location.getCurrentPositionAsync.mockResolvedValue(position);
});

describe("the fix", () => {
  test("is asked for permission before the phone is read", async () => {
    const order: string[] = [];
    location.requestForegroundPermissionsAsync.mockImplementation(async () => {
      order.push("asked");
      return { status: "granted" };
    });
    location.getCurrentPositionAsync.mockImplementation(async () => {
      order.push("read");
      return position;
    });

    await expect(requestObserverFix()).resolves.toMatchObject({ latitudeDeg: 60.17 });
    expect(order).toEqual(["asked", "read"]);
  });

  test("a refusal is a reason, not a reading", async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });

    await expect(requestObserverFix()).rejects.toThrow(/refused/i);
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});

describe("the declination", () => {
  test("is the difference between the two norths the platform reports", async () => {
    location.getHeadingAsync.mockResolvedValue({ trueHeading: 100, magHeading: 90 });

    await expect(readMagneticDeclinationDeg()).resolves.toBeCloseTo(10);
  });

  test("is nothing when the compass is asked without the permission behind it", async () => {
    // What the platform does on a first launch if this is asked for alongside
    // the fix rather than after it: the heading is behind the same foreground
    // permission, and refuses until it is granted. Boot orders the two so this
    // does not happen (`requestAccess`); if it ever does again, the cost is a
    // heading referenced to magnetic north rather than a boot that stops.
    location.getHeadingAsync.mockRejectedValue(new Error("DeniedForegroundLocationPermission"));

    await expect(readMagneticDeclinationDeg()).resolves.toBeNull();
  });

  test("gives up on a compass that never settles, rather than holding boot open", async () => {
    // The platform's own call resolves on the first heading good enough to use
    // and has no answer for a compass that never reports one. Boot waits on
    // this, and a boot screen that never finishes is the worst of the failures
    // available here.
    jest.useFakeTimers();
    try {
      location.getHeadingAsync.mockReturnValue(new Promise(() => undefined));

      const declination = readMagneticDeclinationDeg();
      await jest.advanceTimersByTimeAsync(5000);

      await expect(declination).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a phone that cannot apply a declination reports none", async () => {
    // iOS reports a negative true heading when it has nothing to apply.
    location.getHeadingAsync.mockResolvedValue({ trueHeading: -1, magHeading: 90 });

    await expect(readMagneticDeclinationDeg()).resolves.toBeNull();
  });
});
