import { PASS_ALERTS } from "../constants";
import { Slices } from "../timeSlice";
import { ObserverLocation } from "../types";
import { SatelliteCatalog } from "./catalog";
import { NakedEyeVerdict } from "./nakedEye";
import { landmarkPasses } from "./orbitPath";
import { UpcomingPass, upcomingPasses } from "./upcomingPasses";

/**
 * The passes worth interrupting somebody for, and when to interrupt them.
 *
 * Everything else in this app answers a question that was asked by opening it.
 * This is the one thing it says to a phone in a pocket — and the whole of what
 * makes that bearable is the word *verified*: a notification goes out only for
 * a pass that the same arithmetic the card uses has already decided can be
 * **seen**, from here, at the minute it names. Lit by the sun, dark on the
 * ground here, and bright enough for eyes or for binoculars
 * (`nakedEye.ts`). Everything else the sky is doing — the sixteen thousand
 * objects overhead at noon, the arcs drawn through a daylit sky, the pass that
 * is real and eclipsed — is a fact the app is happy to draw and has no business
 * waking anyone for.
 *
 * That is also why an object nobody has recorded a reflectivity for
 * (`"unknown"`) is not alerted on, though its card says something useful and
 * its arc is drawn like any other. A line on a frame that turns out to be too
 * faint costs nothing; a phone buzzing for one costs the permission, and with
 * it every pass after it.
 *
 * Nothing here talks to the operating system. What a scheduled alert *is* on a
 * phone lives in `src/notifications/`, the words it carries are in
 * `src/i18n/format.ts`, and this module is the decision: which passes, and at
 * what moment.
 */

/** A pass worth a notification, and the moment the notification should land. */
export type PassAlert = {
  /**
   * What identifies this alert between plans: the object and the minute it is
   * highest.
   *
   * The plan is made again every half hour and the same pass comes out of it
   * every time, so an identifier is what keeps one pass from being queued
   * twice. The peak to the minute rather than to the millisecond, because the
   * rise a plan bisects to depends slightly on the grid it was searched from
   * (`passSearch`) and two plans a half hour apart can put the same peak a
   * second or two differently; two passes of one object are an orbit apart, so
   * a minute cannot collapse two real ones into one.
   */
  id: string;
  noradId: number;
  /** The name the sky and the card call it, which is the name the alert uses. */
  name: string;
  /** When the notification should be delivered. See `PASS_ALERTS.leadMinutes`. */
  deliverAtMs: number;
  /** When the object clears the elevation floor: what the alert counts down to. */
  startsAtMs: number;
  /** When it is highest, which is the instant the verdict below is decided at. */
  peakAtMs: number;
  peakElevationDeg: number;
  /** Where it comes up, in degrees clockwise from north: where to stand. */
  riseAzimuthDeg: number;
  /** Only ever one of the two that mean it can be seen. See above. */
  nakedEye: SightableVerdict;
  apparentMagnitude: number | null;
  magnitudeMeasured: boolean;
};

/** The verdicts that mean somebody standing outside would see something. */
export type SightableVerdict = "visible" | "binoculars";

/**
 * The two verdicts worth a notification.
 *
 * Binoculars as well as the naked eye, because "step outside with the
 * binoculars" is a real evening and the app has no way of knowing who owns a
 * pair — and the alert says which of the two it is, so nobody goes out
 * expecting the other. Everything below this is either invisible or unknown,
 * and neither is a reason to make a phone buzz.
 */
const SIGHTABLE = new Set<NakedEyeVerdict>(["visible", "binoculars"]);

/**
 * The whole day's alerts, planned from the catalogue.
 *
 * A day rather than the three hours the sky draws, because the two are read by
 * different people: an arc is for somebody holding the phone up now, and this
 * is for somebody who has put it away and will not open it again before the
 * pass. Nothing of ours runs while the app is closed — iOS delivers what was
 * queued and nothing more — so the window is the promise. See
 * `PASS_ALERTS.windowHours`.
 *
 * Sliced throughout: this is eight times the work the drawn plan does, and it
 * runs behind a view that is drawing sixty times a second. It has no deadline
 * at all — the alerts already queued stay queued until this finishes — so it
 * can take as many slices as it needs.
 */
