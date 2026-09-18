import { MutableRefObject, useEffect } from "react";
import { PASS_ALERTS } from "../constants";
import { publishPassAlerts } from "../notifications/alertQueue";
import { PassAlertAccess } from "../notifications/alertTypes";
import { SatelliteCatalog } from "../satellite/catalog";
import { planPassAlerts } from "../satellite/passAlerts";
import { startSlicing } from "../timeSlice";
import { OrbitEpoch } from "../types";
import { watchForeground } from "./watchForeground";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** What the phone allows. Nothing is planned unless this is a yes. */
  access: PassAlertAccess | null;
};

/**
 * Queueing the day's visible passes with the operating system, in the
 * background, while the app is open.
 *
 * This is the whole of the feature's timing, and it rests on one fact: **an app
 * that is not running cannot decide anything.** iOS delivers local
 * notifications that were queued before it was shut and runs none of our code
 * in between, so every alert somebody gets at nine in the evening was worked
 * out the last time they had the app open. That is why the plan reaches a day
 * ahead (`PASS_ALERTS.windowHours`) where the drawn arcs reach three hours, and
 * why the queue is rebuilt on every foreground return rather than on a timer
 * alone: a return is the one moment the app knows it is allowed to think.
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
          return publishPassAlerts(alerts);
        })
        .finally(() => {
          planning = false;
        });
    };

    plan();
    const timer = setInterval(plan, PASS_ALERTS.refreshMinutes * MS_PER_MINUTE);
    // A session left open for days replans on the timer; a phone picked up
    // again in the evening replans because it came back. Most sessions are the
    // second kind, which is why the timer is the slower half of this.
    const foreground = watchForeground(plan);

    return () => {
      dropped = true;
      clearInterval(timer);
      foreground();
    };
  }, [access, catalog, epochRef]);
}

const MS_PER_MINUTE = 60_000;
