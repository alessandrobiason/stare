import { FULL_TRAJECTORY, LANDMARK_PATHS, MINIMUM_SATELLITE_ELEVATION_DEG } from "../constants";
import {
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt,
  ObserverFrame
} from "../coordinates/transform";
import { clamp, toDegrees } from "../math/angles";
import { runSliced, runToEnd, SlicedJob, Slices } from "../timeSlice";
import { EnuPosition, ObserverLocation } from "../types";
import { CatalogEntry } from "./catalog";
import { SatelliteCategory, SatelliteSubcategory } from "./categories";
import { propagateAt, SatRec } from "./propagator";

/**
 * Where an object will cross the sky: the passes somebody could go outside and
 * see, and the one object someone has tapped.
 *
 * The overlay's other three answers about an object are all about the instant
 * it is drawn at: a mark for where it is, a size for how far away, a tail for
 * the twelve seconds behind it. That is the right amount to say about sixteen
 * thousand satellites and much too little to say about the few worth going
 * outside for, because the question someone has about the station is not where
 * it is — it is under the floor, and no marker can be drawn for that — but
 * *when* it comes over and *where* to stand when it does.
 *
 * A path answers both at once. It is the arc the object traces between clearing
 * the elevation floor and dropping back through it, sampled densely enough to
 * draw as a line, with round clock minutes marked along it. Drawn, it is the
 * one thing on the frame that is worth looking at while its object is nowhere
 * near it: a line leaving the top of the view is a direction to turn, and the
 * marks on it say how long there is to do it in.
 *
 * Everything here works in the observer's local frame, and every sample is
 * resolved at its own instant — so a path is a fixed thing in the sky rather
 * than a shape that has to be re-derived as the Earth turns under it. The frame
 * loop projects it and does no arithmetic of its own beyond that. Nothing in
 * this module knows about pixels, frames or cameras.
 */

/** Where an object will be, and when it is there. */
export type SkySample = {
  position: EnuPosition;
  /** Epoch milliseconds, which is the clock the whole plan is written in. */
  atMs: number;
};

/**
 * A round clock minute, marked on the path.
 *
 * Carries the path a little further on as well as the point itself, because the
 * mark is an arrowhead and an arrowhead is nothing without a direction. Two
 * positions rather than an angle for the same reason the markers' trails are
 * two points: the frame is not square, so a direction is only a direction once
 * both ends have been projected into pixels.
 */
export type SkyTick = {
  position: EnuPosition;
  ahead: EnuPosition;
  atMs: number;
};

/** One object's crossing of the sky, from the elevation floor back down to it. */
export type SkyPass = {
  /** The name the overlay calls this object, which is the one it labels with. */
  name: string;
  /** Its catalogue number, which is what identifies it between plans. */
  noradId: number;
  category: SatelliteCategory;
  /** The part of it, for a split category, so the filter's switches reach its line too. */
  subcategory: SatelliteSubcategory | null;
  /** The arc, ordered in time. Never fewer than two points. */
  samples: SkySample[];
  /**
   * The sky a pass already under way had covered before the plan was made:
   * ordered in time, ending just before `samples` begins, and reaching back
   * `LANDMARK_PATHS.pastArcDeg` or to the rise, whichever is nearer. Empty for
   * a pass that had not begun, whose rise is in `samples` already.
   *
   * Only the wake behind the object is drawn from it (`pathBehind`), and it is
   * kept apart from `samples` so that nothing else about a pass changes: where
   * it starts, its time marks and its place in the list of what is coming are
   * all still the sky ahead.
   *
   * Without it the wake would be as long as the plan was old, and every minute
   * a new plan would cut it back to nothing.
   */
  history: SkySample[];
  ticks: SkyTick[];
  startsAtMs: number;
  endsAtMs: number;
  /** How high it gets, in degrees: what makes a pass worth walking outside for. */
  peakElevationDeg: number;
  /**
   * When it is highest, in epoch milliseconds.
   *
   * The one instant that stands for the whole arc. A pass is minutes long and
   * the sky changes across it — the station flies into the Earth's shadow
   * mid-crossing more often than not — so anything said about whether a pass
   * can be *seen* has to be said at a moment rather than about the pass, and
   * this is the moment worth being outside for. See `upcomingPasses.ts`.
   */
  peakAtMs: number;
  /**
   * Whether the object was already on this arc when the plan was made.
   *
   * The pass under way is the one whose marker is on the frame, which is why it
   * is exempt from `minimumPeakElevationDeg` and why nothing labels it with a
   * rise time: it has already risen, and the mark is the label.
   */
  started: boolean;
};

