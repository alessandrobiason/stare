import * as satellite from "satellite.js";
import { GROUND_TRACK } from "../constants";
import { gmstAt } from "../coordinates/transform";
import { clamp, toDegrees } from "../math/angles";
import { CatalogEntry } from "./catalog";
import { orbitPeriodMinutes, propagateStateAt } from "./propagator";

/**
 * One orbit, as the path it draws across the ground.
 *
 * The rest of the app asks where a satellite is *from where you are standing*:
 * a bearing, an elevation and a range, which is what puts a mark on the camera
 * picture. That answers "where do I look" and answers nothing at all about what
 * the object is doing — and what it is doing is the question a person asks
 * second, once they know the thing overhead is a weather satellite or a
 * navigation beacon.
 *
 * A ground track is that answer in one picture. The sub-satellite point is
 * where the object is directly overhead; joined up over one orbit it is the
 * shape the thing traces on the Earth, and the three shapes worth recognising
 * fall straight out of it:
 *
 * - **A low orbit crosses the whole world.** Ninety minutes to go round, and
 *   the Earth turns twenty-two degrees under it while it does, so the track
 *   runs right around and comes back a little to the west of where it started.
 * - **A geostationary satellite does not move.** Its orbit takes exactly as
 *   long as a day, over the equator, so the sub-point stands still — which is
 *   the whole reason a dish can be bolted to a wall and left.
 * - **And in between, the figure of eight.** A day-long orbit that is *tilted*
 *   comes back to the same longitude but not the same latitude, so the track
 *   closes into a loop: the Japanese navigation satellites draw one over Japan
 *   on purpose, to keep a satellite high overhead a country the geostationary
 *   belt only ever sees at a slant.
 *
 * None of that needs precision. The track is drawn on a map the size of a
 * business card, where a degree is about a pixel, so this is SGP4 sampled at a
 * few hundred points and converted to geodetic coordinates — the same
 * propagation the sky view runs, asked a different question.
 */

/** Where the satellite is overhead, at one instant of the orbit. */
export type GroundSample = {
  /** When, in epoch milliseconds. */
  atMs: number;
  latitudeDeg: number;
  /**
   * Longitude in degrees, running *continuously* along the track rather than
   * wrapped into ±180.
   *
   * A track that goes round the world passes the date line, and a wrapped
   * longitude turns that into a jump from 180 to -180 — which, drawn, is a
   * horizontal line straight back across the map. Carried unwrapped, the track
   * is one curve and the map is what decides where to cut it (`repeatsFor`);
   * so a single orbit can leave here at 12 degrees east and end at 349.
   */
  longitudeDeg: number;
  /** Height above the ellipsoid, in kilometres. */
  altitudeKm: number;
};

/** One orbit's worth of ground track, ready to draw. */
export type GroundTrack = {
  /** The object it belongs to, so a stale track cannot be drawn for a new one. */
  name: string;
  /** Evenly spaced in *time*, which is what makes the animation honest. */
  samples: readonly GroundSample[];
  /** When the track starts: the moment it was planned at. */
  fromMs: number;
  /** How long it covers, in milliseconds — one orbit. */
  spanMs: number;
  /** The same, in minutes, as the card writes it. */
  periodMinutes: number;
};

/**
 * The Earth's equatorial radius, in kilometres.
 *
 * A sphere of it, for the footprint below. The ellipsoid is 21 km flatter at
 * the poles, which moves the edge of a footprint by a fraction of a degree —
 * less than the width of the line it is drawn with.
 */
const EARTH_RADIUS_KM = 6378.137;

/**
 * One orbit of ground track from `atMs`, or `null` where SGP4 cannot place the
 * object or its elements do not describe an orbit worth drawing.
 *
 * Sampled in equal steps of time rather than of arc, which is the point: an
 * eccentric orbit spends most of its time near apogee and crosses perigee in
 * minutes, and equal time steps are what make the animation show that — the
 * dot crawls across the top of the picture and whips through the bottom, which
 * is what a Molniya orbit is *for*.
 *
 * A few hundred propagations of one object, run once on a tap. The frame path
 * could not afford it and does not need it; this is the slow half of the app,
 * next to `SkyTracker.describe`.
 */
export function groundTrackFor(entry: CatalogEntry, atMs: number): GroundTrack | null {
  const periodMinutes = orbitPeriodMinutes(entry.satrec);
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) return null;
  // An object whose elements put a single orbit past this is either decaying,
  // outbound, or a set of elements nobody should be drawing a day of. The
  // catalogue's real orbits run from ninety minutes to a sidereal day.
  if (periodMinutes > GROUND_TRACK.maximumPeriodMinutes) return null;

  const spanMs = periodMinutes * 60 * 1000;
  const steps = GROUND_TRACK.samples;
  const samples: GroundSample[] = [];
  let previousLongitude: number | null = null;

  // The closing point repeats the opening one, so the track is a closed curve:
  // a loop that stops one step short of itself has a gap in it, and on a figure
  // of eight that gap is where the two halves cross.
  for (let step = 0; step <= steps; step += 1) {
    const sampleMs = atMs + (step / steps) * spanMs;
    const when = new Date(sampleMs);
    const state = propagateStateAt(entry.satrec, when);
    // A record that fails part way through leaves what it managed: a track with
    // a piece missing is still a picture of the orbit, where nothing at all is
    // a card that has lost its map for one bad propagation.
    if (!state) continue;

    const geodetic = satellite.eciToGeodetic(state.position, gmstAt(when));
    if (!Number.isFinite(geodetic.latitude) || !Number.isFinite(geodetic.longitude)) continue;

    const longitude = unwrap(toDegrees(geodetic.longitude), previousLongitude);
    previousLongitude = longitude;
    samples.push({
      atMs: sampleMs,
      latitudeDeg: toDegrees(geodetic.latitude),
      longitudeDeg: longitude,
      altitudeKm: geodetic.height
    });
  }

  if (samples.length < GROUND_TRACK.minimumSamples) return null;
  return { name: entry.name, samples, fromMs: atMs, spanMs, periodMinutes };
}

