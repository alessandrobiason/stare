import { EARTH_SHADOW } from "../constants";
import { sunEciKm } from "../coordinates/sunAltitude";
import { clamp, toDegrees } from "../math/angles";
import { EciPosition, EnuPosition } from "../types";

/**
 * Whether a satellite is in sunlight, and how bright that leaves it.
 *
 * The overlay's four channels all answer questions about *where* an object is —
 * what it is for, how far away, which way it is going, what it is called. None
 * of them answers the question anyone actually walks outside with, which is
 * whether the thing can be seen at all. A satellite is not a light: it is a
 * few square metres of foil and solar cell reflecting the sun, and it is
 * visible for exactly as long as three things hold at once —
 *
 * 1. **The satellite is in sunlight.** Half of every orbit is spent inside the
 *    Earth's shadow, where there is nothing to reflect. This module.
 * 2. **The observer is not.** A sunlit satellite against a sunlit sky is a
 *    fifth-magnitude object against a background some thousands of times
 *    brighter, which is why nobody has ever seen the station at noon. The sun's
 *    altitude answers that, and `sunAltitudeDeg` already computes it for the
 *    palette.
 * 3. **What it reflects reaches the eye.** A magnitude, from how far away it
 *    is and how much of its lit side is turned this way.
 *
 * The first is the one worth having whatever else is unknown, because it is
 * *geometry*: given where the satellite is and where the sun is, whether the
 * Earth is between them is not an estimate. It holds for all sixteen thousand
 * objects equally, needs nothing known about any of them, and it is what
 * separates a night sky full of marks from a night sky full of marks half of
 * which are unlit metal. The third needs to know how reflective the object is,
 * which is recorded for a few dozen of them and guessed at for the rest — see
 * `standardMagnitude.ts`, which is careful about the difference.
 *
 * Nothing here knows about frames, markers or cameras. It is two pieces of
 * solid geometry and a photometric formula, in the inertial frame SGP4 already
 * delivers.
 */

/** How much of the sun a satellite can see, and so whether it is lit. */
export type SunlitState =
  /** Full sun: nothing of the Earth is in the way. */
  | "sunlit"
  /** Partial: the Earth covers some of the disc, and the object is dimming. */
  | "penumbra"
  /** The Earth covers the whole disc. Nothing to reflect, and nothing to see. */
  | "eclipsed";

export type Illumination = {
  state: SunlitState;
  /**
   * The share of the sun's disc still reaching the satellite, in `[0, 1]`.
   *
   * One in full sun, zero in the umbra, and between the two across the
   * penumbra — where it is interpolated on the *radius* of the shadow rather
   * than worked out as the overlapping area of two discs. The approximation
   * costs at most a few tenths of a magnitude, and it is spent on the one part
   * of an orbit an object is passing through in under a minute on its way to
   * being invisible anyway.
   */
  litFraction: number;
};

/**
 * The Earth's shadow at one instant: where it points, and how it narrows.
 *
 * Precomputed per tick and handed to every satellite, exactly as
 * `ObserverFrame` is — the sun moves a fortieth of a degree an hour and the
 * catalogue is walked several hundred times a frame, so working this out per
 * object would be the same three trigonometric series repeated for nothing.
 */
export type ShadowFrame = {
  /** Unit vector from the Earth's centre towards the sun. */
  towardsSun: EciPosition;
  /** How far away the sun is, in kilometres. */
  distanceKm: number;
  /**
   * How fast the umbra closes, as the tangent of its half-angle.
   *
   * The umbra is the cone *behind* the Earth in which the sun's disc is
   * completely hidden. Because the sun is the larger body, that cone converges:
   * it is about 1.4 million kilometres long, well past the Moon, so everything
   * in this catalogue sits in the wide part of it.
   */
  umbraTangent: number;
  /**
   * How fast the penumbra opens, as the tangent of its half-angle.
   *
   * The penumbra is the surrounding cone in which the Earth covers part of the
   * disc but not all of it, and it diverges from the moment it leaves the
   * Earth. The two cones together are why a satellite fades into shadow over
   * several seconds rather than switching off.
   */
  penumbraTangent: number;
};

