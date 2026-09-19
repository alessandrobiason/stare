import { FULL_TRAJECTORY, LANDMARK_PATHS, NAKED_EYE_PASSES, PASSES_PANEL } from "../constants";
import { runSliced, Slices } from "../timeSlice";
import { ObserverLocation } from "../types";
import { CatalogEntry, SatelliteCatalog } from "./catalog";
import { apparentMagnitude } from "./illumination";
import { skyDarknessAt } from "./nakedEye";
import { passesOf, passSearch, SkyPass, TimeSpan } from "./orbitPath";
import { perigeeAltitudeKm } from "./propagator";
import { standardMagnitudeFor } from "./standardMagnitude";
import { UpcomingPass, upcomingPasses } from "./upcomingPasses";

/**
 * The passes somebody could go outside and see, whatever is making them.
 *
 * The panel and the alerts used to be about the landmark tier: its passes,
 * each with a verdict beside it. That answered "when does the station come
 * over" and left the verdict to say whether the answer was worth anything —
 * which for most of the day it was not, and which says nothing at all about a
 * string of freshly launched satellites that is the brightest thing in the
 * evening sky. The question somebody actually asks before going outside is the
 * other way round: *what can I see tonight*. So the objects are no longer the
 * starting point. The sighting is.
 *
 * Deciding it is the same arithmetic as ever — each pass judged at its high
 * point, the way the card judges the object under the finger
 * (`upcomingPasses`, `nakedEye.ts`) — and only `"visible"` counts. Binoculars
 * are a real evening, but they are not the naked eye, and a list or an alert
 * that says "you can see this" has to mean it without one.
 *
 * What is not the same is what is searched. Every object with a recorded
 * brightness is ten thousand of them, and a day of passes is a couple of
 * thousand propagations each, so the search starts from the ones that could be
 * bright enough at all (`nakedEyeCandidates`) — and only over the hours dark
 * enough for anything to be seen (`darkSpans`).
 */

/**
 * The brightest this object could ever look: straight overhead at the low point
 * of its orbit, with its whole lit face turned down. `null` where nobody has
 * recorded how reflective it is, which is not a promise of anything.
 *
 * No night allows that geometry — the object would have to be lit from behind
 * an observer the sun has set on — so this is a bound, a few tenths of a
 * magnitude brighter than the best real pass. A bound is what it is for: an
 * object this cannot put past the bar is one no pass will.
 */
export function brightestMagnitude(entry: CatalogEntry): number | null {
  const standard = standardMagnitudeFor(entry.noradId, entry.name);
  if (standard === null) return null;
  return apparentMagnitude(standard.magnitude, perigeeAltitudeKm(entry.satrec), 0);
}

/**
 * The objects worth searching for naked-eye passes, one entry per catalogue
 * number. See `NAKED_EYE_PASSES.candidateMagnitude`.
 *
 * Kept per catalog, because the answer is a property of the elements and a
 * catalog is never changed once built: the panel asks every few minutes and
 * the alerts every half hour, and both would otherwise walk sixteen thousand
 * names through the fleet patterns each time.
 */
export function nakedEyeCandidates(catalog: SatelliteCatalog): readonly CatalogEntry[] {
  const known = candidatesByCatalog.get(catalog);
  if (known) return known;

  const seen = new Set<number>();
  const candidates: CatalogEntry[] = [];
  for (const entry of catalog.entries) {
    if (seen.has(entry.noradId)) continue;
    const brightest = brightestMagnitude(entry);
    if (brightest === null || !(brightest <= NAKED_EYE_PASSES.candidateMagnitude)) continue;
    seen.add(entry.noradId);
    candidates.push(entry);
  }

  candidatesByCatalog.set(catalog, candidates);
  return candidates;
}

const candidatesByCatalog = new WeakMap<SatelliteCatalog, readonly CatalogEntry[]>();

/**
 * The stretches of a window dark enough here for anything in orbit to be seen,
 * widened by `NAKED_EYE_PASSES.darknessPadMinutes` at each end and merged
 * where that makes them meet.
 *
 * Read on a grid rather than solved for, because the sun's altitude is smooth
 * and what is asked of the answer is only "not in the middle of the day": a
 * dusk read five minutes late is inside the pad.
 */
export function darkSpans(
  fromMs: number,
  untilMs: number,
  observer: ObserverLocation
): TimeSpan[] {
  const stepMs = NAKED_EYE_PASSES.darknessStepMinutes * MS_PER_MINUTE;
  const padMs = NAKED_EYE_PASSES.darknessPadMinutes * MS_PER_MINUTE;
  const spans: TimeSpan[] = [];

  const add = (darkFromMs: number, darkUntilMs: number) => {
    // A step earlier than the first dark reading, because the dusk fell
    // somewhere in the step before it.
    const span = {
      fromMs: Math.max(fromMs, darkFromMs - stepMs - padMs),
      untilMs: Math.min(untilMs, darkUntilMs + padMs)
    };
    const last = spans[spans.length - 1];
    if (last && span.fromMs <= last.untilMs) last.untilMs = span.untilMs;
    else spans.push(span);
  };

  let darkSinceMs: number | null = null;
  for (let atMs = fromMs; atMs < untilMs; atMs += stepMs) {
    const dark = skyDarknessAt(observer, new Date(atMs)) !== "daylight";
    if (dark && darkSinceMs === null) darkSinceMs = atMs;
    if (!dark && darkSinceMs !== null) {
      add(darkSinceMs, atMs);
      darkSinceMs = null;
    }
  }
  if (darkSinceMs !== null) add(darkSinceMs, untilMs);

  return spans;
}

