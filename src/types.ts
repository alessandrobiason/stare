import type { SatelliteCategory } from "./satellite/categories";

export type { SatelliteCategory };

export type Tle = {
  name: string;
  line1: string;
  line2: string;
  category: SatelliteCategory;
  /** Holds station over the equator, and so is drawn as a ring rather than a dot. */
  parked: boolean;
};

/** Earth-centred inertial (TEME) position, in kilometres. */
export type EciPosition = {
  x: number;
  y: number;
  z: number;
};

/** Earth-centred inertial (TEME) velocity, in kilometres per second. */
export type EciVelocity = {
  x: number;
  y: number;
  z: number;
};

/**
 * A satellite's inertial state at one instant, as SGP4 produces it.
 *
 * The velocity is what makes a state cheap to carry forward: over the fraction
 * of a second between propagations, `position + velocity * dt` is accurate to
 * a ten-thousandth of a degree, so markers can be placed every frame without
 * running SGP4 every frame.
 */
export type EciState = {
  position: EciPosition;
  velocity: EciVelocity;
};

/** Earth-centred, Earth-fixed position, in kilometres. */
export type EcefPosition = {
  x: number;
  y: number;
  z: number;
};

/** Local tangent-plane position relative to the observer, in metres. */
export type EnuPosition = {
  east: number;
  north: number;
  up: number;
};

export type ObserverLocation = {
  latitudeDeg: number;
  longitudeDeg: number;
  heightM: number;
};

/** A satellite resolved to the observer's local frame at a point in time. */
export type SatelliteFix = {
  name: string;
  category: SatelliteCategory;
  parked: boolean;
  position: EnuPosition;
  /**
   * Where the same object will be a few seconds later, in the same frame.
   *
   * Carried alongside the position because the marker's trail has to show how
   * fast the *orbit* is moving, and a difference taken between two drawn
   * frames would show the hand holding the phone instead. Two positions
   * resolved against one attitude cancel the camera out and leave the motion.
   */
  nextPosition: EnuPosition;
};

/**
 * Everything the overlay says about one satellite when it is tapped.
 *
 * Resolved on demand rather than carried on every marker of every frame
 * (`SkyTracker.describe`). The frame loop places a couple of hundred fixes
 * sixty times a second and needs a direction and a range to do it; these are
 * the figures a person reads at their own pace, for the one object they asked
 * about, and none of them would have earned a place in that loop.
 */
export type SatelliteDetail = {
  /** The catalog's name for it, which is what the marker is keyed by. */
  name: string;
  category: SatelliteCategory;
  /** Holds station over the equator, which is why its orbit takes a day. */
  parked: boolean;
  /** Distance from the observer to the satellite, in kilometres. */
  rangeKm: number;
  /** Height above the WGS-84 ellipsoid, in kilometres: how high it orbits. */
  altitudeKm: number;
  /** Inertial speed, in kilometres per second. */
  speedKmPerSecond: number;
  /** Where to look for it: compass bearing, in degrees clockwise from north. */
  azimuthDeg: number;
  /** And how far up, in degrees above the horizon. Negative once it has set. */
  elevationDeg: number;
  /** How long one orbit takes, in minutes. */
  orbitPeriodMinutes: number;
};

/**
 * Where and when to place satellites: the clock and the fix the markers are
 * projected against.
 *
 * On a phone this is now and here, rewritten per displayed frame
 * (`useLiveSky`); under the replay harness it is the recording's own clock and
 * GPS stream. The marker loop reads the same shape either way and cannot tell
 * the two apart.
 */
export type OrbitEpoch = {
  time: Date;
  observer: ObserverLocation;
};
