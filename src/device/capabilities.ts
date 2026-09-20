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
 * Which sensor is missing, as a key the boot screen can write out in the
 * reader's own language, or `null` when both are there.
 *
 * Says what is missing, not how much it matters: that depends on the mode — see
 * `runBootSequence`. A key rather than a sentence for the reason in
 * `src/boot/bootFailure.ts`: this is the last thing somebody sees before the
 * app gives up, and it was the one line on that screen still in English.
 */
export function missingCapability(
  capabilities: DeviceCapabilities
): "noMotionSensor" | "noMagnetometer" | null {
  if (!capabilities.motion) return "noMotionSensor";
  if (!capabilities.magnetometer) return "noMagnetometer";
  return null;
}