/**
 * How far from the sub-point the satellite is still above the horizon, as an
 * angle at the centre of the Earth, in degrees.
 *
 * This is the footprint: the patch of ground that can see the object at all,
 * and so the patch it can serve. It is the ground end of the cone the satellite
 * looks down — `acos(R / (R + h))`, the half-angle of the cone tangent to the
 * Earth — and it is only a function of how high the thing is.
 *
 * The numbers are the ones that make the map worth drawing. The station at
 * 420 km sees 19 degrees, a circle about 2,200 km across, which is why a pass
 * lasts ten minutes and why it has to be somewhere near you to be seen at all.
 * A navigation satellite at 20,000 km sees 76 degrees — a third of the planet.
 * A geostationary one at 35,786 sees 81, which is why three of them cover the
 * inhabited world.
 *
 * The horizon proper, rather than some minimum working elevation: what is
 * being drawn is the geometry, and the angle above which a particular dish or a
 * particular pair of eyes is happy is a property of the receiver rather than of
 * the orbit.
 */
export function footprintRadiusDeg(altitudeKm: number): number {
  if (!(altitudeKm > 0)) return 0;
  return toDegrees(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)));
}

/**
 * The share of the Earth's surface inside that footprint, in `[0, 1]`.
 *
 * A spherical cap, which is `(1 - cos λ) / 2` of the sphere. One figure rather
 * than a circle on a map: it is what makes "a third of the planet" sayable.
 */
export function footprintShare(radiusDeg: number): number {
  return clamp((1 - Math.cos(radiusDeg * (Math.PI / 180))) / 2, 0, 1);
}

/**
 * Where along the track a phase in `[0, 1)` falls, interpolated between the
 * two samples either side of it.
 *
 * Linear, between samples a fraction of a degree apart: the track is sampled
 * finely enough that the curve between two points is a straight line to within
 * far less than the width of the line drawn over it.
 *
 * Interpolating rather than stepping from sample to sample is what stops the
 * dot stuttering. A few hundred samples over ten seconds of animation is
 * thirty-odd positions a second, which reads as a judder on a 60 Hz screen.
 */
export function sampleAt(track: GroundTrack, phase: number): GroundSample {
  const { samples } = track;
  const at = clamp(phase, 0, 1) * (samples.length - 1);
  const index = Math.min(Math.floor(at), samples.length - 2);
  const along = at - index;
  const from = samples[index];
  const to = samples[index + 1];
  return {
    atMs: from.atMs + (to.atMs - from.atMs) * along,
    latitudeDeg: from.latitudeDeg + (to.latitudeDeg - from.latitudeDeg) * along,
    longitudeDeg: from.longitudeDeg + (to.longitudeDeg - from.longitudeDeg) * along,
    altitudeKm: from.altitudeKm + (to.altitudeKm - from.altitudeKm) * along
  };
}

/**
 * How long the animation takes to fly one orbit, in seconds.
 *
 * The problem this answers is that the catalogue's orbits differ in period by a
 * factor of sixteen — ninety minutes at the bottom, a day at the top — and
 * neither of the two obvious things to do about it works.
 *
 * Run every orbit at the *same* compression and a geostationary satellite takes
 * four minutes to go nowhere, which nobody watches. Run every orbit in the
 * *same* number of seconds and the compression is a different factor for every
 * object, silently: the station and a navigation satellite would sweep their
 * tracks at the same rate on screen while being sixteen times apart in reality,
 * and the card would be quietly lying about the one thing it is there to show.
 *
 * So the loop is stretched by a *fraction* of the ratio — a power well under
 * one. A low orbit runs in about twelve seconds and a geostationary day in
 * about twice that: long enough that the difference between them is felt as the
 * dot moving slower, short enough that the loop comes round while somebody is
 * still looking at it. What makes it honest rather than merely pretty is the
 * clock beside the map, which runs in the orbit's own time — ninety minutes for
 * one and a day for the other — so what the compression is can be read off the
 * card rather than guessed from it.
 */
export function loopSecondsFor(periodMinutes: number): number {
  const { referenceMinutes, referenceSeconds, stretch, minimumSeconds, maximumSeconds } =
    GROUND_TRACK.animation;
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) return referenceSeconds;
  const scaled = referenceSeconds * Math.pow(periodMinutes / referenceMinutes, stretch);
  return clamp(scaled, minimumSeconds, maximumSeconds);
}

/**
 * `longitude`, moved by whole turns to be the one within half a turn of the
 * point before it. See `GroundSample.longitudeDeg`.
 */
function unwrap(longitude: number, previous: number | null): number {
  if (previous === null) return longitude;
  return longitude + 360 * Math.round((previous - longitude) / 360);
}
