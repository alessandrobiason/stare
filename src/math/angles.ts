/** Angle helpers shared by the sensor, coordinate and rendering layers. */

export const DEG_PER_RAD = 180 / Math.PI;
export const RAD_PER_DEG = Math.PI / 180;

export function toDegrees(radians: number): number {
  return radians * DEG_PER_RAD;
}

export function toRadians(degrees: number): number {
  return degrees * RAD_PER_DEG;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Wraps an angle into `[0, 360)`. Used for compass headings. */
export function wrapDegrees360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Wraps an angle into `[-180, 180)`. Used for pitch/roll and relative bearings. */
export function wrapDegrees180(degrees: number): number {
  return wrapDegrees360(degrees + 180) - 180;
}

/**
 * Shortest signed rotation from `previous` to `current`, in `[-180, 180)`.
 * Crossing north (359° -> 1°) yields +2, not -358.
 */
export function angleDeltaDegrees(current: number, previous: number): number {
  return wrapDegrees180(current - previous);
}

/** Linear interpolation; `alpha` is not clamped. */
export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

