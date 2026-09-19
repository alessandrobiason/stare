import { MutableRefObject, useEffect, useRef } from "react";
import { focusedPassFor, SkyPass } from "../satellite/orbitPath";
import { SkyTracker } from "../satellite/skyTracker";
import { ObserverLocation, OrbitEpoch } from "../types";
import { CHECK_INTERVAL_MS, pathPlanStale } from "./planFreshness";

type Options = {
  tracker: SkyTracker;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** The satellite someone has tapped, or `null` with nothing selected. */
  name: string | null;
};

/**
 * The one satellite someone has tapped, as its own crossing of the sky.
 *
 * The passes panel's sightings are drawn on the sky as well
 * (`useNakedEyePasses`), but only the ones that can be seen. This plans one
 * object's current or next pass, on demand, because that is what a tap needs —
 * whatever the object is and whatever the filter is drawing, with a wake that
 * reaches back to the rise. See `focusedPassFor`.
 *
 * A ref, for the reason every other path in the loop is one: the frame loop
 * reads it sixty times a second and does not need React to tell it a new plan
 * has landed. Cleared the instant nothing is selected, rather than left to go
 * stale, so a closed card never leaves a line drawn for an object nobody is
 * asking about any more.
 */
export function useFocusedPath({ tracker, epochRef, name }: Options): MutableRefObject<SkyPass | null> {
  const pathRef = useRef<SkyPass | null>(null);

  useEffect(() => {
    if (!name) {
      pathRef.current = null;
      return;
    }

    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const plan = () => {
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!pathPlanStale(plannedAtMs, plannedFrom, atMs, observer)) return;

      const entry = tracker.entryFor(name);
      pathRef.current = entry ? focusedPassFor(entry, atMs, observer) : null;
      plannedAtMs = atMs;
      plannedFrom = observer;
    };

    plan();
    const timer = setInterval(plan, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tracker, epochRef, name]);

  return pathRef;
}
