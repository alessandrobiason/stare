import { LANDMARK_PATHS, MINIMUM_SATELLITE_ELEVATION_DEG } from "../constants";
import {
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt,
  ObserverFrame
} from "../coordinates/transform";
import { clamp, toDegrees } from "../math/angles";
import { Slices } from "../timeSlice";
import { EnuPosition, ObserverLocation } from "../types";
import { CatalogEntry, SatelliteCatalog } from "./catalog";
import { SatelliteCategory } from "./categories";
import { propagateAt, SatRec } from "./propagator";

/**
 * Where a landmark will cross the sky, between now and a few hours from now.
 *
 * The overlay's other three answers about an object are all about the instant
 * it is drawn at: a mark for where it is, a size for how far away, a tail for
 * the twelve seconds behind it. That is the right amount to say about sixteen
 * thousand satellites and much too little to say about the dozen worth going
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
  /** The arc, ordered in time. Never fewer than two points. */
  samples: SkySample[];
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
 * is drawn is the sky ahead, and the ground the object has already covered is
 * the marker's own tail.
 */
export function passesFor(
  entry: CatalogEntry,
  fromMs: number,
  observer: ObserverLocation
): SkyPass[] {
  const frame = createObserverFrame(observer);
  const untilMs = fromMs + LANDMARK_PATHS.windowHours * MS_PER_HOUR;
  const searchMs = LANDMARK_PATHS.searchStepSeconds * 1000;
  const passes: SkyPass[] = [];

  let atMs = fromMs;
  /** The last time known to be below the floor, for refining the rise. */
  let belowMs: number | null = null;

  while (atMs < untilMs) {
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
      samples: walk.samples,
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
 * Which of the passes found are actually drawn.
 *
 * Two rules, in this order. A crew ferry docked to a station is the station's
 * own arc under another name, so of two passes over the same piece of sky at
 * the same minute only the older catalogue number survives. What is left is
 * then taken breadth first — every landmark's next pass before any landmark's
 * second — so the allowance is spent on as many different objects as there are
 * rather than on the one that comes round most often.
 */
function drawable(passes: SkyPass[]): SkyPass[] {
  const kept: SkyPass[] = [];
  for (const pass of [...passes].sort((one, other) => one.startsAtMs - other.startsAtMs)) {
    const twin = kept.findIndex((other) => sameArc(other, pass));
    if (twin < 0) kept.push(pass);
    else if (pass.noradId < kept[twin].noradId) kept[twin] = pass;
  }

  const seen = new Map<number, number>();
  return kept
    .map((pass) => {
      const round = seen.get(pass.noradId) ?? 0;
      seen.set(pass.noradId, round + 1);
      return { pass, round };
    })
    .sort((one, other) => one.round - other.round || one.pass.startsAtMs - other.pass.startsAtMs)
    .slice(0, LANDMARK_PATHS.maximumPaths)
    .map((entry) => entry.pass);
}

/**
 * The paths to draw over the next few hours, for the whole landmark tier.
 *
 * Sliced, because this is the one piece of satellite arithmetic in the app that
 * is neither per frame nor spread across frames: a few thousand propagations in
 * one go is tens of milliseconds, which is several dropped frames of an overlay
 * that is drawing sixty times a second. Handing the thread back between objects
 * costs the plan a little wall-clock time and costs the sky nothing — and there
 * is no deadline on it, because the plan it replaces goes on being drawn until
 * this one lands. See `src/timeSlice.ts`.
 */
export async function planSkyPaths(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: Slices
): Promise<SkyPass[]> {
  const found: SkyPass[] = [];
  for (const entry of catalog.entries) {
    if (entry.category !== "LANDMARK") continue;
    found.push(...passesFor(entry, fromMs, observer));
    if (slices.spent()) await slices.handOver();
  }
  return drawable(found);
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
