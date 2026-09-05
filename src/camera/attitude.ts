import { clamp, toDegrees, toRadians, wrapDegrees180, wrapDegrees360 } from "../math/angles";
import { EnuPosition } from "../types";

/**
 * Where the camera points and how it is held, in the local horizon frame.
 *
 * These three angles are the interchange format between the sensors, the
 * attitude filter and the projection, so what they mean has to be pinned down
 * exactly:
 *
 * - `headingDeg` is the compass bearing of the optical axis, clockwise from
 *   north, in `[0, 360)`.
 * - `pitchDeg` is that axis's elevation above the horizon, in `[-90, 90]`.
 * - `rollDeg` is the bank about the optical axis, positive with the camera's
 *   right-hand side down — so the scene appears to rotate anticlockwise in the
 *   frame, and anything drawn level with the horizon is rotated by `-rollDeg`.
 *
 * Together they are a full 3-D rotation, not three independent offsets:
 * `axesFromAttitude` and `attitudeFromAxes` are inverses of each other, and
 * everything that consumes an attitude goes through one of them.
 */
export type CameraAttitude = {
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

/** The camera's three axes as unit vectors in the observer's ENU frame. */
export type CameraAxes = {
  /** Out through the lens. */
  forward: EnuPosition;
  /** Towards the right-hand edge of the frame. */
  right: EnuPosition;
  /** Towards the top edge of the frame. */
  up: EnuPosition;
};

/**
 * Below this horizontal component the optical axis counts as vertical and the
 * heading has to be recovered from another axis. `sin(0.01 deg)`, so it is only
 * reached by an axis that really is pointing at the zenith or the nadir.
 */
const VERTICAL_AXIS_EPSILON = 1.75e-4;

const dot = (a: EnuPosition, b: EnuPosition): number =>
  a.east * b.east + a.north * b.north + a.up * b.up;

/** Builds the camera's axes from the attitude it is pointing with. */
export function axesFromAttitude(attitude: CameraAttitude): CameraAxes {
  const heading = toRadians(attitude.headingDeg);
  const pitch = toRadians(attitude.pitchDeg);
  const roll = toRadians(attitude.rollDeg);

  const sinHeading = Math.sin(heading);
  const cosHeading = Math.cos(heading);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);

  const forward: EnuPosition = {
    east: sinHeading * cosPitch,
    north: cosHeading * cosPitch,
    up: sinPitch
  };
  // The unrolled axes: `levelRight` is horizontal by construction, and
  // `levelUp` completes the right-handed set as `levelRight x forward`.
  const levelRight: EnuPosition = { east: cosHeading, north: -sinHeading, up: 0 };
  const levelUp: EnuPosition = {
    east: -sinHeading * sinPitch,
    north: -cosHeading * sinPitch,
    up: cosPitch
  };

  const sinRoll = Math.sin(roll);
  const cosRoll = Math.cos(roll);

  return {
    forward,
    right: combine(levelRight, cosRoll, levelUp, -sinRoll),
    up: combine(levelRight, sinRoll, levelUp, cosRoll)
  };
}

/**
 * Recovers the attitude from the camera's forward and right axes, as the
 * inverse of `axesFromAttitude`.
 *
 * The axes are what a device pose actually gives — a quaternion rotates them
 * out of the body frame directly — so this is the way in from any attitude
 * source, and it avoids ever having to match somebody else's Euler convention.
 */
export function attitudeFromAxes(forward: EnuPosition, right: EnuPosition): CameraAttitude {
  const f = normalize(forward);
  const horizontal = Math.hypot(f.east, f.north);

  // Pointing at the zenith or the nadir: heading and roll are then the same
  // rotation, and the frame's own up axis is what says where the camera faces.
  if (horizontal < VERTICAL_AXIS_EPSILON) {
    const up = normalize(cross(right, f));
    const facing = f.up > 0 ? { east: -up.east, north: -up.north } : up;
    return {
      headingDeg: wrapDegrees360(toDegrees(Math.atan2(facing.east, facing.north))),
      pitchDeg: f.up > 0 ? 90 : -90,
      rollDeg: 0
    };
  }

  const levelRight: EnuPosition = { east: f.north / horizontal, north: -f.east / horizontal, up: 0 };
  const levelUp = cross(levelRight, f);
  const r = normalize(right);

  return {
    headingDeg: wrapDegrees360(toDegrees(Math.atan2(f.east, f.north))),
    pitchDeg: toDegrees(Math.asin(clamp(f.up, -1, 1))),
    rollDeg: wrapDegrees180(toDegrees(Math.atan2(-dot(r, levelUp), dot(r, levelRight))))
  };
}

function combine(
  a: EnuPosition,
  scaleA: number,
  b: EnuPosition,
  scaleB: number
): EnuPosition {
  return {
    east: a.east * scaleA + b.east * scaleB,
    north: a.north * scaleA + b.north * scaleB,
    up: a.up * scaleA + b.up * scaleB
  };
}

function cross(a: EnuPosition, b: EnuPosition): EnuPosition {
  return {
    east: a.north * b.up - a.up * b.north,
    north: a.up * b.east - a.east * b.up,
    up: a.east * b.north - a.north * b.east
  };
}

function normalize(vector: EnuPosition): EnuPosition {
  const length = Math.hypot(vector.east, vector.north, vector.up);
  if (length === 0) return { east: 0, north: 1, up: 0 };
  return { east: vector.east / length, north: vector.north / length, up: vector.up / length };
}