/** Mean radius of the sun, in kilometres. */
const SUN_RADIUS_KM = 695_700;

/**
 * The radius the Earth casts its shadow with, in kilometres.
 *
 * The equatorial radius rather than the mean, and then the atmosphere on top of
 * it. Both choices make the shadow slightly larger than the solid body, and
 * both are deliberate: the equatorial radius is the widest silhouette the Earth
 * can present, and `atmosphereKm` stands in for the fact that sunlight grazing
 * the first tens of kilometres of air is scattered and absorbed rather than
 * arriving to be reflected. See `EARTH_SHADOW`.
 */
const SHADOW_RADIUS_KM = 6378.137 + EARTH_SHADOW.atmosphereKm;

/** The Earth's shadow at `when`, ready to be asked about a satellite. */
export function createShadowFrame(when: Date): ShadowFrame {
  return shadowFrameFor(sunEciKm(when));
}

/**
 * The same, from a sun position already in hand.
 *
 * Exported for the tests, which need to put the sun somewhere chosen rather
 * than somewhere the calendar decides.
 */
export function shadowFrameFor(sun: EciPosition): ShadowFrame {
  const distanceKm = Math.hypot(sun.x, sun.y, sun.z);
  const towardsSun =
    distanceKm === 0
      ? { x: 0, y: 0, z: 0 }
      : { x: sun.x / distanceKm, y: sun.y / distanceKm, z: sun.z / distanceKm };

  return {
    towardsSun,
    distanceKm,
    // Similar triangles on the two bodies' radii: the difference converges the
    // umbra, the sum opens the penumbra. `asin` and then `tan` rather than the
    // ratio directly, because what these describe is the half-angle of a cone.
    umbraTangent: coneTangent(SUN_RADIUS_KM - SHADOW_RADIUS_KM, distanceKm),
    penumbraTangent: coneTangent(SUN_RADIUS_KM + SHADOW_RADIUS_KM, distanceKm)
  };
}

/**
 * Whether the Earth is between `position` and the sun.
 *
 * Two numbers decide it. How far the satellite lies *along* the shadow's axis
 * says whether it is on the night side at all — nothing on the sunward side of
 * the Earth can be in its shadow, whatever else is true — and how far it lies
 * *across* that axis is then compared against the two cones at that distance.
 *
 * Cheap by construction: a dot product, a subtraction and a hypotenuse. The
 * frame loop runs this for every candidate on every frame and it does not show
 * up next to the rotation that placed the marker.
 */
export function illuminationIn(position: EciPosition, shadow: ShadowFrame): Illumination {
  const { towardsSun } = shadow;
  const alongSun =
    position.x * towardsSun.x + position.y * towardsSun.y + position.z * towardsSun.z;
  if (alongSun >= 0) return FULL_SUN;

  // How far behind the Earth's centre, and how far off the axis joining it to
  // the sun. The cones are measured from the terminator plane, which is what
  // the Earth's own radius is already accounted for at.
  const behindKm = -alongSun;
  const acrossKm = Math.hypot(
    position.x - alongSun * towardsSun.x,
    position.y - alongSun * towardsSun.y,
    position.z - alongSun * towardsSun.z
  );

  const umbraKm = SHADOW_RADIUS_KM - behindKm * shadow.umbraTangent;
  if (acrossKm <= umbraKm) return FULL_SHADOW;

  const penumbraKm = SHADOW_RADIUS_KM + behindKm * shadow.penumbraTangent;
  if (acrossKm >= penumbraKm) return FULL_SUN;

  // Across the penumbra, from nothing at the umbra's edge to all of it at the
  // outside. Linear in radius: see `Illumination.litFraction`.
  return {
    state: "penumbra",
    litFraction: clamp((acrossKm - umbraKm) / (penumbraKm - umbraKm), 0, 1)
  };
}

