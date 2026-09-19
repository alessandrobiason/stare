import { MutableRefObject, useEffect, useRef, useState } from "react";
import { PASSES_PANEL } from "../constants";
import { SatelliteCatalog } from "../satellite/catalog";
import { planSightingPaths } from "../satellite/nakedEyePasses";
import { SkyPass } from "../satellite/orbitPath";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";
import { CHECK_INTERVAL_MS, isStale } from "./planFreshness";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
};

/** The day's sightings, as the panel lists them and as the sky draws them. */
export type NakedEyePasses = {
  /**
   * For the panel: state, because it is read by a view, and a ref nothing
   * re-renders for would leave the panel showing the plan it mounted with. The
   * cost is the render this hook's owner does when a plan lands, which is once
   * every `PASSES_PANEL.refreshMinutes`.
   */
  passes: UpcomingPass[];
  /**
   * For the frame loop: the same passes as arcs, in a ref, for the reason
   * everything on that path is one — the loop reads it sixty times a second
   * and does not need React to tell it a new plan has landed. See
   * `drawnSightings` for which of them are drawn.
   */
  pathsRef: MutableRefObject<SkyPass[]>;
};

/**
 * The next day's naked-eye passes, for the panel that says what is coming and
 * for the lines on the sky showing where each of them will be, replanned in the
 * background as the hours go by. See `planSightingPaths`.
 *
 * Not tied to the category filter: a sighting is a fact about the sky rather
 * than about what is drawn on it, and a row opens the object's card whatever
 * the filter is hiding. Whether its line is drawn is the frame loop's business.
 *
 * Nothing here is on a deadline: the plan in hand stays up until its
 * replacement is finished, so the work can take as many slices as it needs.
 */
export function useNakedEyePasses({ catalog, epochRef }: Options): NakedEyePasses {
  const [passes, setPasses] = useState<UpcomingPass[]>(NO_PASSES);
  const pathsRef = useRef<SkyPass[]>([]);

  useEffect(() => {
    let dropped = false;
    let planning = false;
    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const plan = () => {
      if (planning) return;
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!isStale({
        plannedAtMs,
        plannedFrom,
        atMs,
        observer,
        refreshMs: PASSES_PANEL.refreshMinutes * MS_PER_MINUTE,
        driftMetres: PASSES_PANEL.observerDriftMetres
      })) {
        return;
      }

      planning = true;
      // Not awaited: this is a background job on a timer, and its result is
      // published by setting state and writing the ref rather than returned to
      // anyone. Nothing catches, either — the arithmetic is the same SGP4 the
      // frame loop runs sixty times a second, so a failure here is a bug rather
      // than a condition, and one swallowed on a timer never surfaces.
      planSightingPaths(catalog, atMs, observer, startSlicing())
        .then((found) => {
          if (dropped) return;
          pathsRef.current = found.paths;
          // `NO_PASSES` rather than a fresh array, so a sky with nothing to see
          // for a day — the sun up all night, at high latitudes in summer —
          // does not render the panel's owner for an unchanged empty list.
          setPasses(found.passes.length === 0 ? NO_PASSES : found.passes);
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
  }, [catalog, epochRef]);

  return { passes, pathsRef };
}

/** The empty list, shared. See where it is set. */
const NO_PASSES: UpcomingPass[] = [];

const MS_PER_MINUTE = 60_000;
