import { PASS_ALERTS } from "../constants";
import { Slices } from "../timeSlice";
import { ObserverLocation } from "../types";
import { SatelliteCatalog } from "./catalog";
import { isSighting, nakedEyeCandidatePasses } from "./nakedEyePasses";
import { SkyPass } from "./orbitPath";
import { UpcomingPass, upcomingPasses } from "./upcomingPasses";

/**
 * The passes worth interrupting somebody for, and when to interrupt them.
 *
 * Everything else in this app answers a question that was asked by opening it.
 * This is the one thing it says to a phone in a pocket — and the whole of what
 * makes that bearable is the word *verified*: a notification goes out only for
 * a pass that the same arithmetic the card uses has already decided can be
 * **seen**, from here, at the minute it names. Lit by the sun, dark on the
 * ground here, and bright enough for the naked eye (`nakedEye.ts`) — the same
 * sightings the passes panel lists, from any object that makes one rather than
 * only the landmarks (`nakedEyePasses.ts`). Everything else the sky is doing —
 * the sixteen thousand objects overhead at noon, the arcs drawn through a
 * daylit sky, the pass that is real and eclipsed — is a fact the app is happy
 * to draw and has no business waking anyone for.
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
  /** Only ever the one that means it can be seen. See above. */
  nakedEye: SightableVerdict;
  apparentMagnitude: number | null;
  magnitudeMeasured: boolean;
};

/**
 * The verdict that means somebody standing outside would see something.
 *
 * The naked eye alone, as in the passes panel (`isSighting`). Binoculars are a
 * real evening, but the app has no way of knowing who owns a pair, and an alert
 * is read as "go outside and look up" — which has to be true without one.
 */
export type SightableVerdict = "visible";

/**
 * The week's alerts, planned from the catalogue's naked-eye candidates.
 *
 * A week rather than the day the sky draws, because the two are read
 * by different people: an arc is for somebody holding the phone up now, and
 * this is for somebody who has put it away and will not open it again before
 * the pass. Nothing of ours runs while the app is closed — iOS delivers what was
 * queued and nothing more — so the horizon is the promise, and what limits it
 * is how far the elements can be trusted. See `PASS_ALERTS.horizonDays`.
 *
 * That limit is per object and counted from its own epoch, not from now: a
 * pass is kept only while it is within the horizon of the elements it was
 * propagated from. The planned window is the same horizon from now, which is
 * the furthest any pass could be kept, and a catalogue fetched this hour loses
 * only the day or so its elements were already old.
 *
 * Sliced throughout: this is many times the work the drawn plan does, and it
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
  const passes = await nakedEyeCandidatePasses(
    catalog,
    fromMs,
    observer,
    slices,
    PASS_ALERTS.horizonDays * HOURS_PER_DAY
  );
  const trusted = withinHorizon(passes, catalog);
  if (trusted.length === 0) return [];

  // The same description the panel reads — one propagation and one sun position
  // per pass, deciding each at its own high point — over a longer plan.
  return alertsWorthSending(upcomingPasses(trusted, catalog, observer), fromMs);
}

/**
 * The passes whose high point is close enough to their own elements' epoch
 * for the minute an alert names to still be the minute it happens.
 *
 * By catalogue number, because that is what a pass carries — and after
 * `oneArcEach` the number on a station's pass is the station's own, whose
 * elements are the ones it was propagated from.
 *
 * The same horizon for every object, though what it was measured against is
 * the landmark tier (`PASS_ALERTS.horizonDays`). A constellation satellite low
 * enough to be a naked-eye candidate is dragged on harder than the station,
 * so for those a week is the optimistic end of what its elements can carry.
 */
export function withinHorizon(
  passes: readonly SkyPass[],
  catalog: SatelliteCatalog
): SkyPass[] {
  const epochs = new Map<number, number>();
  for (const entry of catalog.entries) {
    if (epochs.has(entry.noradId)) continue;
    epochs.set(entry.noradId, (entry.satrec.jdsatepoch - UNIX_EPOCH_JD) * MS_PER_DAY);
  }

  const horizonMs = PASS_ALERTS.horizonDays * MS_PER_DAY;
  return passes.filter((pass) => {
    const epochMs = epochs.get(pass.noradId);
    return epochMs !== undefined && pass.peakAtMs - epochMs <= horizonMs;
  });
}

/**
 * Which of the described passes are worth an alert, soonest first.
 *
 * Five tests, and the first is the only one about the sky: can it be seen when
 * it comes over. The rest are about the person being told — high enough to be
 * above the houses, far enough ahead to act on, not in the middle of the night,
 * and not so many in one day that the next one is an annoyance rather than news
 * (`PASS_ALERTS.maximumPerDay`).
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
    .filter(isSighting)
    .filter((pass) => pass.peakElevationDeg >= PASS_ALERTS.minimumPeakElevationDeg)
    .map(alertFor)
    .filter((alert) => alert.deliverAtMs >= earliestMs)
    .filter((alert) => !isQuietHour(new Date(alert.deliverAtMs).getHours()))
    .sort((one, other) => one.deliverAtMs - other.deliverAtMs)
    .filter(soonestEachDay());
}

/**
 * A filter keeping the first `maximumPerDay` alerts of each day, for a list
 * already in delivery order.
 *
 * The day is the phone's calendar day, for the reason the quiet hours are read
 * on its clock: what is being rationed is how often one person's phone buzzes
 * between one morning and the next.
 */
function soonestEachDay(): (alert: PassAlert) => boolean {
  const kept = new Map<string, number>();
  return (alert) => {
    const when = new Date(alert.deliverAtMs);
    const day = `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
    const count = kept.get(day) ?? 0;
    if (count >= PASS_ALERTS.maximumPerDay) return false;
    kept.set(day, count + 1);
    return true;
  };
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
    // Narrowed by `isSighting` above, which the type cannot see through.
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
const HOURS_PER_DAY = 24;
const MS_PER_DAY = HOURS_PER_DAY * 60 * MS_PER_MINUTE;
/** The Julian date of 1970-01-01T00:00Z, where epoch milliseconds start. */
const UNIX_EPOCH_JD = 2440587.5;
