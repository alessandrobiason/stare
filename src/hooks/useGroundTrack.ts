import { MutableRefObject, useEffect, useState } from "react";
import { GroundTrack, groundTrackFor } from "../satellite/groundTrack";
import { SkyTracker } from "../satellite/skyTracker";
import { ObserverLocation, OrbitEpoch } from "../types";
import { CHECK_INTERVAL_MS, pathPlanStale } from "./planFreshness";

type Options = {
  tracker: SkyTracker;
  /** Time and observer as of the frame on screen, which is what the card shows. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** The satellite someone has tapped, or `null` with nothing selected. */
  name: string | null;
};

/** One orbit drawn on the world, and where the phone was when it was planned. */
export type GroundTrackPlan = {
  /**
   * The orbit, or `null` where the elements will not yield one.
   *
   * A real answer rather than a failure: the map is still drawn, with the
   * world and the observer on it and no track over them. An object with
   * elements SGP4 cannot make an orbit of — a decayed satellite, a set of
   * numbers the catalogue is carrying badly — keeps the rest of its card.
   */
  track: GroundTrack | null;
  /** Where the phone is, so the map can show who the footprint is covering. */
  observer: ObserverLocation;
};

/**
 * The tapped satellite's orbit, as the shape it draws on the ground.
 *
 * The third of the card's background plans, beside the pass drawn across the
 * sky (`useFocusedPath`) and the day of sightings it lists
 * (`useSelectedPasses`), and the same shape as both: planned on the tap,
 * remade on the shared cadence when the clock has moved on or the observer has
 * walked away from where it was made, and dropped the instant nothing is
 * selected.
 *
 * It differs from the other two in what it is planned *against*. Those are
 * about this place — a pass is a pass over somewhere — and go stale when the
 * observer moves. An orbit is not about anywhere: the track a satellite draws
 * on the Earth is the same track wherever it is being watched from. What the
 * observer is here for is the second mark on the map, the one that turns "it
 * can see this much of the world" into "it can see you" — so the plan carries
 * the fix it was made with rather than the track alone, and `pathPlanStale`
 * remakes it when that fix stops being where somebody is standing.
 *
 * State rather than a ref, unlike the paths drawn on the camera picture: this
 * is read by a React component when it renders rather than by the frame loop,
 * and there is one of them per tap.
 */
export function useGroundTrack({ tracker, epochRef, name }: Options): GroundTrackPlan | null {
  const [plan, setPlan] = useState<GroundTrackPlan | null>(null);

  useEffect(() => {
    setPlan(null);
    if (!name) return;

    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const replan = () => {
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!pathPlanStale(plannedAtMs, plannedFrom, atMs, observer)) return;

      const entry = tracker.entryFor(name);
      setPlan({ track: entry ? groundTrackFor(entry, atMs) : null, observer });
      plannedAtMs = atMs;
      plannedFrom = observer;
    };

    replan();
    const timer = setInterval(replan, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tracker, epochRef, name]);

  return plan;
}
