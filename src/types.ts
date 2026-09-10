import type { SatelliteCategory } from "./satellite/categories";
import type { SunlitState } from "./satellite/illumination";
import type { NakedEyeVerdict } from "./satellite/nakedEye";

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
  /**
   * Whether the sun is on it, which is whether there is anything to see.
   *
   * On the frame path rather than left to the card, because unlike every other
   * figure a tap reveals this one is *drawn*: a satellite in the Earth's shadow
   * is a mark for something nobody can see, and the overlay says so by drawing
   * it at half strength (`markerScene.ts`). It costs a dot product and a hypotenuse
   * against a shadow worked out once for the whole frame — far less than the
   * rotation that placed the marker. See `illumination.ts`.
   */
  sunlit: SunlitState;
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
  /**
   * Its catalogue number, which is the key its description is written against.
   *
   * Names are the wrong key for that for the reason `categories.ts` gives —
   * the catalogue calls Hubble `HST` and renames a crew ferry every mission —
   * so the objects worth describing individually are recognised by the one
   * identifier that outlives them. See `briefingFor`.
   */
  noradId: number;
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
  /** Whether the sun is on it, in the Earth's shadow, or part way between. */
  sunlit: SunlitState;
  /**
   * How bright it looks from here, as a visual magnitude — smaller is
   * brighter — or `null` for an object whose reflectivity nobody has recorded.
   *
   * `null` is a real answer and is carried as one all the way to the card,
   * which then says where the object is and whether it is lit and stops there.
   * See `standardMagnitude.ts` for why most of the catalogue gets it.
   */
  apparentMagnitude: number | null;
  /**
   * Whether that magnitude rests on somebody's observation or on the size and
   * class of the spacecraft. Decides how firmly the card is allowed to put it.
   */
  magnitudeMeasured: boolean;
  /** What all of that comes to for somebody standing outside looking up. */
  nakedEye: NakedEyeVerdict;
  /**
   * How high the sun is where the observer is standing, in degrees.
   *
   * The other half of the verdict, and the half that is about the sky rather
   * than the satellite: it is what makes the answer "not until this evening"
   * rather than "no". Carried so the card can say which of the two it is
   * without working the sun out a second time.
   */
  sunAltitudeDeg: number;
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
