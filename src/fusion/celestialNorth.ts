import { axesFromAttitude, CameraAttitude } from "../camera/attitude";
import { FrameLens, rayThroughFrame } from "../camera/projection";
import { CelestialBodyName, CelestialPosition, celestialPosition } from "../coordinates/celestialBodies";
import { CELESTIAL_ALIGNMENT } from "../constants";
import { clamp, toDegrees, wrapDegrees180, wrapDegrees360 } from "../math/angles";
import { ObserverLocation } from "../types";
import { BrightBlob } from "../vision/brightBodies";
import { Size } from "../vision/skySegmentation";

/**
 * Turning "the sun is in the picture, there" into "north is that way".
 *
 * The whole of the idea in one paragraph. The app draws the sky from a heading
 * built out of the phone's yaw and a bearing to magnetic north, and that second
 * term is the weak one: a magnet near the phone biases it by tens of degrees
 * and nothing downstream can tell. But the sun's bearing at a given instant
 * from a given place is known exactly (`celestialBodies.ts`), and if the sun
 * can be found in the frame then the ray through that pixel is a direct
 * measurement of where the camera is pointing. The difference between the two
 * bearings is the heading error, and adding it to the north reference is the
 * correction — not a calibration the person has to perform, not a nudge, and
 * not something that has to be right on the first try.
 *
 * Three things make it trustworthy rather than merely clever:
 *
 * 1. **Elevation is an independent check.** Turning the phone about the
 *    vertical moves a ray's azimuth and leaves its elevation exactly where it
 *    was, so how high the blob sits is a fact about the sighting that does not
 *    depend on the heading being solved for. It comes from pitch and roll,
 *    which come from gravity, which is the one thing here a magnet cannot
 *    touch. A blob that is not at the body's elevation is not the body, and
 *    that single test throws out nearly every lamp, window and headlight.
 * 2. **Nothing is believed once.** A sighting has to be repeated, at the same
 *    implied bearing, before it is fed anywhere (`CelestialNorthReference`).
 * 3. **It is a measurement, not an override.** It goes into the same random
 *    walk the magnetometer corrects, carrying its own standard deviation —
 *    which is a fraction of a degree against the compass's three to forty. The
 *    Kalman gain then does what an override would have done, without any of the
 *    consequences of one: it snaps the reference onto the sighting, holds it
 *    there against the magnetometer for as long as it stands, and lets it decay
 *    gracefully back to the compass if the sky clouds over. No mode, no flag,
 *    and nothing to unwind when the sun goes behind a building.
 */

/** What one accepted sighting says. */
export type CelestialSighting = {
  body: CelestialBodyName;
  /**
   * The bearing of the attitude source's yaw origin that the sighting implies:
   * a measurement of exactly the quantity the magnetometer is measuring, and
   * fed to the same filter state. See `AttitudeMeasurement.northOffsetDeg`.
   */
  northOffsetDeg: number;
  /** How far this moves the heading from where the sensors had it, signed. */
  correctionDeg: number;
  /** Standard deviation to weigh it by, in degrees. */
  noiseDeg: number;
  /** Where in the frame the body was found, in percent from the top-left. */
  at: { left: number; top: number };
  /** The ephemeris elevation it was matched against. */
  altitudeDeg: number;
  /** How far the blob's own elevation sat from that one. */
  elevationResidualDeg: number;
  /** How far off the optical axis it was, which is most of its noise. */
  offAxisDeg: number;
};

/** A sighting, or the reason there was not one, for the debug overlay. */
export type CelestialSightingAttempt = {
  sighting: CelestialSighting | null;
  reason: string;
};

/**
 * The bodies worth looking for right now: up, and not so nearly overhead that
 * their bearing says little (`CELESTIAL_ALIGNMENT`).
 *
 * Asked before the pixels are touched, so a night with the moon down costs an
 * ephemeris call and nothing else.
 */
