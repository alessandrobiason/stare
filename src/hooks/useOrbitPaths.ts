import { MutableRefObject, useEffect, useRef } from "react";
import { LANDMARK_PATHS } from "../constants";
import { SatelliteCatalog } from "../satellite/catalog";
import { planSkyPaths, SkyPass } from "../satellite/orbitPath";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";
import { isStale } from "./planFreshness";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /**
   * Whether the landmark tier is being drawn at all.
   *
   * Filtered out, nothing draws a path, and planning one is a few thousand
   * propagations spent on a line nobody asked for. Turning the tier back on
   * plans again within `CHECK_INTERVAL_MS` rather than immediately, which is
   * the same delay every other change to the plan has.
   */
  enabled: boolean;
};

/** A plan, as the frame loop reads it. */
export type OrbitPaths = {
  /**
   * The arcs themselves, for the frame loop to project.
   *
   * A ref rather than state, for the reason everything on that path is a ref:
   * the only thing that reads them is the loop, which is already running at
   * display rate and does not need React to tell it that a new plan has
   * landed. Publishing them would re-render the whole scene once a minute to
   * hand a value to something that reads it sixty times a second anyway.
   *
   * The passes panel is planned apart from this (`useNakedEyePasses`): it
   * lists what can be seen rather than what the landmarks are doing, over a
   * day rather than three hours, and whether or not the tier is drawn.
   */
  pathsRef: MutableRefObject<SkyPass[]>;
};

/**
 * The landmarks' upcoming passes, replanned in the background as the hours go
 * by.
 *
 * Nothing here is on a deadline. The plan in hand goes on being drawn — trimmed
 * to the present on every frame (`pathFrom`) — until its replacement is
 * finished, so the work can take as many slices as it needs and an arrival a
 * second late is invisible.
 */
export function useOrbitPaths({ catalog, epochRef, enabled }: Options): OrbitPaths {
  const pathsRef = useRef<SkyPass[]>([]);

  useEffect(() => {
    if (!enabled) {
      pathsRef.current = [];
      return;
    }

    let dropped = false;
    let planning = false;
    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const plan = () => {
      if (planning) return;
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!stale(plannedAtMs, plannedFrom, atMs, observer)) return;

      planning = true;
      // Not awaited: this is a background job on a timer, and its result is
      // published by writing the ref rather than returned to anyone. Nothing
      // catches, either — the arithmetic below is the same SGP4 the frame loop
      // runs sixty times a second, so a failure here is a bug rather than a
      // condition, and one swallowed on a timer is a bug that never surfaces.
      planSkyPaths(catalog, atMs, observer, startSlicing())
        .then((drawn) => {
          if (dropped) return;
          pathsRef.current = drawn;
          plannedAtMs = atMs;
          plannedFrom = observer;
        })
        .finally(() => {
          planning = false;
        });
    };

    plan();
    const timer = setInterval(plan, CHECK_INTERVAL_MS);
    return () => {
      dropped = true;
      clearInterval(timer);
    };
  }, [catalog, enabled, epochRef]);

  return { pathsRef };
}

/**
 * Whether the plan in hand still describes the sky.
 *
 * Three ways it stops doing so, and the third is the reason this is a
 * comparison rather than a countdown: time passing, the observer walking away
 * from where the plan was made, and the clock *jumping* — which is a seek under
 * the replay harness, and which an elapsed-time test would read as no time
 * having passed at all when the video is scrubbed backwards. The general shape
 * of this check is shared (`isStale`); what is here is only this plan's own
 * numbers — a few hundred metres and a minute, because what is drawn from it
 * is a line whose bearing has to hold to a fraction of a degree.
 */
export function stale(
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
 * How often the plan is checked against the clock, in milliseconds.
 *
 * Not how often it is made: that is `LANDMARK_PATHS.refreshSeconds`, and this
 * is only the grain the check is taken at. Five seconds is fine enough that a
 * seek is answered while the person is still looking at where they seeked to,
 * and coarse enough that a check costs nothing between them — it is two
 * subtractions and a distance.
 *
 * Exported alongside `stale` for `useFocusedPath`, which replans one object
 * on the same cadence rather than inventing its own.
 */
export const CHECK_INTERVAL_MS = 5000;
