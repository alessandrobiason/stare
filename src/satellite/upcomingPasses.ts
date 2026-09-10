import { sunAltitudeDeg, sunEciKm } from "../coordinates/sunAltitude";
import {
  azimuthDeg,
  createObserverFrame,
  eciToEnuInFrame,
  gmstAt,
  ObserverFrame,
  rangeKm
} from "../coordinates/transform";
import { wrapDegrees360 } from "../math/angles";
import { ObserverLocation } from "../types";
import { CatalogEntry, SatelliteCatalog } from "./catalog";
import { SatelliteCategory } from "./categories";
import {
  apparentMagnitude,
  createShadowFrame,
  illuminationIn,
  phaseAngleDeg
} from "./illumination";
import { NakedEyeVerdict, nakedEyeVerdict } from "./nakedEye";
import { SkyPass } from "./orbitPath";
import { propagateAt } from "./propagator";
import { standardMagnitudeFor } from "./standardMagnitude";

/**
 * The landmarks' next passes, as a list rather than as lines on the sky.
 *
 * The paths answer "where do I point this" for someone already holding the
 * phone up, and they answer it in the one place the answer belongs: on the sky
 * itself. What they cannot answer is the question asked before the phone goes
 * up at all — *is anything coming, and how long have I got* — because a line
 * that has not entered the frame yet is a line nobody has seen. Most of the
 * time that is every line there is: the arcs are three hours of sky and the
 * camera holds sixty degrees of it.
 *
 * So this is the same plan read the other way round. Nothing here is planned,
 * searched or propagated over: `planSkyPaths` has already decided which passes
 * are worth drawing, and this takes those and works out what to *say* about
 * each — when it comes up, where to stand, how high it gets, and whether it can
 * be seen when it does.
 *
 * That last one is the reason the module exists rather than the panel reading
 * `SkyPass` directly. A countdown is a promise. Told "ISS, 14 min" and sent
 * outside, somebody who finds an empty sky has been given a worse answer than
 * no answer, and for most of the day that is the answer the geometry alone
 * would give: the arc is real, the object is really on it, and the sun is up.
 * Whether a pass is a sighting is decided here, at the pass's own instant,
 * with the same arithmetic the card uses for the object under the finger
 * (`SkyTracker.describe`).
 */

/** One upcoming pass, and everything the panel says about it. */
export type UpcomingPass = {
  /** The name the overlay calls it, which is the key its card is opened by. */
  name: string;
  noradId: number;
  category: SatelliteCategory;
  /** When it clears the elevation floor — the present, for a pass under way. */
  startsAtMs: number;
  endsAtMs: number;
  /** When it is highest, which is what the verdict below is decided at. */
  peakAtMs: number;
  /** How high it gets, in degrees. Ten is a rooftop; sixty is overhead. */
  peakElevationDeg: number;
  /** Where it comes up, in degrees clockwise from north: where to stand. */
  riseAzimuthDeg: number;
  /** And where it goes down, for a pass someone wants to follow. */
  setAzimuthDeg: number;
  /** Whether it is already up, in which case there is nothing to wait for. */
  started: boolean;
  /** What could be seen of it at its highest. See the note above. */
  nakedEye: NakedEyeVerdict;
  /** How bright it looks then, or `null` for a reflectivity nobody recorded. */
  apparentMagnitude: number | null;
  /** Whether that figure is an observation or an estimate. See `seeing`. */
  magnitudeMeasured: boolean;
};

/**
 * What to say about the passes that have been planned, soonest first.
 *
 * The same set the sky is drawing and no other — every row is a line someone
 * can go and find, and tapping one opens the card its mark would have. A list
 * that reached further than the lines would be offering passes with nothing on
 * the frame to connect them to, and `maximumPaths` is a limit on legibility
 * rather than on the plan: what it leaves out is a fifth arc crossing a view
 * that already has four, not a pass nobody was told about.
 *
 * Ordered by when it comes up rather than in the order the plan produced,
 * which is breadth first across the landmarks (`drawable`) — the right order
 * for spending four lines on four different objects, and the wrong one for a
 * list whose whole subject is what happens next.
 */
