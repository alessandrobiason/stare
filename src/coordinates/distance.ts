import { toRadians } from "../math/angles";
import { ObserverLocation } from "../types";

/**
 * How far apart two ground positions are, in metres. Flat-Earth arithmetic —
 * exact enough over anything short of a large fraction of the Earth's radius,
 * which is far past what anything comparing against it needs: a walk across a
 * room (`skyMemory.ts`), a few hundred metres of drift before a drawn path is
 * replanned (`planFreshness.ts`), or the tens of kilometres that say somebody
 * has gone somewhere else entirely (`usePassAlerts.ts`).
 *
 * Not a great-circle distance, and deliberately not one: the callers above are
 * all a threshold compared against a `hypot`, and the curvature error over the
 * distances any of them compares against is a rounding error next to the
 * threshold itself.
 */
export function metresBetween(one: ObserverLocation, other: ObserverLocation): number {
  const north = (other.latitudeDeg - one.latitudeDeg) * METRES_PER_DEGREE;
  const east =
    (other.longitudeDeg - one.longitudeDeg) * METRES_PER_DEGREE * Math.cos(toRadians(one.latitudeDeg));
  return Math.hypot(north, east);
}

const METRES_PER_DEGREE = 111320;
