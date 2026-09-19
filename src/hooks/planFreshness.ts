import { LANDMARK_PATHS } from "../constants";
import { metresBetween } from "../coordinates/distance";
import { ObserverLocation } from "../types";

/**
 * Whether a plan made at one time and place still describes the sky, by the
 * two ways it stops doing so: time passing, and the observer having moved far
 * enough that the plan is now describing somewhere else.
 *
 * Shared by every background plan that is remade on the same shape of check —
 * the one object someone has tapped, the day of passes the panel lists and
 * draws, and the pass alerts — each with its own idea of how often is often
 * enough and how far is far enough, because the same two questions carry
 * different answers at a line drawn on the sky and at a week of queued
 * notifications. See `pathPlanStale` and `usePassAlerts`.
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

/**
 * Whether a plan of one object's line across the sky still describes it.
 *
 * Three ways it stops doing so, and the third is the reason this is a
 * comparison rather than a countdown: time passing, the observer walking away
 * from where the plan was made, and the clock *jumping* — which is a seek under
 * the replay harness, and which an elapsed-time test would read as no time
 * having passed at all when the video is scrubbed backwards. The general shape
 * of this check is `isStale`; what is here is only this plan's own numbers — a
 * few hundred metres and a minute, because what is drawn from it is a line
 * whose bearing has to hold to a fraction of a degree. See `useFocusedPath`
 * and `useSelectedPasses`.
 */
export function pathPlanStale(
  plannedAtMs: number | null,
  plannedFrom: ObserverLocation | null,
  atMs: number,
  observer: ObserverLocation
): boolean {
  return isStale({
    plannedAtMs,
    plannedFrom,
    atMs,
    observer,
    refreshMs: LANDMARK_PATHS.refreshSeconds * 1000,
    driftMetres: LANDMARK_PATHS.observerDriftMetres
  });
}

/**
 * How often a background plan is checked against the clock, in milliseconds.
 *
 * Not how often it is made: that is each plan's own refresh, and this is only
 * the grain the check is taken at. Five seconds is fine enough that a seek is
 * answered while the person is still looking at where they seeked to, and
 * coarse enough that a check costs nothing between them — it is two
 * subtractions and a distance.
 */
export const CHECK_INTERVAL_MS = 5000;
