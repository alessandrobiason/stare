import { EciPosition, EciState } from "../types";

/**
 * Where an object was over the last stretch of its orbit, worked out from one
 * state rather than from one propagation per point.
 *
 * The marker's trail is the ground the object has just covered, and it is long
 * enough (`SATELLITE_MARKERS.trailSeconds`) that the straight line a velocity
 * alone gives is no longer the path: over a minute and a half a low orbit turns
 * through five or six degrees, and it is that turn which bends the trail on the
 * frame. SGP4 would place every point exactly, but at a dozen points for every
 * satellite on every frame it is the one cost this loop cannot carry. Gravity
 * alone can: the only force that matters over a window this short is the
 * Earth's pull towards its centre, and integrated from the state the tracker
 * already holds it lands within metres of SGP4 — the Earth's flattening moves a
 * low orbit by tens of metres over the window, drag by less.
 *
 * Classic fourth-order Runge–Kutta, a step per point. At the few seconds a step
 * spans, an orbit turns through well under a degree, and the method's own error
 * is far below a metre per step.
 */

/** The Earth's gravitational parameter, in km³/s². */
const MU_KM3_S2 = 398600.4418;

/** Acceleration towards the Earth's centre at `x, y, z` km, into `out`. */
function gravity(x: number, y: number, z: number, out: number[], at: number): void {
  const r2 = x * x + y * y + z * z;
  const factor = -MU_KM3_S2 / (r2 * Math.sqrt(r2));
  out[at] = factor * x;
  out[at + 1] = factor * y;
  out[at + 2] = factor * z;
}

/**
 * The object's positions at `startSeconds`, then every `stepSeconds` after it,
 * `count` of them in all, measured from the instant `state` holds.
 *
 * Steps may be negative, which is how the trail is asked for: `startSeconds` is
 * how far the frame is past the state, and each step goes back from there. The
 * first point is the first one returned, so a trail of twelve points is twelve
 * places behind the object and never the object itself.
 */
export function twoBodyPath(
  state: EciState,
  startSeconds: number,
  stepSeconds: number,
  count: number
): EciPosition[] {
  const s = [
    state.position.x,
    state.position.y,
    state.position.z,
    state.velocity.x,
    state.velocity.y,
    state.velocity.z
  ];
  const path: EciPosition[] = [];
  if (startSeconds !== 0) advance(s, startSeconds);
  for (let index = 0; index < count; index += 1) {
    advance(s, stepSeconds);
    path.push({ x: s[0], y: s[1], z: s[2] });
  }
  return path;
}

/** Reused per step: the four slopes, and the state each is taken at. */
const k = new Array<number>(24).fill(0);
const probe = new Array<number>(6).fill(0);

/** One RK4 step of `h` seconds, applied to the state `s` in place. */
function advance(s: number[], h: number): void {
  for (let stage = 0; stage < 4; stage += 1) {
    const weight = stage === 0 ? 0 : stage === 3 ? h : h / 2;
    const previous = (stage - 1) * 6;
    for (let axis = 0; axis < 6; axis += 1) {
      probe[axis] = stage === 0 ? s[axis] : s[axis] + weight * k[previous + axis];
    }
    const at = stage * 6;
    // Position changes at the velocity; velocity at gravity.
    k[at] = probe[3];
    k[at + 1] = probe[4];
    k[at + 2] = probe[5];
    gravity(probe[0], probe[1], probe[2], k, at + 3);
  }
  for (let axis = 0; axis < 6; axis += 1) {
    s[axis] += (h / 6) * (k[axis] + 2 * k[6 + axis] + 2 * k[12 + axis] + k[18 + axis]);
  }
}
