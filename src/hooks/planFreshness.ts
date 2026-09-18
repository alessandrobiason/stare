import { metresBetween } from "../coordinates/distance";
import { ObserverLocation } from "../types";

/**
 * Whether a plan made at one time and place still describes the sky, by the
 * two ways it stops doing so: time passing, and the observer having moved far
 * enough that the plan is now describing somewhere else.
 *
 * Shared by every background plan that is remade on the same shape of check —
 * the drawn landmark paths, the one object someone has tapped, and the pass
 * alerts — each with its own idea of how often is often enough and how far is
 * far enough, because the same two questions carry different answers at three
 * hours of drawn sky and at a week of queued notifications. See `useOrbitPaths`
 * and `usePassAlerts`.
 */
export function isStale(options: {
  plannedAtMs: number | null;
  plannedFrom: ObserverLocation | null;
  atMs: number;
  observer: ObserverLocation;
  /** How long a plan is good for without being moved out from under. */
  refreshMs: number;
  /** How far the observer may drift before it is a different place. */
  driftMetres: number;
}): boolean {
  const { plannedAtMs, plannedFrom, atMs, observer, refreshMs, driftMetres } = options;
  if (plannedAtMs === null || plannedFrom === null) return true;
  if (Math.abs(atMs - plannedAtMs) >= refreshMs) return true;
  return metresBetween(plannedFrom, observer) > driftMetres;
}
