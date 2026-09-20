import { SKY_VISIBILITY } from "../constants";
import { sunAltitudeDeg } from "../coordinates/sunAltitude";
import { clamp } from "../math/angles";
import { ObserverLocation } from "../types";
import { SunlitState } from "./illumination";

/**
 * Whether a satellite can actually be seen, which is the question the overlay
 * was not answering.
 *
 * The app draws where sixteen thousand objects are. Almost none of them can be
 * seen at any given moment, and until this the picture said nothing about which
 * — a marker over a blue midday sky and a marker over the station on a clear
 * evening were drawn identically, and somebody who looked up and saw nothing
 * had every reason to conclude the app was wrong rather than that the sky was
 * empty. It was not wrong. It was answering a different question from the one
 * being asked of it.
 *
 * Four things decide it, and this module is where they meet:
 *
 * - **Is it simply too far away?** `rangeKm` against `SKY_VISIBILITY.tooFarKm`.
 *   The commonest answer of the four and the one the app used to bury: most of
 *   what a southward sky draws is parked at thirty-six thousand kilometres or
 *   circling at twenty, and no sky and no shadow changes what that costs.
 * - **Is the observer in the dark?** `sunAltitudeDeg`, which the palette
 *   already asks for. The single largest filter among the rest, and the one
 *   nobody expects: for most of the day the answer for every object overhead
 *   is no.
 * - **Is the satellite in the sun?** `illumination.ts`. Geometry, exact, and
 *   known for every object in the catalogue.
 * - **Is what it reflects enough?** A magnitude against the limit the sky
 *   allows, where the object's reflectivity is recorded at all
 *   (`standardMagnitude.ts`). Where it is not, this says so instead of guessing.
 *
 * The order matters, because the first three are facts and the last is the only
 * one carrying an estimate. An object in the Earth's shadow is not visible and
 * that needs no brightness at all; the sun being up rules out the whole sky
 * with nothing known about any of it. Brightness is consulted last, and only
 * when everything else has already said yes.
 *
 * Range comes first of all, ahead even of the sun, and that ordering is a
 * claim worth defending: it is the only one of the four that is a property of
 * the *object* rather than of the moment. "Not visible (daylight)" said of a
 * navigation satellite is true and is also an invitation to come back after
 * dark, which is a promise this app cannot keep — nobody has ever seen a GPS
 * satellite by eye, at any hour. Saying so plainly is both more useful and
 * more honest than saying the sun is in the way.
 */

/** How dark it is where the observer is standing. */
export type SkyDarkness =
  /** The sun is up, or barely down. Nothing in orbit can be picked out of it. */
  | "daylight"
  /** Down, but the sky is still draining. The bright objects are findable. */
  | "twilight"
  /** As dark as this sky gets. */
  | "dark";

/** What the app can tell somebody about seeing one particular object. */
export type NakedEyeVerdict =
  /**
   * So far away that no object in the catalogue could be seen from here,
   * whatever the sky and the sun are doing. See `SKY_VISIBILITY.tooFarKm`.
   */
  | "tooFar"
  /** The sun is up here. Whatever the object is doing, it cannot be seen. */
  | "daylight"
  /** The object is in the Earth's shadow, with nothing to reflect. */
  | "eclipsed"
  /** Lit, dark here, and bright enough to find by eye. */
  | "visible"
  /** Lit and dark here, but wanting binoculars. */
  | "binoculars"
  /** Lit and dark here, and still far too faint for anything but a telescope. */
  | "tooFaint"
  /** Lit and dark here, and nobody has recorded how reflective it is. */
  | "unknown";

/** How dark the sky is at a place and a moment. */
export function skyDarknessAt(observer: ObserverLocation, when: Date): SkyDarkness {
  return skyDarknessFor(sunAltitudeDeg(observer, when));
}

/** The same, from a sun altitude already in hand. */
export function skyDarknessFor(sunAltitudeDeg: number): SkyDarkness {
  if (sunAltitudeDeg > SKY_VISIBILITY.daylightAboveDeg) return "daylight";
  return sunAltitudeDeg > SKY_VISIBILITY.darkBelowDeg ? "twilight" : "dark";
}

/**
 * The faintest thing findable by eye under this sky, as a magnitude.
 *
 * `-Infinity` in daylight, which is the arithmetic saying that nothing however
 * bright clears the bar — a satellite is not the sun and there is no magnitude
 * at which one is visible against a lit sky. Below that, the limit walks from
 * the first-magnitude stars at the end of civil twilight down to whatever the
 * local sky gives up once it is properly dark. See `SKY_VISIBILITY`.
 */
export function nakedEyeLimit(sunAltitudeDeg: number): number {
  const { daylightAboveDeg, darkBelowDeg, nakedEyeMagnitude, twilightNakedEyeMagnitude } =
    SKY_VISIBILITY;
  if (sunAltitudeDeg > daylightAboveDeg) return Number.NEGATIVE_INFINITY;

  const through = clamp(
    (sunAltitudeDeg - daylightAboveDeg) / (darkBelowDeg - daylightAboveDeg),
    0,
    1
  );
  return (
    twilightNakedEyeMagnitude + (nakedEyeMagnitude - twilightNakedEyeMagnitude) * through
  );
}

/**
 * What to tell somebody about seeing this object, right now, from here.
 *
 * `magnitude` is `null` for an object whose reflectivity nobody has written
 * down, and that is carried through to `"unknown"` rather than resolved into a
 * yes or a no: the app knows where it is and knows it is in sunlight, and those
 * are worth saying on their own. `rangeKm` needs no such hedge — it is the one
 * figure here that is measured rather than estimated, which is the other half
 * of why it is asked first.
 */
export function nakedEyeVerdict(
  sunlit: SunlitState,
  magnitude: number | null,
  sunAltitudeDeg: number,
  rangeKm: number
): NakedEyeVerdict {
  // First, because it is the only one of these that is true of the object
  // rather than of the minute it is being asked about. See the note above.
  if (rangeKm > SKY_VISIBILITY.tooFarKm) return "tooFar";
  if (skyDarknessFor(sunAltitudeDeg) === "daylight") return "daylight";
  // The penumbra is the object on its way out, dimming by the second, and its
  // magnitude already carries how far through that it is — so it is judged on
  // brightness like anything else rather than called eclipsed early.
  if (sunlit === "eclipsed") return "eclipsed";
  if (magnitude === null) return "unknown";

  if (magnitude <= nakedEyeLimit(sunAltitudeDeg)) return "visible";
  return magnitude <= SKY_VISIBILITY.binocularMagnitude ? "binoculars" : "tooFaint";
}
