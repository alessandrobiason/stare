import { MutableRefObject, useEffect, useState } from "react";
import { PASSES_PANEL } from "../constants";
import { SatelliteCatalog } from "../satellite/catalog";
import { planSightings } from "../satellite/nakedEyePasses";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";
import { isStale } from "./planFreshness";
import { CHECK_INTERVAL_MS } from "./useOrbitPaths";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
};

/**
 * The next day's naked-eye passes, for the panel that says what is coming,
 * replanned in the background as the hours go by. See `planSightings`.
 *
 * State rather than a ref, because this is read by a view rather than by the
 * frame loop, and a ref nothing re-renders for would leave the panel showing
 * the plan it mounted with. The cost is the render this hook's owner does when
 * a plan lands, which is once every `PASSES_PANEL.refreshMinutes` — and the
 * loop is untouched by it, since everything it reads is a ref.
 *
 * Not tied to the category filter. The drawn arcs go when the landmark tier is
 * switched off, because a line nobody asked for is clutter on the picture; a
 * sighting is a fact about the sky rather than about what is drawn on it, and
 * a row opens the object's card whatever the filter is hiding.
 *
 * Nothing here is on a deadline: the list in hand stays up until its
 * replacement is finished, so the work can take as many slices as it needs.
 */
export function useNakedEyePasses({ catalog, epochRef }: Options): UpcomingPass[] {
  const [passes, setPasses] = useState<UpcomingPass[]>(NO_PASSES);

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
      // Not awaited and not caught, for the reasons `useOrbitPaths` gives: a
      // background job on a timer, publishing by setting state, over the same
      // SGP4 the frame loop runs sixty times a second.
      planSightings(catalog, atMs, observer, startSlicing())
        .then((found) => {
          if (dropped) return;
          // `NO_PASSES` rather than a fresh array, so a sky with nothing to see
          // for a day — the sun up all night, at high latitudes in summer —
          // does not render the panel's owner for an unchanged empty list.
          setPasses(found.length === 0 ? NO_PASSES : found);
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

  return passes;
}

/** The empty list, shared. See where it is set. */
const NO_PASSES: UpcomingPass[] = [];

const MS_PER_MINUTE = 60_000;
