import * as satellite from "satellite.js";
import { toDegrees, toRadians } from "../math/angles";
import { EciPosition, EcefPosition, EnuPosition, ObserverLocation } from "../types";

/**
 * ECI -> ECEF -> local ENU conversions.
 *
 * Units: ECI and ECEF are kilometres (as `satellite.js` returns them); ENU is
 * metres.
 *
 * The catalog is converted a satellite at a time but the two expensive inputs —
 * Greenwich sidereal time and the observer's own ECEF position — depend only on
 * the timestamp and the observer. `ObserverFrame` and `gmstAt` let a caller
 * compute each once per tick instead of once per satellite.
 */

const METERS_PER_KM = 1000;

export type ObserverFrame = {
  ecef: EcefPosition;
  sinLat: number;
  cosLat: number;
  sinLon: number;
  cosLon: number;
};

export function gmstAt(date: Date): number {
  return satellite.gstime(date);
}

/** Precomputes the observer's ECEF position and ENU rotation terms. */
export function createObserverFrame(observer: ObserverLocation): ObserverFrame {
  const latitude = toRadians(observer.latitudeDeg);
  const longitude = toRadians(observer.longitudeDeg);
  const ecef = satellite.geodeticToEcf({
    latitude,
    longitude,
    height: observer.heightM / METERS_PER_KM
  });

  return {
    ecef: { x: ecef.x, y: ecef.y, z: ecef.z },
    sinLat: Math.sin(latitude),
    cosLat: Math.cos(latitude),
    sinLon: Math.sin(longitude),
    cosLon: Math.cos(longitude)
  };
}

export function eciToEcef(eci: EciPosition, gmst: number): EcefPosition {
  const ecef = satellite.eciToEcf(eci, gmst);
  return { x: ecef.x, y: ecef.y, z: ecef.z };
}

/** Rotates an ECEF position (km) into the observer's ENU frame (metres). */
export function ecefToEnuInFrame(ecef: EcefPosition, frame: ObserverFrame): EnuPosition {
  const dx = (ecef.x - frame.ecef.x) * METERS_PER_KM;
  const dy = (ecef.y - frame.ecef.y) * METERS_PER_KM;
  const dz = (ecef.z - frame.ecef.z) * METERS_PER_KM;
  const { sinLat, cosLat, sinLon, cosLon } = frame;

  return {
    east: -sinLon * dx + cosLon * dy,
    north: -cosLon * sinLat * dx - sinLat * sinLon * dy + cosLat * dz,
    up: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz
  };
}

export function ecefToEnu(ecef: EcefPosition, observer: ObserverLocation): EnuPosition {
  return ecefToEnuInFrame(ecef, createObserverFrame(observer));
}

/** Hot-path conversion: pass a `gmst` and `frame` computed once per tick. */
export function eciToEnuInFrame(eci: EciPosition, gmst: number, frame: ObserverFrame): EnuPosition {
  return ecefToEnuInFrame(eciToEcef(eci, gmst), frame);
}

/** Convenience conversion for one-off calls; recomputes both per-tick inputs. */
export function eciToEnu(eci: EciPosition, date: Date, observer: ObserverLocation): EnuPosition {
  return eciToEnuInFrame(eci, gmstAt(date), createObserverFrame(observer));
}

/** Elevation above the local horizon, in degrees. Negative is below. */
export function elevationDeg(position: EnuPosition): number {
  return toDegrees(Math.atan2(position.up, Math.hypot(position.east, position.north)));
}

/** Azimuth clockwise from true north, in degrees. */
export function azimuthDeg(position: EnuPosition): number {
  return toDegrees(Math.atan2(position.east, position.north));
}

export function isAboveHorizon(position: EnuPosition, minimumElevationDeg = 0): boolean {
  return elevationDeg(position) > minimumElevationDeg;
}
