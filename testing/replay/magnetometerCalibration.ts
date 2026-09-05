import { Vector3 } from "../../src/math/quaternion";
import { TimeSeries } from "./timeSeries";

/**
 * The constant part of a magnetometer reading: the field of the device itself.
 *
 * Subtracting it is what turns the recording's raw magnetometer into something
 * that points at north. The stream carries roughly 600 uT of it against about
 * 30 uT of Earth, so the raw vector barely moves as the phone turns — it stays
 * within a few degrees of one direction in the *body* frame, which is the
 * worst possible thing for a north reference, because it then rotates with the
 * device and cancels the very yaw it is supposed to anchor.
 */
export type HardIronOffset = Vector3;

const NONE: HardIronOffset = { x: 0, y: 0, z: 0 };

/** Samples the fit uses. More than this buys nothing but time. */
const MAX_FIT_SAMPLES = 4000;

/**
 * How far the fitted sphere's surface may sit from the samples, as a fraction
 * of its radius, before the fit is rejected — a recording taken through
 * changing local iron never settles onto one sphere.
 */
const MAX_RESIDUAL_FRACTION = 0.2;

/**
 * How tightly the readings may cluster in one direction from the fitted centre.
 *
 * A phone that was barely turned traces a patch rather than a sphere, and
 * every sphere through that patch fits it: the solver happily answers with a
 * centre thousands of units away and a residual of nothing. What gives it away
 * is that the readings then all point the same way from that centre, so this
 * is checked rather than the residual alone. Below the threshold is a fit
 * pinned down from several directions; above it, better to leave the readings
 * uncorrected, where the failure is at least a constant bearing error rather
 * than one that moves with the device.
 */
const MAX_DIRECTION_CONCENTRATION = 0.9;

/**
 * Estimates the hard-iron offset by fitting a sphere to the readings.
 *
 * A rotating magnetometer traces a sphere centred on its own bias, so the
 * centre is the bias. Expanding |m - c|^2 = r^2 makes that linear in
 * `[c, r^2 - |c|^2]`, which is four normal equations and no iteration.
 *
 * The whole recording is available at boot, so this is fitted once over all of
 * it rather than converged online as a live app would have to.
 */
export function fitHardIronOffset(samples: TimeSeries): HardIronOffset {
  if (samples.length < 4) return NONE;

  const step = Math.max(1, Math.floor(samples.length / MAX_FIT_SAMPLES));
  const normal = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ];
  const target = [0, 0, 0, 0];
  let used = 0;

  for (let index = 0; index < samples.length; index += step) {
    const [, x, y, z] = samples[index];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    const row = [2 * x, 2 * y, 2 * z, 1];
    const squaredLength = x * x + y * y + z * z;
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) normal[i][j] += row[i] * row[j];
      target[i] += row[i] * squaredLength;
    }
    used += 1;
  }

  if (used < 4) return NONE;

  const solution = solve(normal, target);
  if (!solution) return NONE;

  const [cx, cy, cz, offset] = solution;
  const radiusSquared = offset + cx * cx + cy * cy + cz * cz;
  if (!(radiusSquared > 0)) return NONE;

  const radius = Math.sqrt(radiusSquared);
  const centre = { x: cx, y: cy, z: cz };

  if (residual(samples, step, centre, radius) > MAX_RESIDUAL_FRACTION * radius) return NONE;
  if (directionConcentration(samples, step, centre) > MAX_DIRECTION_CONCENTRATION) return NONE;

  return centre;
}

/** Removes the device's own field from one reading. */
export function withoutHardIron(reading: Vector3, offset: HardIronOffset): Vector3 {
  return { x: reading.x - offset.x, y: reading.y - offset.y, z: reading.z - offset.z };
}

/** Root-mean-square distance from the samples to the fitted sphere's surface. */
function residual(
  samples: TimeSeries,
  step: number,
  centre: Vector3,
  radius: number
): number {
  let total = 0;
  let count = 0;

  for (let index = 0; index < samples.length; index += step) {
    const [, x, y, z] = samples[index];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const error = Math.hypot(x - centre.x, y - centre.y, z - centre.z) - radius;
    total += error * error;
    count += 1;
  }

  return count === 0 ? Infinity : Math.sqrt(total / count);
}

/**
 * How much the readings, seen from `centre`, agree on a direction: 1 when they
 * all point the same way and 0 when they are spread evenly over the sphere.
 */
function directionConcentration(samples: TimeSeries, step: number, centre: Vector3): number {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;

  for (let index = 0; index < samples.length; index += step) {
    const [, sx, sy, sz] = samples[index];
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) continue;
    const dx = sx - centre.x;
    const dy = sy - centre.y;
    const dz = sz - centre.z;
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) continue;
    x += dx / length;
    y += dy / length;
    z += dz / length;
    count += 1;
  }

  return count === 0 ? 1 : Math.hypot(x, y, z) / count;
}

/** Gaussian elimination with partial pivoting. `null` when singular. */
function solve(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const a = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (!(Math.abs(a[pivot][column]) > 0)) return null;

    [a[column], a[pivot]] = [a[pivot], a[column]];
    [b[column], b[pivot]] = [b[pivot], b[column]];

    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row][column] / a[column][column];
      for (let k = column; k < size; k += 1) a[row][k] -= factor * a[column][k];
      b[row] -= factor * b[column];
    }
  }

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let column = row + 1; column < size; column += 1) sum -= a[row][column] * solution[column];
    solution[row] = sum / a[row][row];
  }

  return solution.every(Number.isFinite) ? solution : null;
}