/** The floor a path starts and ends at: where the marker itself appears. */
const FLOOR_DEG = MINIMUM_SATELLITE_ELEVATION_DEG;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Where an object is at `atMs`, in the observer's frame, or `null`. */
function enuAt(satrec: SatRec, atMs: number, frame: ObserverFrame): EnuPosition | null {
  const when = new Date(atMs);
  const eci = propagateAt(satrec, when);
  return eci ? eciToEnuInFrame(eci, gmstAt(when), frame) : null;
}

/** The angle between two directions from the observer, in degrees. */
export function separationDeg(from: EnuPosition, to: EnuPosition): number {
  const dot = from.east * to.east + from.north * to.north + from.up * to.up;
  const lengths =
    Math.hypot(from.east, from.north, from.up) * Math.hypot(to.east, to.north, to.up);
  if (!(lengths > 0)) return 0;
  return toDegrees(Math.acos(clamp(dot / lengths, -1, 1)));
}

/** A point `share` of the way from one position to another. */
function between(from: EnuPosition, to: EnuPosition, share: number): EnuPosition {
  return {
    east: from.east + (to.east - from.east) * share,
    north: from.north + (to.north - from.north) * share,
    up: from.up + (to.up - from.up) * share
  };
}

/**
 * A direction `share` of the way from one position to another, measured as an
 * angle rather than along the straight line between them.
 *
 * `between` is the right step in time — an object's position moves along its
 * orbit — but not in angle: where the range changes along a segment, as it does
 * by a factor of five between the horizon and overhead, equal steps along the
 * line are unequal angles. Cutting an arc by degrees wants the angle, and a
 * direction is all a projection reads, so the two ends are made unit vectors
 * first; over the few degrees a segment spans, a step along the chord between
 * them is a step in angle to a ten-thousandth of itself.
 */
function directionBetween(from: EnuPosition, to: EnuPosition, share: number): EnuPosition {
  const fromLength = Math.hypot(from.east, from.north, from.up) || 1;
  const toLength = Math.hypot(to.east, to.north, to.up) || 1;
  return {
    east: from.east / fromLength + (to.east / toLength - from.east / fromLength) * share,
    north: from.north / fromLength + (to.north / toLength - from.north / fromLength) * share,
    up: from.up / fromLength + (to.up / toLength - from.up / fromLength) * share
  };
}

/**
 * When the object crosses the elevation floor, given a time it is above it and
 * one it is below.
 *
 * Bisection rather than a solved crossing: elevation against time has no closed
 * form through SGP4, and the alternative — accepting the search step — puts the
 * end of the drawn arc up to 45 seconds from the floor, which near the horizon
 * is several degrees of sky and a line that visibly stops short of where the
 * marker appears. Returns the side of the crossing that is still above the
 * floor, so an arc built from it is one the marker would be drawn on.
 */
function floorCrossingMs(
  satrec: SatRec,
  frame: ObserverFrame,
  aboveMs: number,
  belowMs: number
): number {
  let above = aboveMs;
  let below = belowMs;
  for (let step = 0; step < LANDMARK_PATHS.crossingRefinements; step += 1) {
    const middle = (above + below) / 2;
    const position = enuAt(satrec, middle, frame);
    if (position && elevationDeg(position) > FLOOR_DEG) above = middle;
    else below = middle;
  }
  return above;
}

/**
 * The next step along a path, in milliseconds, from how fast the object is
 * crossing the sky.
 *
 * See `LANDMARK_PATHS.sampleStepDeg`: the samples are spaced by angle, so the
 * station overhead is sampled every few seconds and Chandra every few minutes,
 * and both come out as a line with the same number of corners in it.
 */
function stepFor(degPerSecond: number): number {
  const { sampleStepDeg, minimumStepSeconds, maximumStepSeconds } = LANDMARK_PATHS;
  const seconds = degPerSecond > 0 ? sampleStepDeg / degPerSecond : maximumStepSeconds;
  return clamp(seconds, minimumStepSeconds, maximumStepSeconds) * 1000;
}

/** What one walk along an arc found, and where the search should resume. */
type Walk = {
  samples: SkySample[];
  peakElevationDeg: number;
  /** When that peak is reached, to the sample the arc was walked at. */
  peakAtMs: number;
  resumeMs: number;
};

