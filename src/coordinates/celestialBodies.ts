import { Body, Equator, Horizon, Illumination, Observer } from "astronomy-engine";
import { ObserverLocation } from "../types";

/**
 * Where the sun and the moon are, from the clock and the GPS fix alone.
 *
 * This is the app's one piece of ground truth about direction. Everything else
 * that aims the view is a sensor with an error nobody can see: the magnetometer
 * can be captured by a magnet and report a plausible field that is thirty
 * degrees wrong, and there is nothing on the phone to check it against. The sky
 * is not like that. Where the sun is at a given instant, seen from a given
 * place, is known to an arcminute and has been for two centuries, and it is in
 * the picture. `src/fusion/celestialNorth.ts` is what turns that into a bearing.
 *
 * The arithmetic is Astronomy Engine's (MIT, github.com/cosinekitty/astronomy),
 * not ours, and deliberately so. It is built on VSOP87 and NOVAS C 3.1 and
 * holds to about an arcminute; the short series in `sunAltitude.ts` is a tenth
 * of a degree at best and has no moon in it at all. More to the point, three of
 * the corrections that separate the two are exactly the ones that matter when a
 * position is compared against a photograph of the thing itself:
 *
 * - **Parallax.** The moon is close enough that where on Earth you stand moves
 *   it by up to a degree — twice its own width. A geocentric moon compared
 *   against a moon in a camera frame is a bearing error as large as some of the
 *   compass errors this exists to find.
 * - **Refraction.** The atmosphere lifts a body near the horizon by up to a
 *   little over half a degree. The camera sees the lifted one, so the ephemeris
 *   has to be lifted too, or the elevation gate rejects good sightings low down
 *   and accepts nothing in their place.
 * - **Aberration and precession**, which are small here but free.
 *
 * Only elevation is refracted, never azimuth, which is why the bearing this
 * feeds is unaffected by it and the elevation check is not.
 */

/** The two bodies bright enough to be found in a phone camera frame. */
export type CelestialBodyName = "sun" | "moon";

/** Where a body appears to be, to an observer who is looking at it. */
export type CelestialPosition = {
  body: CelestialBodyName;
  /** Apparent bearing of the body, clockwise from true north, in `[0, 360)`. */
  azimuthDeg: number;
  /** Apparent elevation above the horizon, refraction included, in degrees. */
  altitudeDeg: number;
  /** Half the disc's apparent width, in degrees. About a quarter for both. */
  angularRadiusDeg: number;
  /**
   * Fraction of the disc lit, from 0 to 1. Always 1 for the sun.
   *
   * The moon's is here because a crescent is not centred on the moon: the lit
   * part's centroid — which is all a camera can find — sits towards the sun,
   * by up to a quarter of a degree at the thinnest. That is far inside the
   * errors this is used against and so is not corrected for, but it is the
   * reason a sighting's noise is never claimed to be better than a fraction of
   * a degree however sharp the blob was.
   */
  illuminatedFraction: number;
};

/** Astronomical unit, in kilometres: what `dist` on an equatorial fix is in. */
const KM_PER_AU = 149_597_870.7;

/** Mean radii, in kilometres, for the apparent size of the disc. */
const BODY_RADIUS_KM: Record<CelestialBodyName, number> = {
  sun: 695_700,
  moon: 1737.4
};

const BODY: Record<CelestialBodyName, Body> = {
  sun: Body.Sun,
  moon: Body.Moon
};

/**
 * Where `body` appears from `observer` at `when`.
 *
 * Topocentric and apparent throughout — the position of the thing you would
 * photograph, not the one in a table of geocentric coordinates. `Equator` is
 * asked for coordinates of date, corrected for the observer's own place on the
 * Earth and for aberration; `Horizon` then applies the standard refraction
 * model. Both flags matter and neither is a default.
 */
export function celestialPosition(
  body: CelestialBodyName,
  observer: ObserverLocation,
  when: Date
): CelestialPosition {
  const site = new Observer(observer.latitudeDeg, observer.longitudeDeg, observer.heightM);
  const equatorial = Equator(BODY[body], when, site, true, true);
  const horizontal = Horizon(when, site, equatorial.ra, equatorial.dec, "normal");

  return {
    body,
    azimuthDeg: horizontal.azimuth,
    altitudeDeg: horizontal.altitude,
    angularRadiusDeg: angularRadiusDeg(body, equatorial.dist),
    illuminatedFraction: body === "sun" ? 1 : Illumination(BODY[body], when).phase_fraction
  };
}

/** Half the apparent width of `body` seen from `distanceAu`, in degrees. */
function angularRadiusDeg(body: CelestialBodyName, distanceAu: number): number {
  const radiusAu = BODY_RADIUS_KM[body] / KM_PER_AU;
  return (Math.asin(Math.min(1, radiusAu / distanceAu)) * 180) / Math.PI;
}