/**
 * The angle at the satellite between the sun and the observer, in degrees.
 *
 * What decides how much of the lit side is turned this way — the same thing
 * that makes a crescent moon fainter than a full one, and for the same reason.
 * Zero is the satellite fully lit as seen from here, with the sun directly
 * behind the observer; 180 is its unlit side, backlit and nearly gone.
 *
 * Both vectors are taken in the observer's own local frame rather than the
 * inertial one, which is what lets the sun be compared against a satellite
 * without either being converted twice: the observer sits at the origin there,
 * so the direction from the satellite back to the observer is simply the
 * negative of its own position. Any consistent frame gives the same angle.
 */
export function phaseAngleDeg(satellite: EnuPosition, sun: EnuPosition): number {
  const toSun = {
    east: sun.east - satellite.east,
    north: sun.north - satellite.north,
    up: sun.up - satellite.up
  };
  // The observer is the origin, so this is the way back to them.
  const toObserver = { east: -satellite.east, north: -satellite.north, up: -satellite.up };

  const sunLength = Math.hypot(toSun.east, toSun.north, toSun.up);
  const observerLength = Math.hypot(toObserver.east, toObserver.north, toObserver.up);
  if (sunLength === 0 || observerLength === 0) return 0;

  const cosine =
    (toSun.east * toObserver.east +
      toSun.north * toObserver.north +
      toSun.up * toObserver.up) /
    (sunLength * observerLength);

  return toDegrees(Math.acos(clamp(cosine, -1, 1)));
}

/**
 * How bright a satellite looks, as a visual magnitude.
 *
 * The standard formula for artificial satellites, in the form the observing
 * catalogues record their figures against: a *standard magnitude* is what the
 * object would show at a thousand kilometres with half its disc lit, and
 * everything else is the two corrections away from that reference — the inverse
 * square of the range, and the share of the lit side actually facing this way.
 *
 * The reference term is not a fudge factor and is not typed in: it is what the
 * range and phase corrections themselves come to at the reference, so the
 * formula returns the standard magnitude unchanged when handed the conditions
 * the standard magnitude was quoted at. `MAGNITUDE_AT_REFERENCE` is that
 * arithmetic rather than the 15.75 it rounds to.
 *
 * Magnitudes run backwards and logarithmically, which is worth stating where
 * the figures are read: smaller is brighter, five steps is a hundredfold, and
 * the naked eye reaches about 6 under a dark sky and about 4 under a city.
 */
export function apparentMagnitude(
  standardMagnitude: number,
  rangeKm: number,
  phaseDeg: number,
  litFraction = 1
): number {
  // The fraction of the disc turned this way, which is the phase-angle law a
  // sphere follows and near enough for a bus-sized object tumbling in the sun.
  const facing = (1 + Math.cos((phaseDeg * Math.PI) / 180)) / 2;
  const lit = facing * litFraction;
  if (!(lit > 0) || !(rangeKm > 0)) return Number.POSITIVE_INFINITY;

  return (
    standardMagnitude -
    MAGNITUDE_AT_REFERENCE +
    2.5 * Math.log10((rangeKm * rangeKm) / lit)
  );
}

/** Range a standard magnitude is quoted at, in kilometres. */
const REFERENCE_RANGE_KM = 1000;
/** And the share of the lit side facing the observer there: half of it. */
const REFERENCE_LIT_FRACTION = 0.5;
/** What the two corrections come to at that reference — about 15.75. */
const MAGNITUDE_AT_REFERENCE =
  2.5 * Math.log10((REFERENCE_RANGE_KM * REFERENCE_RANGE_KM) / REFERENCE_LIT_FRACTION);

const FULL_SUN: Illumination = { state: "sunlit", litFraction: 1 };
const FULL_SHADOW: Illumination = { state: "eclipsed", litFraction: 0 };

/** Tangent of the half-angle of a cone subtending `radiusKm` at `distanceKm`. */
function coneTangent(radiusKm: number, distanceKm: number): number {
  if (!(distanceKm > 0)) return 0;
  return Math.tan(Math.asin(clamp(radiusKm / distanceKm, -1, 1)));
}