/**
 * Walks one arc from `startMs` until the object sets or the window ends.
 *
 * The last sample is placed on the floor crossing itself rather than at
 * whatever time the walk happened to land on, so the line ends where the marker
 * does.
 */
function walkArc(satrec: SatRec, frame: ObserverFrame, startMs: number, untilMs: number): Walk {
  const samples: SkySample[] = [];
  let peakElevationDeg = -90;
  let peakAtMs = startMs;
  let stepMs = LANDMARK_PATHS.initialStepSeconds * 1000;
  let atMs = startMs;
  let previous: SkySample | null = null;

  while (atMs <= untilMs && samples.length < LANDMARK_PATHS.maximumSamples) {
    const position = enuAt(satrec, atMs, frame);
    // Elements SGP4 has stopped being able to place: the arc ends where the
    // last good sample was, rather than being drawn through a gap.
    if (!position) return { samples, peakElevationDeg, peakAtMs, resumeMs: atMs + stepMs };

    const elevation = elevationDeg(position);
    if (!(elevation > FLOOR_DEG)) {
      if (previous) {
        const setsAtMs = floorCrossingMs(satrec, frame, previous.atMs, atMs);
        const last = enuAt(satrec, setsAtMs, frame);
        if (last) samples.push({ position: last, atMs: setsAtMs });
      }
      // Past the crossing, so the search that resumes here cannot find the same
      // arc a second time.
      return { samples, peakElevationDeg, peakAtMs, resumeMs: atMs };
    }

    if (elevation > peakElevationDeg) {
      peakElevationDeg = elevation;
      peakAtMs = atMs;
    }
    const sample = { position, atMs };
    samples.push(sample);
    if (previous) {
      const seconds = (atMs - previous.atMs) / 1000;
      stepMs = stepFor(separationDeg(previous.position, position) / seconds);
    }
    previous = sample;
    atMs += stepMs;
  }

  return { samples, peakElevationDeg, peakAtMs, resumeMs: atMs };
}

/**
 * The arc behind a pass already under way, walked backwards from its first
 * sample until the object drops to the floor or `pastArcDeg` of sky is covered.
 *
 * `walkArc` run the other way, and for the same reasons spaced by angle and
 * ended on the floor crossing itself: the wake starts where the marker first
 * appeared rather than a step short of it. Ordered in time on the way out.
 *
 * `maxDeg` is a landmark's short wake by default, and the focused trajectory's
 * much longer one when a caller asks for it — the walk itself does not care
 * which: it stops at the rise or at `maxDeg`, whichever comes first.
 */
function walkBack(
  satrec: SatRec,
  frame: ObserverFrame,
  from: SkySample,
  maxDeg: number = LANDMARK_PATHS.pastArcDeg
): SkySample[] {
  const history: SkySample[] = [];
  let previous = from;
  let coveredDeg = 0;
  let stepMs = LANDMARK_PATHS.initialStepSeconds * 1000;

  while (coveredDeg < maxDeg && history.length < LANDMARK_PATHS.maximumSamples) {
    const atMs = previous.atMs - stepMs;
    const position = enuAt(satrec, atMs, frame);
    if (!position) break;

    if (!(elevationDeg(position) > FLOOR_DEG)) {
      const risesAtMs = floorCrossingMs(satrec, frame, previous.atMs, atMs);
      const first = risesAtMs < previous.atMs ? enuAt(satrec, risesAtMs, frame) : null;
      if (first) history.push({ position: first, atMs: risesAtMs });
      break;
    }

    const stepDeg = separationDeg(previous.position, position);
    coveredDeg += stepDeg;
    stepMs = stepFor(stepDeg / (stepMs / 1000));
    previous = { position, atMs };
    history.push(previous);
  }

  return history.reverse();
}

/**
 * The round clock minutes falling on an arc, at a cadence the arc itself
 * chooses. See `LANDMARK_PATHS.tickMinutes`.
 *
 * Placed by interpolating between the samples either side rather than by
 * propagating again: the samples are four degrees apart and the segment between
 * two of them is the path to a fifth of a pixel, which is what makes the line
 * drawable in the first place.
 */
