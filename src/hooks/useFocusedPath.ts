import { MutableRefObject, useEffect, useRef } from "react";
import { focusedPassFor, SkyPass } from "../satellite/orbitPath";
import { SkyTracker } from "../satellite/skyTracker";
import { ObserverLocation, OrbitEpoch } from "../types";
import { CHECK_INTERVAL_MS, stale } from "./useOrbitPaths";

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
 * `useOrbitPaths` plans every landmark's next few hours at once, on a shared
 * timer, because that is what the passes panel needs. This plans one object's
 * current pass, on demand, because that is what a tap needs — and unlike the
 * landmark tier it does not care whether that tier is switched on, or whether
 * the object tapped is one of its landmarks: any category answers here, with
 * a wake that reaches back to the rise rather than the short one a landmark's
 * own path carries. See `focusedPassFor`.
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
      if (!stale(plannedAtMs, plannedFrom, atMs, observer)) return;

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
