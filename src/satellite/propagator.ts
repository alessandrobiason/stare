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

/**
 * Propagates to `when`, or returns `null` when SGP4 cannot produce a state
 * (decayed object, epoch too far away, malformed elements). Callers routinely
 * run whole catalogs, where a handful of bad records is normal, so failure is
 * a return value rather than an exception.
 *
 * The velocity comes back with the position because it costs nothing extra —
 * SGP4 computes both — and it is what lets a caller carry the state forward
 * between propagations instead of re-running SGP4 for every frame.
 */
export function propagateStateAt(satrec: SatRec, when: Date): EciState | null {
  const { position, velocity } = satellite.propagate(satrec, when);

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