export function bodiesWorthSighting(
  observer: ObserverLocation,
  when: Date
): CelestialPosition[] {
  const bodies: CelestialBodyName[] = ["sun", "moon"];
  return bodies
    .map((body) => celestialPosition(body, observer, when))
    .filter(
      (position) =>
        position.altitudeDeg >= CELESTIAL_ALIGNMENT.minimumAltitudeDeg &&
        position.altitudeDeg <= CELESTIAL_ALIGNMENT.maximumAltitudeDeg
    );
}

export type CelestialSightingInput = {
  /** The bright blobs found in the frame, in the order they were ranked. */
  blobs: BrightBlob[];
  /** Where the camera was aimed when that frame was captured. */
  attitude: CameraAttitude;
  /** The frame the blobs were found in, in pixels. */
  frame: Size;
  /** Half-extents of the field of view those pixels cover. */
  lens: FrameLens;
  /** Where the body is, from the clock and the fix. */
  position: CelestialPosition;
  /**
   * The north reference the attitude's heading was built with, at the instant
   * of the capture.
   *
   * Needed because a sighting measures the *heading*, and what the filter
   * carries is the yaw origin's bearing. The two differ by the yaw, which is
   * not passed here: adding the correction to the reference the heading was
   * built from gives the reference that heading should have used, without the
   * yaw ever being mentioned. Read at the shutter rather than now, since the
   * reference has moved a little in the second the frame took to come back.
   */
  northOffsetDeg: number;
};

/**
 * Tries to match one of `blobs` to `position`.
 *
 * Every gate is a reason to throw a sighting away, and that is the intended
 * ratio: a wrong sighting is worth tens of degrees of heading and would be
 * held confidently, whereas a missed one costs a second until the next frame.
 * The last gate is the strictest — exactly one candidate may survive. Two blobs
 * at the body's elevation is a frame that cannot say which is which, and
 * picking the brighter would be a guess dressed as a measurement.
 */
export function sightBody(input: CelestialSightingInput): CelestialSightingAttempt {
  const { blobs, attitude, frame, lens, position, northOffsetDeg } = input;
  if (blobs.length === 0) return { sighting: null, reason: "nothing bright in the frame" };

  const forward = axesFromAttitude(attitude).forward;
  // Approximate, and only ever used as a size gate whose bounds are a factor of
  // sixty apart: the frame's own pixels do not quite subtend equal angles across
  // and down, and nothing here is sensitive to the few percent between them.
  const degreesPerPixel = (2 * toDegrees(Math.atan(lens.horizontalScale))) / frame.width;

  const candidates: CelestialSighting[] = [];
  let nearest = Infinity;

  for (const blob of blobs) {
    if (blob.clipped) continue;

    const radiusDeg = blob.radiusPx * degreesPerPixel;
    if (
      radiusDeg < CELESTIAL_ALIGNMENT.minimumRadiusDeg ||
      radiusDeg > CELESTIAL_ALIGNMENT.maximumRadiusDeg
    ) {
      continue;
    }

    const ray = rayThroughFrame(blob.centre, attitude, lens);
    const elevationDeg = toDegrees(Math.asin(clamp(ray.up, -1, 1)));
    const elevationResidualDeg = elevationDeg - position.altitudeDeg;
    nearest = Math.min(nearest, Math.abs(elevationResidualDeg));
    if (Math.abs(elevationResidualDeg) > CELESTIAL_ALIGNMENT.elevationAgreementDeg) continue;

    const azimuthDeg = wrapDegrees360(toDegrees(Math.atan2(ray.east, ray.north)));
    const correctionDeg = wrapDegrees180(position.azimuthDeg - azimuthDeg);
    if (Math.abs(correctionDeg) > CELESTIAL_ALIGNMENT.maximumCorrectionDeg) continue;

    const offAxisDeg = toDegrees(
      Math.acos(
        clamp(ray.east * forward.east + ray.north * forward.north + ray.up * forward.up, -1, 1)
      )
    );

    candidates.push({
      body: position.body,
      northOffsetDeg: wrapDegrees180(northOffsetDeg + correctionDeg),
      correctionDeg,
      noiseDeg: sightingNoiseDeg(position.altitudeDeg, offAxisDeg),
      at: blob.centre,
      altitudeDeg: position.altitudeDeg,
      elevationResidualDeg,
      offAxisDeg
    });
  }

  if (candidates.length === 1) return { sighting: candidates[0], reason: "sighted" };
  if (candidates.length > 1) {
    return { sighting: null, reason: `${candidates.length} blobs at the ${position.body}'s elevation` };
  }
  return {
    sighting: null,
    reason: Number.isFinite(nearest)
      ? `nearest blob ${nearest.toFixed(0)}° off the ${position.body}'s elevation`
      : `no blob the shape of the ${position.body}`
  };
}

