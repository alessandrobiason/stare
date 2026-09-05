/** Unit quaternion helpers, in the `w + xi + yj + zk` convention. */
export type Quaternion = {
  w: number;
  x: number;
  y: number;
  z: number;
};

export type Vector3 = { x: number; y: number; z: number };

/**
 * Rotates `vector` by `q`, i.e. applies the rotation matrix the quaternion
 * stands for.
 *
 * Written as two cross products rather than by building the matrix: a device
 * pose is only ever used to rotate two or three axes, so the matrix would cost
 * more to assemble than to skip.
 */
export function rotateVector(q: Quaternion, vector: Vector3): Vector3 {
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);

  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx)
  };
}

/**
 * Scales a quaternion back onto the unit sphere.
 *
 * Recorded poses are interpolated between samples channel by channel, which
 * leaves them slightly short of unit length; rotating by one of those shrinks
 * the axes it produces. Returns the identity for a degenerate input.
 */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  if (length === 0) return { w: 1, x: 0, y: 0, z: 0 };
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}
