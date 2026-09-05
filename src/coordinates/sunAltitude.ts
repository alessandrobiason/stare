import { clamp, toDegrees, toRadians } from "../math/angles";
import { ObserverLocation } from "../types";
import { gmstAt } from "./transform";

/**
 * Where the sun is, which is the app's answer to "is it day or night here".
 *
 * Only the altitude, and only to about a hundredth of a degree: this is the
 * low-precision solar position from the Astronomical Almanac, which holds to
 * roughly 0.01 degrees over 1950-2050 and costs a handful of trigonometric
 * calls. That is far more than the palette needs — it switches over a band two
 * degrees wide (`palette.ts`) — and the same figure is worth having exactly
 * rather than approximately, because "is the sky bright" is asked once a minute
 * for the whole session and a clock that drifts by an hour would answer it
 * wrongly for an hour.
 *
 * Nothing here is a substitute for the satellite pipeline's own geometry. The
 * sun is not in the catalog, is not projected onto the frame and never appears
 * as a marker; the sidereal time it shares with the satellites (`gmstAt`) is
 * the only thing the two have in common.
 */

/** J2000.0: 2000 January 1, 12:00 UT, the epoch the series below is built on. */
const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86_400_000;

/**
 * The sun's altitude above the observer's horizon, in degrees.
 *
 * Geometric: no refraction and no allowance for the disc's radius, so the
 * moment this crosses zero is about four minutes before the sunset in a
 * newspaper, which quotes the upper limb lifted 0.833 degrees by the
 * atmosphere. That difference does not matter to anything here — the palette's
 * band is centred three degrees below the horizon — and leaving it out keeps
 * this a statement about geometry rather than about the weather.
 */
export function sunAltitudeDeg(observer: ObserverLocation, when: Date): number {
  const days = (when.getTime() - J2000_EPOCH_MS) / MS_PER_DAY;

  // The sun along the ecliptic: its mean position, then the correction for the
  // Earth's orbit being an ellipse rather than a circle.
  const meanLongitude = toRadians(280.46 + 0.9856474 * days);
  const meanAnomaly = toRadians(357.528 + 0.9856003 * days);
  const eclipticLongitude =
    meanLongitude +
    toRadians(1.915) * Math.sin(meanAnomaly) +
    toRadians(0.02) * Math.sin(2 * meanAnomaly);

  // Tilted into the equatorial frame the observer's own horizon is measured in.
  const obliquity = toRadians(23.439 - 0.0000004 * days);
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude)
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  // How far the Earth has turned the observer past the sun, and what that
  // leaves of it above the horizon.
  const hourAngle = gmstAt(when) + toRadians(observer.longitudeDeg) - rightAscension;
  const latitude = toRadians(observer.latitudeDeg);
  const sine =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  return toDegrees(Math.asin(clamp(sine, -1, 1)));
}