/**
 * How far to trust a sighting, in degrees, as the standard deviation handed to
 * the north reference.
 *
 * Two multipliers on a base that stands for the centroid and the attitude
 * behind it, and both are geometry rather than taste:
 *
 * - **`1 / cos(altitude)`.** Azimuth converges towards the zenith, so a fixed
 *   angular error in the sighting covers more and more of it as the body rises.
 *   A sun at sixty degrees is worth half a sun at thirty, and the filter should
 *   be told that rather than the code refusing the higher one.
 * - **A fraction of the angle off the optical axis.** The lens is assumed and
 *   not measured (`DEVICE_CAMERA`), and an error in the assumed focal length
 *   displaces a point in proportion to how far off-centre it is. A body in the
 *   middle of the frame does not care what the field of view is; one at the
 *   corner is only as good as that figure.
 *
 * The effect is that the app quietly prefers a body near the middle of the
 * frame at a moderate elevation, without ever having to choose one: they all go
 * in, and the weighting sorts them out.
 */
export function sightingNoiseDeg(altitudeDeg: number, offAxisDeg: number): number {
  const angular =
    CELESTIAL_ALIGNMENT.baseNoiseDeg + CELESTIAL_ALIGNMENT.lensNoiseFraction * offAxisDeg;
  const convergence = 1 / Math.max(Math.cos((altitudeDeg * Math.PI) / 180), 0.2);
  return angular * convergence;
}

/**
 * Holds a sighting back until a second one agrees with it.
 *
 * The gates in `sightBody` are geometric and strong, but they are all applied
 * to one frame, and one frame is exactly what a reflection off a window gets
 * right by accident. What it does not get right is the same implied bearing
 * again a second or two later, usually from a slightly different aim — the
 * reflection moves with the phone and the sun does not. So the first sighting
 * of a body only arms the next one.
 *
 * Kept per body rather than as a single last-sighting, so that a real sun seen
 * in every frame is not disarmed by a spurious moon between two of them: each
 * body confirms itself.
 */
export class CelestialNorthReference {
  private readonly previous = new Map<
    CelestialBodyName,
    { sighting: CelestialSighting; atSeconds: number }
  >();

  /** Drops the run. Call on a seek or a jump, as the attitude filter does. */
  reset(): void {
    this.previous.clear();
  }

  /**
   * Offers a sighting, and returns it if it is one to act on — which it is
   * once a sighting of the same body, recent enough to be of the same sky,
   * has already implied the same bearing.
   */
  confirm(sighting: CelestialSighting, atSeconds: number): CelestialSighting | null {
    const previous = this.previous.get(sighting.body);
    this.previous.set(sighting.body, { sighting, atSeconds });

    if (!previous) return null;
    if (atSeconds - previous.atSeconds > CELESTIAL_ALIGNMENT.holdSeconds) return null;
    const disagreement = Math.abs(
      wrapDegrees180(sighting.northOffsetDeg - previous.sighting.northOffsetDeg)
    );
    return disagreement <= CELESTIAL_ALIGNMENT.agreementDeg ? sighting : null;
  }
}