function ticksAlong(samples: SkySample[]): SkyTick[] {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const minutes = (last.atMs - first.atMs) / MS_PER_MINUTE;
  let extentDeg = 0;
  for (let index = 1; index < samples.length; index += 1) {
    extentDeg += separationDeg(samples[index - 1].position, samples[index].position);
  }
  if (!(minutes > 0) || !(extentDeg > 0)) return [];

  const degPerMinute = extentDeg / minutes;
  const cadence = LANDMARK_PATHS.tickMinutes.find(
    (candidate) => degPerMinute * candidate >= LANDMARK_PATHS.tickSeparationDeg
  );
  // An object so slow that even an hour of it does not clear the separation —
  // the science orbits, which barely move against the sky — carries one mark in
  // the middle of its arc rather than a row of them on top of each other. Not a
  // clock minute, and not pretending to be one: what it is there for is the
  // direction, which is the one thing a line cannot say by itself.
  if (cadence === undefined) return [middleOf(samples)];

  const stepMs = cadence * MS_PER_MINUTE;
  const ticks: SkyTick[] = [];
  let index = 1;
  for (let atMs = Math.ceil(first.atMs / stepMs) * stepMs; atMs <= last.atMs; atMs += stepMs) {
    while (index < samples.length && samples[index].atMs < atMs) index += 1;
    if (index >= samples.length) break;
    const before = samples[index - 1];
    const after = samples[index];
    const span = after.atMs - before.atMs;
    const share = span > 0 ? (atMs - before.atMs) / span : 0;
    ticks.push({
      position: between(before.position, after.position, share),
      // The next sample is the direction to draw across — unless the mark has
      // landed on top of it, where the one after carries the same direction and
      // is not the same point.
      ahead:
        share > 0.9 && index + 1 < samples.length ? samples[index + 1].position : after.position,
      atMs
    });
  }
  return ticks;
}

/** The middle of an arc, as the one mark a slow object gets. */
function middleOf(samples: SkySample[]): SkyTick {
  const at = Math.floor((samples.length - 1) / 2);
  return {
    position: samples[at].position,
    ahead: samples[at + 1].position,
    atMs: samples[at].atMs
  };
}

/**
 * Every pass one object makes over the observer in the planning window.
 *
 * The window is marched at `searchStepSeconds` while the object is below the
 * floor and sampled by angle while it is above it, so the cost is set by the
 * window rather than by how busy the sky is. A pass already under way at
 * `fromMs` starts there rather than at the rise that happened in the past: what
 * is drawn is the sky ahead. The ground the object has already covered is kept
 * beside it, a short way back, for the fading wake behind the object
 * (`SkyPass.history`).
 *
 * `pastArcDeg` bounds how far back that wake reaches: a short one by default,
 * or `FULL_TRAJECTORY.pastArcDeg` for a pass drawn on the sky, which reaches
 * back to the rise. See `focusedPassFor`.
 *
 * `windowHours` is how far ahead to look: three hours for the object someone
 * has tapped, because that is the sky somebody is standing under, and a day or
 * a week for the panel and the notifications, because the app will not be
 * opened again in between. Straight through here — the search for one object
 * over three hours is a few milliseconds — and sliced over a longer window,
 * which is what `passSearch` is for.
 */
export function passesFor(
  entry: CatalogEntry,
  fromMs: number,
  observer: ObserverLocation,
  pastArcDeg: number = LANDMARK_PATHS.pastArcDeg,
  windowHours: number = LANDMARK_PATHS.windowHours
): SkyPass[] {
  return runToEnd(passSearch(entry, fromMs, observer, pastArcDeg, windowHours));
}

/**
 * The same search, written as a job that can be stopped between steps.
 *
 * `passesFor` is this run straight through, and is what the tapped object's
 * line uses: three hours of one object is a couple of hundred propagations,
 * which is under a frame and not worth the machinery. The panel's and the
 * alerts' plans are the same search over a day or a week, which is not — one
 * object's day is tens of milliseconds, and a few dozen of them run in one go
 * is a second of dropped frames on a view that is drawing sixty times a second.
 *
 * The checkpoint is the top of the search loop, where the state is one clock
 * reading and the last time the object was below the floor: the arc walk
 * itself runs whole, which is a few hundred propagations at the very most and
 * the one place the loop is carrying a shape it has not finished. See
 * `SlicedJob`.
 */