export async function planPassAlerts(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices
): Promise<PassAlert[]> {
  const passes = await landmarkPasses(
    catalog,
    fromMs,
    observer,
    slices,
    PASS_ALERTS.windowHours
  );
  if (passes.length === 0) return [];

  // The same description the panel reads — one propagation and one sun position
  // per pass, deciding each at its own high point — over a longer plan.
  return alertsWorthSending(upcomingPasses(passes, catalog, observer), fromMs);
}

/**
 * Which of the described passes are worth an alert, soonest first.
 *
 * Five tests, and the first is the only one about the sky: can it be seen when
 * it comes over. The rest are about the person being told — high enough to be
 * above the houses, far enough ahead to act on, not in the middle of the night,
 * and not so many of them that the next one is an annoyance rather than news.
 *
 * A pass already under way is left out. Its object is on the frame and the app
 * is the better answer for it; a notification for something that is already
 * crossing is a notification somebody reads on the way out to a sky it has left.
 */
export function alertsWorthSending(
  passes: readonly UpcomingPass[],
  nowMs: number
): PassAlert[] {
  const earliestMs = nowMs + PASS_ALERTS.minimumLeadMinutes * MS_PER_MINUTE;

  return passes
    .filter((pass) => !pass.started)
    .filter((pass) => SIGHTABLE.has(pass.nakedEye))
    .filter((pass) => pass.peakElevationDeg >= PASS_ALERTS.minimumPeakElevationDeg)
    .map(alertFor)
    .filter((alert) => alert.deliverAtMs >= earliestMs)
    .filter((alert) => !isQuietHour(new Date(alert.deliverAtMs).getHours()))
    .sort((one, other) => one.deliverAtMs - other.deliverAtMs)
    .slice(0, PASS_ALERTS.maximumScheduled);
}

/** One described pass, as the alert it would be sent as. */
function alertFor(pass: UpcomingPass): PassAlert {
  return {
    id: alertId(pass.noradId, pass.peakAtMs),
    noradId: pass.noradId,
    name: pass.name,
    deliverAtMs: pass.startsAtMs - PASS_ALERTS.leadMinutes * MS_PER_MINUTE,
    startsAtMs: pass.startsAtMs,
    peakAtMs: pass.peakAtMs,
    peakElevationDeg: pass.peakElevationDeg,
    riseAzimuthDeg: pass.riseAzimuthDeg,
    // Narrowed by the filter above, which the type cannot see through.
    nakedEye: pass.nakedEye as SightableVerdict,
    apparentMagnitude: pass.apparentMagnitude,
    magnitudeMeasured: pass.magnitudeMeasured
  };
}

/** What identifies one pass between plans. See `PassAlert.id`. */
export function alertId(noradId: number, peakAtMs: number): string {
  return `${noradId}@${Math.round(peakAtMs / MS_PER_MINUTE)}`;
}

/**
 * Whether an hour of the phone's own day is one to stay quiet in.
 *
 * Read on the device's clock rather than in UTC, because what it is protecting
 * is somebody asleep. Written to survive either ordering of the two bounds, so
 * a pair that does not wrap round midnight is still read as the window between
 * them rather than as its complement. See `PASS_ALERTS.quietFromHour`.
 */
export function isQuietHour(hour: number): boolean {
  // Read as numbers rather than as the two literals they are declared as, so
  // this reads as arithmetic on a pair of bounds instead of compiling down to
  // whatever the current pair happens to make true.
  const from: number = PASS_ALERTS.quietFromHour;
  const until: number = PASS_ALERTS.quietUntilHour;
  if (from === until) return false;
  return from < until ? hour >= from && hour < until : hour >= from || hour < until;
}

const MS_PER_MINUTE = 60_000;
