import { MutableRefObject, useEffect, useState } from "react";
import { isSighting, passesAheadFor } from "../satellite/nakedEyePasses";
import { SkyTracker } from "../satellite/skyTracker";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";
import { CHECK_INTERVAL_MS, stale } from "./useOrbitPaths";

type Options = {
  tracker: SkyTracker;
  /** Time and observer as of the frame on screen, which is what the card describes. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** The satellite someone has tapped, or `null` with nothing selected. */
  name: string | null;
};

/** What the card says about the tapped satellite's day ahead. */
export type SelectedPasses = {
  /**
   * The next pass it has not begun, whatever can be seen of it: what the card's
   * seeing line answers about while the object is under the floor. See
   * `SatelliteCard`'s `pass`.
   */
  next: UpcomingPass | null;
  /**
   * The next pass it has not begun that can be seen with the naked eye, within
   * the panel's day (`PASSES_PANEL.windowHours`), or `null` for none.
   */
  sighting: UpcomingPass | null;
};

/**
 * The tapped satellite's next day of passes, described, on the card's behalf.
 *
 * The panel only knows the objects it searched (`nakedEyeCandidates`); a card
 * can be opened on anything, from the sky or from the catalog, so this
 * searches the one object it is showing. A day of one object is a couple of
 * thousand propagations — sliced, because it lands on a tap, and replanned on
 * the drawn paths' own cadence (`stale`) so a pass that has begun or ended
 * stops being talked about as one still to come.
 *
 * Emptied the instant the selection changes, rather than left to describe the
 * last object until the new one's search lands.
 */
export function useSelectedPasses({ tracker, epochRef, name }: Options): SelectedPasses {
  const [passes, setPasses] = useState<SelectedPasses>(NOTHING_AHEAD);

  useEffect(() => {
    setPasses(NOTHING_AHEAD);
    if (!name) return;

    let dropped = false;
    let planning = false;
    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const plan = () => {
      if (planning) return;
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!stale(plannedAtMs, plannedFrom, atMs, observer)) return;

      const entry = tracker.entryFor(name);
      if (!entry) {
        setPasses(NOTHING_AHEAD);
        return;
      }

      planning = true;
      passesAheadFor(entry, atMs, observer, startSlicing())
        .then((ahead) => {
          if (dropped) return;
          const coming = ahead.filter((pass) => !pass.started);
          const next = coming[0] ?? null;
          const sighting = coming.find(isSighting) ?? null;
          setPasses(next === null && sighting === null ? NOTHING_AHEAD : { next, sighting });
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
  }, [tracker, epochRef, name]);

  return passes;
}

/** Nothing planned, shared, so an empty answer twice is not a change. */
const NOTHING_AHEAD: SelectedPasses = { next: null, sighting: null };