export function* passSearch(
  entry: CatalogEntry,
  fromMs: number,
  observer: ObserverLocation,
  pastArcDeg: number = LANDMARK_PATHS.pastArcDeg,
  windowHours: number = LANDMARK_PATHS.windowHours
): SlicedJob<SkyPass[]> {
  const frame = createObserverFrame(observer);
  const untilMs = fromMs + windowHours * MS_PER_HOUR;
  const searchMs = LANDMARK_PATHS.searchStepSeconds * 1000;
  const passes: SkyPass[] = [];

  let atMs = fromMs;
  /** The last time known to be below the floor, for refining the rise. */
  let belowMs: number | null = null;

  while (atMs < untilMs) {
    yield;
    const position = enuAt(entry.satrec, atMs, frame);
    if (!position || !(elevationDeg(position) > FLOOR_DEG)) {
      belowMs = atMs;
      atMs += searchMs;
      continue;
    }

    // Nothing below the floor behind us means the object was already up when
    // the plan was made: the arc starts here rather than at a rise in the past.
    const startMs =
      belowMs === null ? atMs : floorCrossingMs(entry.satrec, frame, atMs, belowMs);
    const started = startMs === fromMs;
    const walk = walkArc(entry.satrec, frame, startMs, untilMs);
    atMs = Math.max(walk.resumeMs, atMs + searchMs);
    belowMs = atMs;

    // Two points is the least a line can be drawn from, and a pass that clears
    // the floor for less than that is one nobody could act on anyway.
    if (walk.samples.length < 2) continue;
    if (!started && walk.peakElevationDeg < LANDMARK_PATHS.minimumPeakElevationDeg) continue;

    passes.push({
      name: entry.name,
      noradId: entry.noradId,
      category: entry.category,
      subcategory: entry.subcategory,
      samples: walk.samples,
      history: started ? walkBack(entry.satrec, frame, walk.samples[0], pastArcDeg) : [],
      ticks: ticksAlong(walk.samples),
      startsAtMs: walk.samples[0].atMs,
      endsAtMs: walk.samples[walk.samples.length - 1].atMs,
      peakElevationDeg: walk.peakElevationDeg,
      peakAtMs: walk.peakAtMs,
      started
    });
  }

  return passes;
}

/**
 * The satellite someone has tapped, as its own current or very next pass.
 *
 * `passesFor` run for one object, with the wake reaching back to the rise
 * (`FULL_TRAJECTORY.pastArcDeg`). Every category answers, not only the ones
 * the passes panel draws: what decides whether an object gets a path here is
 * whether someone tapped it, not what it is.
 *
 * `null` when nothing above the floor is on the way for it within the
 * planning window — a peak too low to be worth a line, on top of the low
 * pass exemption `passesFor` already gives a pass under way.
 */
export function focusedPassFor(
  entry: CatalogEntry,
  fromMs: number,
  observer: ObserverLocation
): SkyPass | null {
  return passesFor(entry, fromMs, observer, FULL_TRAJECTORY.pastArcDeg)[0] ?? null;
}

/** Whether two passes are one object drawn twice. See `duplicateSeconds`. */
function sameArc(one: SkyPass, other: SkyPass): boolean {
  if (Math.abs(one.startsAtMs - other.startsAtMs) > LANDMARK_PATHS.duplicateSeconds * 1000) {
    return false;
  }
  return (
    separationDeg(one.samples[0].position, other.samples[0].position) <
    LANDMARK_PATHS.duplicateDeg
  );
}

/**
 * One arc per crossing, whatever the catalogue calls the thing on it.
 *
 * A crew ferry docked to a station is the station's own arc under another name,
 * and both are landmarks, so the same line would otherwise be found three or
 * four times over. Of two passes over the same piece of sky at the same minute
 * only the older catalogue number survives: a ferry is launched to a station,
 * so the station is the older number of the two.
 */
function oneArcEach(passes: SkyPass[]): SkyPass[] {
  const kept: SkyPass[] = [];
  for (const pass of [...passes].sort((one, other) => one.startsAtMs - other.startsAtMs)) {
    const twin = kept.findIndex((other) => sameArc(other, pass));
    if (twin < 0) kept.push(pass);
    else if (pass.noradId < kept[twin].noradId) kept[twin] = pass;
  }
  return kept;
}

/** A stretch of a plan's window, in epoch milliseconds. */
export type TimeSpan = { fromMs: number; untilMs: number };