/**
 * Every pass the candidates make over the observer in the dark hours of a
 * window, deduped, and before anything has been said about whether it can be
 * seen.
 *
 * The first half of `planSightings`, on its own for the alerts, which cut the
 * plan to what the elements can be trusted over (`withinHorizon`) before
 * describing it.
 */
export async function nakedEyeCandidatePasses(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices,
  windowHours: number,
  pastArcDeg: number = LANDMARK_PATHS.pastArcDeg
): Promise<SkyPass[]> {
  const spans = darkSpans(fromMs, fromMs + windowHours * MS_PER_HOUR, observer);
  if (spans.length === 0) return [];
  return passesOf(nakedEyeCandidates(catalog), fromMs, observer, slices, spans, pastArcDeg);
}

/** Whether a described pass is one somebody could see without help. */
export function isSighting(pass: UpcomingPass): boolean {
  return pass.nakedEye === "visible";
}

/**
 * The naked-eye passes of the next `windowHours`, soonest first: what the
 * passes panel lists.
 */
export async function planSightings(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices,
  windowHours: number = PASSES_PANEL.windowHours
): Promise<UpcomingPass[]> {
  return (await planSightingPaths(catalog, fromMs, observer, slices, windowHours)).passes;
}

/** The panel's sightings, and the lines on the sky they are drawn as. */
export type SightingPlan = {
  /** Soonest first, as `planSightings` gives them. */
  passes: UpcomingPass[];
  /** The same passes as arcs across the sky, soonest first. See `drawnSightings`. */
  paths: SkyPass[];
};

/**
 * The naked-eye passes of the next `windowHours`, and the same passes as
 * arcs across the sky: what the passes panel lists, and where on the sky each
 * of them will be.
 *
 * One search for both, so the list and the lines can never disagree about
 * what is coming — a row is always a line, and a line is always a row. The
 * pass under way when the plan is made carries its wake back to the rise
 * (`FULL_TRAJECTORY`), since what is drawn is the whole trajectory.
 */
export async function planSightingPaths(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices,
  windowHours: number = PASSES_PANEL.windowHours
): Promise<SightingPlan> {
  const found = await nakedEyeCandidatePasses(
    catalog,
    fromMs,
    observer,
    slices,
    windowHours,
    FULL_TRAJECTORY.pastArcDeg
  );
  const passes = upcomingPasses(found, catalog, observer).filter(isSighting);
  const listed = new Set(passes.map(passKey));
  const paths = found
    .filter((pass) => listed.has(passKey(pass)))
    .sort((one, other) => one.startsAtMs - other.startsAtMs);
  return { passes, paths };
}

/**
 * Which of the sightings' arcs are drawn at `atMs`: each object's soonest pass
 * not yet over, soonest first, and no more than
 * `LANDMARK_PATHS.maximumSightingPaths` of them.
 *
 * One per object because a line is a direction to turn, and the station's pass
 * in an hour and its pass after midnight are two directions for the same name.
 * Chosen against the clock rather than when the plan is made, so the second
 * appears the moment the first is over instead of at the next plan. Capped
 * for the evening a fresh launch is dozens of lights on nearly the same line.
 *
 * `paths` is soonest first, as `planSightingPaths` leaves it; this is a walk of
 * a few dozen entries at most, and it runs once a frame.
 */
export function drawnSightings(paths: readonly SkyPass[], atMs: number): SkyPass[] {
  const drawn: SkyPass[] = [];
  const objects = new Set<number>();
  for (const pass of paths) {
    if (drawn.length >= LANDMARK_PATHS.maximumSightingPaths) break;
    if (pass.endsAtMs <= atMs || objects.has(pass.noradId)) continue;
    objects.add(pass.noradId);
    drawn.push(pass);
  }
  return drawn;
}

/** What identifies one pass of one object, the same in a plan and in its description. */
function passKey(pass: { noradId: number; startsAtMs: number }): string {
  return `${pass.noradId}@${pass.startsAtMs}`;
}

/**
 * One object's passes over the panel's day, described: what the card says
 * about the satellite somebody tapped.
 *
 * Searched for that object alone, candidate or not. It is one object rather
 * than a tier, so what the candidate bound saves is not worth what it would
 * cost here — a card that stayed silent about the one faint fleet member that
 * does clear the bar tonight.
 */
export async function passesAheadFor(
  entry: CatalogEntry,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices,
  windowHours: number = PASSES_PANEL.windowHours
): Promise<UpcomingPass[]> {
  const passes = await runSliced(
    passSearch(entry, fromMs, observer, undefined, windowHours),
    slices
  );
  return upcomingPasses(passes, { entries: [entry] }, observer);
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