export function upcomingPasses(
  passes: readonly SkyPass[],
  catalog: SatelliteCatalog,
  observer: ObserverLocation
): UpcomingPass[] {
  if (passes.length === 0) return [];

  const landmarks = landmarkIndex(catalog);
  const frame = createObserverFrame(observer);

  return [...passes]
    .sort((one, other) => one.startsAtMs - other.startsAtMs)
    .map((pass) => describePass(pass, landmarks.get(pass.noradId), observer, frame))
    .filter((pass): pass is UpcomingPass => pass !== null);
}

/**
 * One pass, described.
 *
 * `null` for a pass whose object is no longer in the catalog, which is the
 * catalog being reloaded underneath a plan made against the last one — the
 * same window the card's "left the catalog" line covers, and here there is
 * nothing to say about it at all rather than a row to say it in.
 */
function describePass(
  pass: SkyPass,
  entry: CatalogEntry | undefined,
  observer: ObserverLocation,
  frame: ObserverFrame
): UpcomingPass | null {
  if (!entry) return null;

  const rise = pass.samples[0].position;
  const set = pass.samples[pass.samples.length - 1].position;

  return {
    name: pass.name,
    noradId: pass.noradId,
    category: pass.category,
    startsAtMs: pass.startsAtMs,
    endsAtMs: pass.endsAtMs,
    peakAtMs: pass.peakAtMs,
    peakElevationDeg: pass.peakElevationDeg,
    // Wrapped, because these are read off a compass rather than signed: due
    // west is 270 degrees, not minus ninety. As `SkyTracker.describe`.
    riseAzimuthDeg: wrapDegrees360(azimuthDeg(rise)),
    setAzimuthDeg: wrapDegrees360(azimuthDeg(set)),
    started: pass.started,
    ...visibilityAt(entry, pass.peakAtMs, observer, frame)
  };
}

/** What a magnitude and a sun altitude come to, for one object at one instant. */
type Visibility = Pick<
  UpcomingPass,
  "nakedEye" | "apparentMagnitude" | "magnitudeMeasured"
>;

/**
 * Whether this object can be seen from here at `atMs`, decided the same way the
 * card decides it for the object under the finger.
 *
 * One propagation and one sun position per pass, at most four passes, once a
 * minute — the cost of the plan itself is a couple of thousand propagations, so
 * this is under a thousandth of what has already been spent by the time it
 * runs. It rides along on the plan's own background job for that reason
 * (`useOrbitPaths`) rather than being worked out per render.
 *
 * A propagation that fails is the honest "nobody has recorded this": SGP4
 * placed this object all the way along the arc a moment ago, so a failure here
 * is elements that expired between the plan and this line rather than a fact
 * about the sky, and a row that says nothing about brightness still says when
 * and where.
 */
function visibilityAt(
  entry: CatalogEntry,
  atMs: number,
  observer: ObserverLocation,
  frame: ObserverFrame
): Visibility {
  const when = new Date(atMs);
  const eci = propagateAt(entry.satrec, when);
  if (!eci) return { nakedEye: "unknown", apparentMagnitude: null, magnitudeMeasured: false };

  const gmst = gmstAt(when);
  const enu = eciToEnuInFrame(eci, gmst, frame);
  const illumination = illuminationIn(eci, createShadowFrame(when));
  const standard = standardMagnitudeFor(entry.noradId, entry.name);
  const magnitude =
    standard === null
      ? null
      : apparentMagnitude(
          standard.magnitude,
          rangeKm(enu),
          phaseAngleDeg(enu, eciToEnuInFrame(sunEciKm(when), gmst, frame)),
          illumination.litFraction
        );

  return {
    nakedEye: nakedEyeVerdict(illumination.state, magnitude, sunAltitudeDeg(observer, when)),
    apparentMagnitude: magnitude,
    magnitudeMeasured: standard?.measured ?? false
  };
}

/**
 * The landmark tier by catalogue number.
 *
 * Built per call rather than kept, because a call is once a minute and the
 * thing it walks is the whole catalog — sixteen thousand entries, of which the
 * couple of dozen that pass the category test are the only ones a plan can
 * name. The number rather than the name, for the reason `categories.ts` gives:
 * a ferry is renamed every mission and the catalogue number outlives it.
 */
function landmarkIndex(catalog: SatelliteCatalog): Map<number, CatalogEntry> {
  const landmarks = new Map<number, CatalogEntry>();
  for (const entry of catalog.entries) {
    if (entry.category !== "LANDMARK") continue;
    if (!landmarks.has(entry.noradId)) landmarks.set(entry.noradId, entry);
  }
  return landmarks;
}