/**
 * Every pass a set of objects makes over the observer in some stretches of a
 * plan made at `fromMs`, deduped.
 *
 * For whichever objects a caller has chosen and over whichever parts of the
 * window it cares about — only the hours dark enough to see anything in, for
 * the naked-eye plans (`nakedEyePasses.ts`). None of the callers cares which
 * objects another kept, and all of them want exactly this: those objects' real
 * passes, once each.
 *
 * Sliced, because this is the one piece of satellite arithmetic in the app that
 * is neither per frame nor spread across frames: a few thousand propagations in
 * one go is tens of milliseconds, which is several dropped frames of an overlay
 * that is drawing sixty times a second. Handing the thread back inside each
 * object's own search costs the plan a little wall-clock time and costs the sky
 * nothing — and there is no deadline on it, because the plan it replaces goes
 * on being used until this one lands. See `src/timeSlice.ts`.
 *
 * A pass already up when a stretch opens is only kept for a stretch that opens
 * at `fromMs`, where it is the pass under way. Anywhere else it is a pass the
 * stretch has cut in two, and what is left of it has no rise to count down to.
 *
 * `pastArcDeg` is how far back the wake of that pass under way is walked: the
 * short default for a plan that is only asked the times, and
 * `FULL_TRAJECTORY.pastArcDeg` for one that is drawn (`planSightingPaths`).
 */
export async function passesOf(
  entries: readonly CatalogEntry[],
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices,
  spans: readonly TimeSpan[],
  pastArcDeg: number = LANDMARK_PATHS.pastArcDeg
): Promise<SkyPass[]> {
  const found: SkyPass[] = [];
  for (const entry of entries) {
    for (const span of spans) {
      const hours = (span.untilMs - span.fromMs) / MS_PER_HOUR;
      const passes = await runSliced(
        passSearch(entry, span.fromMs, observer, pastArcDeg, hours),
        slices
      );
      for (const pass of passes) {
        if (!pass.started || span.fromMs === fromMs) found.push(pass);
      }
    }
  }
  return oneArcEach(found);
}

/**
 * The part of a pass that is still ahead at `atMs`, starting from where the
 * object is at that moment.
 *
 * The plan is worked out once a minute and drawn sixty times a second, so
 * without this the line would start at where the station was up to a minute ago
 * — which for a low pass is most of the sky it has already crossed, drawn as
 * though it were still to come. Trimming here rather than replanning more often
 * makes the head of the line exact on every frame instead of once a minute: the
 * first point is interpolated to the present, which is the marker's own
 * position to within the width of the line.
 *
 * Empty once the pass is over, which is how a finished arc leaves the frame
 * between one plan and the next.
 */
export function pathFrom(pass: SkyPass, atMs: number): EnuPosition[] {
  const { samples } = pass;
  if (atMs <= samples[0].atMs) return samples.map((sample) => sample.position);
  if (atMs >= samples[samples.length - 1].atMs) return [];

  let index = 1;
  while (index < samples.length && samples[index].atMs < atMs) index += 1;
  const before = samples[index - 1];
  const after = samples[index];
  const span = after.atMs - before.atMs;
  const head = between(before.position, after.position, span > 0 ? (atMs - before.atMs) / span : 0);

  const ahead: EnuPosition[] = [head];
  for (let rest = index; rest < samples.length; rest += 1) ahead.push(samples[rest].position);
  return ahead;
}

/**
 * The part of a pass already behind the object at `atMs`, from where the object
 * is at that moment backwards, and no more than `arcDeg` of sky of it.
 *
 * `pathFrom` the other way. It starts at the same interpolated head, so the wake
 * and the line ahead meet at the object, and it reaches back into the sky the
 * plan walked before it began (`SkyPass.history`) — so how long the wake is
 * depends on how far the object has come, not on how old the plan is.
 *
 * Cut at `arcDeg` by interpolating along the last segment it reaches into, so
 * the end of the wake moves as smoothly as its head does rather than a sample
 * at a time. Empty before the pass has begun and once it is over.
 */
