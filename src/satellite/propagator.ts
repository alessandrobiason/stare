import * as satellite from "satellite.js";
import { EciPosition, EciState, Tle } from "../types";

/**
 * Thin, typed wrapper around `satellite.js` SGP4.
 *
 * Coordinate frame: ECI (TEME) in kilometres, exactly as `satellite.js`
 * returns it. Converting to ECEF/ENU is the coordinates module's job.
 */

export type SatRec = satellite.SatRec;

/**
 * Builds an SGP4 record from a TLE. This is the expensive half of propagation
 * (roughly 2x a single `propagateAt` call), so records are built once and
 * reused — see `SatelliteCatalog`.
 */
export function parseTle(tle: Pick<Tle, "line1" | "line2">): SatRec {
  return satellite.twoline2satrec(tle.line1, tle.line2);
}

/**
 * Whether SGP4 initialisation actually succeeded. `twoline2satrec` reports
 * malformed input by leaving the orbital elements as NaN with `error` still 0,
 * so the elements themselves have to be checked.
 */
export function isUsableSatrec(satrec: SatRec): boolean {
  return satrec.error === 0 && Number.isFinite(satrec.no) && Number.isFinite(satrec.inclo);
}

/** Minutes in a day, which is what SGP4 measures its time argument in. */
const MINUTES_PER_DAY = 1440;

/**
 * `jday`, which the library exports but does not declare.
 *
 * Its own conversion rather than one written here: the Julian date is the
 * argument SGP4 is calibrated against, and a second implementation of it that
 * agreed to nine decimal places instead of exactly would be a discrepancy
 * nobody would find. Present in both the CommonJS and the ES builds; only the
 * `.d.ts` has forgotten it.
 */
const julianDayOf = (satellite as unknown as { jday: (when: Date) => number }).jday;

/**
 * One instant, in the form SGP4 wants it.
 *
 * `satellite.propagate` takes a `Date` and converts it per call: seven
 * `getUTC*` reads and three arrays of its own, before any orbital arithmetic
 * happens. A whole catalog is propagated to *one* instant — the rolling sweep
 * does a slice of sixteen thousand entries every frame — so that conversion was
 * being redone for every entry to produce the same number each time, along with
 * a `Date` allocated per entry to feed it.
 *
 * Converted once and handed to each propagation instead. It is the same two
 * lines `satellite.propagate` runs, with the same result to the bit — a whole
 * catalog agrees exactly — for about a quarter less time on the sweep.
 *
 * Carries the epoch milliseconds alongside the Julian date because callers
 * that propagate also tend to record *when* they did — `SkyTracker` stamps
 * every state it stores, and carries it forward from that stamp. Kept together
 * so the two cannot come apart: a stamp a few milliseconds off the propagation
 * it labels is an error nothing would report and every later frame would build
 * on.
 */
export type Instant = {
  /** What SGP4 measures its time argument against. */
  julianDate: number;
  /** The same moment as epoch milliseconds, for callers keeping a clock. */
  atMs: number;
};

/** The instant a run of propagations shares. See `Instant`. */
export function instantOf(when: Date): Instant {
  return { julianDate: julianDayOf(when), atMs: when.getTime() };
}

/**
 * Propagates to `when`, or returns `null` when SGP4 cannot produce a state
 * (decayed object, epoch too far away, malformed elements). Callers routinely
 * run whole catalogs, where a handful of bad records is normal, so failure is
 * a return value rather than an exception.
 *
 * The velocity comes back with the position because it costs nothing extra —
 * SGP4 computes both — and it is what lets a caller carry the state forward
 * between propagations instead of re-running SGP4 for every frame.
 *
 * A caller propagating many records to one instant converts it once and calls
 * `propagateStateIn` instead; this is that, for a caller with a single object
 * and a `Date` in hand.
 */
export function propagateStateAt(satrec: SatRec, when: Date): EciState | null {
  return propagateStateIn(satrec, instantOf(when));
}

/** `propagateStateAt`, against an instant already converted. See `Instant`. */
export function propagateStateIn(satrec: SatRec, instant: Instant): EciState | null {
  const { position, velocity } = satellite.sgp4(
    satrec,
    (instant.julianDate - satrec.jdsatepoch) * MINUTES_PER_DAY
  );

  // The published types declare `EciVec3 | boolean`, but SGP4 also returns
  // `undefined` for a decayed object and `{x: null, ...}` for a satrec built
  // from malformed elements. Both occur in CelesTrak's live active catalog, and
  // null coerces to 0 downstream — silently placing the satellite at the centre
  // of the Earth. Validate the components rather than trusting the union.
  if (!position || typeof position !== "object") return null;
  if (!velocity || typeof velocity !== "object") return null;
  const { x, y, z } = position;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (!Number.isFinite(velocity.x) || !Number.isFinite(velocity.y) || !Number.isFinite(velocity.z)) {
    return null;
  }

  return {
    position: { x, y, z },
    velocity: { x: velocity.x, y: velocity.y, z: velocity.z }
  };
}

/** Position-only variant, for callers with no use for the velocity. */
export function propagateAt(satrec: SatRec, when: Date): EciPosition | null {
  return propagateStateAt(satrec, when)?.position ?? null;
}

/** The same, against an instant already converted. See `Instant`. */
export function propagateIn(satrec: SatRec, instant: Instant): EciPosition | null {
  return propagateStateIn(satrec, instant)?.position ?? null;
}

/** Throwing variant, for call sites that treat a failure as a bug. */
export function propagate(satrec: SatRec, when: Date): EciPosition {
  const position = propagateAt(satrec, when);
  if (!position) throw new Error("Propagation failed: no position returned");
  return position;
}

/**
 * How long one orbit takes, in minutes, from the elements themselves.
 *
 * `no` is the mean motion SGP4 works in — radians per minute — so the period is
 * a division rather than anything propagated: it is a property of the orbit
 * rather than of where the object is now. A geostationary satellite comes out
 * at a sidereal day, which is what makes it hold station.
 */
export function orbitPeriodMinutes(satrec: SatRec): number {
  return (2 * Math.PI) / satrec.no;
}

/**
 * How high the low point of the orbit is, in kilometres above the equator's
 * radius, from the elements themselves.
 *
 * The semi-major axis from the mean motion by Kepler's third law, then the
 * eccentricity. Not what SGP4 would place the object at on any given pass —
 * the Earth is not a sphere and the orbit is not fixed — but within a few
 * kilometres of it, which is all a bound on how close the object can come is
 * asked to be. See `nakedEyeCandidates`.
 */
export function perigeeAltitudeKm(satrec: SatRec): number {
  const radiansPerSecond = satrec.no / 60;
  const semiMajorAxisKm = Math.cbrt(MU_KM3_S2 / (radiansPerSecond * radiansPerSecond));
  return semiMajorAxisKm * (1 - satrec.ecco) - EQUATORIAL_RADIUS_KM;
}

/** The Earth's gravitational parameter, in km³/s². */
const MU_KM3_S2 = 398600.4418;
const EQUATORIAL_RADIUS_KM = 6378.137;
