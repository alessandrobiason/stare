import { MutableRefObject, useEffect } from "react";
import { PASS_ALERTS } from "../constants";
import { publishPassAlerts } from "../notifications/alertQueue";
import { PassAlertAccess } from "../notifications/alertTypes";
import { SatelliteCatalog } from "../satellite/catalog";
import { planPassAlerts } from "../satellite/passAlerts";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";
import { isStale } from "./planFreshness";
import { watchForeground } from "./watchForeground";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** What the phone allows. Nothing is planned unless this is a yes. */
  access: PassAlertAccess | null;
};

/**
 * Queueing the week's visible passes with the operating system, in the
 * background, while the app is open.
 *
 * This is the whole of the feature's timing, and it rests on one fact: **an app
 * that is not running cannot decide anything.** iOS delivers local
 * notifications that were queued before it was shut and runs none of our code
 * in between, so every alert somebody gets at nine in the evening was worked
 * out the last time they had the app open. That is why the plan reaches a week
 * ahead (`PASS_ALERTS.horizonDays`) where the panel and its arcs reach a day, and
 * why a foreground return rebuilds the queue as well as the timer: a return is
 * the one moment the app knows it is allowed to think.
 *
 * Not on *every* return, though, and not only from a return. A week of plan is
 * a couple of seconds of arithmetic, so it is not redone on every render — a
 * plan is good until `refreshMinutes` have passed *or* the observer has moved
 * `PASS_ALERTS.observerDriftMetres`, whichever comes first, exactly as a
 * drawn path decides the same thing for a shorter plan (`pathPlanStale`). Time is checked on a timer and on every foreground
 * return; the observer's position is checked on its own, cheaper timer
 * (`observerCheckMinutes`), because a phone that never leaves the foreground —
 * held up on a train, propped on a car dashboard — should still notice it has
 * gone somewhere the week's plan was not made for. Nothing here chases a phone
 * still moving: the checks land a few minutes apart, which is a plan caught up
 * with a relocation shortly after it settles rather than mid-journey.
 *
 * Nothing here renders. There is no state, no ref anyone reads and no value
 * returned — mounting this hook is the whole of the effect, and what it changes
 * is what the phone has queued. It sits in `DeviceScene` beside the sky it is
 * planned from, and the replay harness does not mount it at all.
 *
 * The plan itself is sliced from end to end (`planPassAlerts`) and has no
 * deadline: what is already queued goes on being queued until a new plan lands
 * to replace it, so a slow plan costs nobody an alert.
 */
export function usePassAlerts({ catalog, epochRef, access }: Options): void {
  useEffect(() => {
    // Not a yes. Nothing is queued, and nothing needs clearing either: a
    // permission turned off in Settings takes the queue with it, and one never
    // granted never had a queue. Granting it later re-runs this effect.
    if (access !== "granted") return;

    let dropped = false;
    let planning = false;
    /** When and where the standing plan was made, for `isStale`. */
    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;
    const refreshMs = PASS_ALERTS.refreshMinutes * MS_PER_MINUTE;

    const plan = () => {
      if (planning || dropped) return;
      planning = true;
      const { time, observer } = epochRef.current;

      // Not awaited, and not caught: this is a background job whose result is
      // handed to the operating system rather than returned to anyone, and
      // every call it makes into that system swallows its own failures
      // (`alertGateway`). What is left to throw here is the same SGP4 the frame
      // loop runs sixty times a second, which would be a bug rather than a
      // condition.
      planPassAlerts(catalog, time.getTime(), observer, startSlicing())
        .then((alerts) => {
          if (dropped) return;
          // Recorded only once the plan has actually landed, so an attempt cut
          // short by unmounting never marks a plan that was never published.
          plannedAtMs = Date.now();
          plannedFrom = observer;
          return publishPassAlerts(alerts);
        })
        .finally(() => {
          planning = false;
        });
    };

    /** Replans if the standing one no longer fits the time or the place. */
    const replanIfStale = () => {
      const { observer } = epochRef.current;
      if (isStale({
        plannedAtMs,
        plannedFrom,
        atMs: Date.now(),
        observer,
        refreshMs,
        driftMetres: PASS_ALERTS.observerDriftMetres
      })) {
        plan();
      }
    };

    plan();
    // Two timers rather than one, because the two things that go stale here
    // move on different clocks: the half hour is a calendar interval and does
    // not need watching between its own ticks, while a phone that is moving
    // needs checking often enough to be caught before it has gone far past the
    // drift distance. `replanIfStale` folds both into the one comparison
    // `isStale` makes, so the faster timer alone is what actually drives this.
    const checkTimer = setInterval(
      replanIfStale,
      PASS_ALERTS.observerCheckMinutes * MS_PER_MINUTE
    );
    // A session left open for days is caught by the timer above; a phone that
    // was backgrounded is not — the interval is suspended along with the app —
    // so a return checks again on its own.
    const foreground = watchForeground(replanIfStale);

    return () => {
      dropped = true;
      clearInterval(checkTimer);
      foreground();
    };
  }, [access, catalog, epochRef]);
}

const MS_PER_MINUTE = 60_000;