export function pathBehind(pass: SkyPass, atMs: number, arcDeg: number): EnuPosition[] {
  const chain = pass.history.length > 0 ? [...pass.history, ...pass.samples] : pass.samples;
  if (atMs <= chain[0].atMs || atMs >= chain[chain.length - 1].atMs) return [];

  let index = 1;
  while (index < chain.length && chain[index].atMs < atMs) index += 1;
  const before = chain[index - 1];
  const after = chain[index];
  const span = after.atMs - before.atMs;
  const head = between(before.position, after.position, span > 0 ? (atMs - before.atMs) / span : 0);

  const behind: EnuPosition[] = [head];
  let coveredDeg = 0;
  for (let rest = index - 1; rest >= 0; rest -= 1) {
    const last = behind[behind.length - 1];
    const next = chain[rest].position;
    const stepDeg = separationDeg(last, next);
    if (coveredDeg + stepDeg >= arcDeg) {
      behind.push(directionBetween(last, next, stepDeg > 0 ? (arcDeg - coveredDeg) / stepDeg : 0));
      break;
    }
    behind.push(next);
    coveredDeg += stepDeg;
  }
  return behind;
}

/** One piece of a chain cut along the sky, and how far along the chain it starts. */
export type ArcPiece = {
  positions: EnuPosition[];
  /** Degrees of sky from the chain's first point to this piece's first point. */
  fromDeg: number;
};

/**
 * A chain of positions cut into pieces measured along the sky: one starting
 * every `everyDeg` from the chain's first point, each `pieceDeg` long, none
 * starting past `untilDeg`.
 *
 * What a path is drawn in. Shorter pieces than their spacing are dashes; pieces
 * as long as their spacing are the contiguous steps a wake fades in. Measured in
 * degrees rather than in pixels because what the pieces are marking out is the
 * sky: a dash the length of a piece of sky stays on that piece of sky as the
 * phone turns, where one measured on the screen would slide along its line with
 * every change in how the projection stretches it.
 *
 * Every point the chain turns at inside a piece is kept in it, so a piece
 * follows the arc rather than cutting its corners — though at the four degrees
 * the arc is sampled at, those corners are under a degree on the frame. The
 * points a piece is cut at are directions rather than positions
 * (`directionBetween`), which is all a projection needs of them.
 *
 * `wanted` says which of the chain's segments are worth cutting at all, by
 * index: a piece lying wholly on unwanted segments is skipped before anything
 * is made for it. It is what keeps the cost of a path proportional to the part
 * of it anyone can see — a pass is up to a hundred and eighty degrees of sky and
 * a frame is sixty — rather than to its length in dashes.
 */
export function cutAlong(
  chain: readonly EnuPosition[],
  everyDeg: number,
  pieceDeg: number,
  untilDeg: number = Number.POSITIVE_INFINITY,
  wanted: (segment: number) => boolean = () => true
): ArcPiece[] {
  const pieces: ArcPiece[] = [];
  if (chain.length < 2 || !(everyDeg > 0) || !(pieceDeg > 0)) return pieces;

  let segment = 0;
  let segmentFromDeg = 0;
  let segmentDeg = separationDeg(chain[0], chain[1]);

  /** Moves on to the segment `deg` falls in; `false` once past the chain's end. */
  const reach = (deg: number): boolean => {
    while (segmentFromDeg + segmentDeg < deg) {
      if (segment + 2 >= chain.length) return false;
      segment += 1;
      segmentFromDeg += segmentDeg;
      segmentDeg = separationDeg(chain[segment], chain[segment + 1]);
    }
    return true;
  };
  const pointAt = (deg: number): EnuPosition =>
    directionBetween(
      chain[segment],
      chain[segment + 1],
      segmentDeg > 0 ? Math.min(1, (deg - segmentFromDeg) / segmentDeg) : 0
    );

  for (let fromDeg = 0; fromDeg < untilDeg; fromDeg += everyDeg) {
    if (!reach(fromDeg)) break;
    const firstSegment = segment;
    const start = pointAt(fromDeg);

    const toDeg = fromDeg + pieceDeg;
    const inside = reach(toDeg);
    // Past the end, the piece runs out on the chain's last point — unless it
    // starts there, which is a piece of no length, and stroked with round caps
    // a dot on the sky where the path ends.
    if (!inside && fromDeg >= segmentFromDeg + segmentDeg) break;
    const end = inside ? pointAt(toDeg) : chain[chain.length - 1];

    let seen = false;
    for (let index = firstSegment; index <= segment && !seen; index += 1) seen = wanted(index);
    if (seen) {
      const positions = [start];
      for (let corner = firstSegment + 1; corner <= segment; corner += 1) {
        positions.push(chain[corner]);
      }
      positions.push(end);
      pieces.push({ positions, fromDeg });
    }
    if (!inside) break;
  }

  return pieces;
}
