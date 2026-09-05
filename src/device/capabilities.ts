/**
 * The two sensors the live attitude path reads. `motion` is the rotation and
 * rotation rate — the attitude itself; `magnetometer` is the field its yaw
 * origin is referenced to north with.
 *
 * Both are required to aim the view on a phone: without motion there is no
 * attitude, and without the magnetometer every marker sits at an unknown
 * bearing. Older iPhones can lack the magnetometer and a simulator has neither,
 * so `readDeviceCapabilities` asks rather than assuming. Only the replay, which
 * carries a recorded attitude, can do without them.
 *
 * Free of any sensor import, so the boot sequence can be tested without pulling
 * `expo-sensors` in behind it.
 */
export type DeviceCapabilities = {
  /** Attitude and rotation rate are available. */
  motion: boolean;
  /** A magnetic field reading is available, so yaw can be tied to north. */
  magnetometer: boolean;
};

/** Nothing found, the state a device that cannot be probed is treated as being in. */
export const NO_CAPABILITIES: DeviceCapabilities = { motion: false, magnetometer: false };

/**
 * The missing sensor and what its absence costs, or `null` when both are there.
 * Says what is missing, not how much it matters: that depends on the mode — see
 * `runBootSequence`.
 */
export function describeMissingCapabilities(capabilities: DeviceCapabilities): string | null {
  if (!capabilities.motion) {
    return "This device has no motion sensor, so there is no attitude to aim the view with.";
  }
  if (!capabilities.magnetometer) {
    return "This device has no magnetometer, so a heading cannot be referenced to north.";
  }
  return null;
}
