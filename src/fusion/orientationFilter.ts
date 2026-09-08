import { CameraAttitude } from "../camera/attitude";
import { ORIENTATION_FILTER } from "../constants";
import { toDegrees, toRadians, wrapDegrees180, wrapDegrees360 } from "../math/angles";
import { AngleKalmanFilter, AngleRandomWalkFilter } from "./angleKalman";

/**
 * One reading of device attitude, as the sensors report it.
 *
 * `yawDeg` is the bearing of the optical axis measured from the attitude
 * source's own yaw origin (ARKit's session origin, or the gyro-integrated
 * heading on a live device); `northOffsetDeg` says where that origin sits
 * relative to north. They are kept apart because they are trustworthy over
 * different timescales — see `OrientationFilter`.
 */
export type AttitudeMeasurement = {
  timestampSeconds: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Bearing of the attitude source's yaw origin, clockwise from true north. */
  northOffsetDeg?: number;
  /**
   * How far that bearing may be out, in degrees, when the source can say.
   *
   * A phone can: the platform grades its own compass, and the grades are wide
   * apart enough to matter (`COMPASS_ACCURACY`). A recording cannot — it is one
   * device on one evening — so it leaves this out and the filter falls back to
   * the fitted constant.
   */
  northOffsetNoiseDeg?: number;
  /** Body-frame turn rate. Only the magnitude is used, so axes need no convention. */
  gyroRadPerSecond?: { x: number; y: number; z: number };
};

/** Attitude to aim the virtual camera with, plus the rate behind it. */
export type SmoothedOrientation = CameraAttitude & {
  /** How fast the smoothed attitude is turning; drives the adaptive smoothing. */
  rotationRateDegPerSecond: number;
};

const LEVEL: SmoothedOrientation = {
  headingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  rotationRateDegPerSecond: 0
};

/**
 * How far to trust a bearing to north from a compass the platform grades
 * `accuracy`, in degrees, for `AttitudeMeasurement.northOffsetNoiseDeg`.
 *
 * A source with no grade to give — a recording, or a phone before its first
 * heading — gets the fitted constant, which is what a good compass earns.
 */
export function northOffsetNoiseDeg(accuracy: number | undefined): number {
  if (accuracy === undefined) return ORIENTATION_FILTER.magneticNoiseDeg;
  const byLevel = ORIENTATION_FILTER.magneticNoiseByCompassAccuracy;
  const level = Math.round(accuracy);
  // A level outside the four the platform documents is not a good compass that
  // happens to sit off the end of the table — it is one this cannot grade, so
  // it is given the grade of one that cannot be trusted rather than the best
  // row, which is what clamping to the end would have handed it.
  if (level < 0 || level >= byLevel.length) return byLevel[0];
  return byLevel[level];
}

/**
 * How far to trust one magnetic bearing, having accounted for the fact that the
 * reading before it said very nearly the same thing for the same reason.
 *
 * The grade the platform gives its compass describes the *error* of a bearing,
 * and on a phone that error is dominated by a bias — a magnet, a steel desk,
 * another phone — which is the same from one reading to the next. Fusing forty
 * of those a second as independent measurements divides their noise by the
 * square root of forty and leaves the reference certain of a wrong bearing,
 * which is the failure this whole file's north term exists around.
 *
 * So the quoted noise is widened by the square root of how many readings fall
 * inside the window over which the error holds still
 * (`ORIENTATION_FILTER.magneticCorrelationSeconds`). The effect is that the
 * compass delivers one honest bearing per window however fast it is sampled:
 * the reference converges to the accuracy the compass actually has, a sighting
 * of the sun can outweigh it, and nothing else about the filter changes.
 *
 * Widening rather than fusing every nth reading, because the two are only
 * equivalent for white noise. A phone's magnetic noise is not: it has
 * structure at the frame rate, and sampling that at a fixed interval aliases
 * it into a standing offset.
 */
function magneticNoiseDeg(measurement: AttitudeMeasurement, elapsedSeconds: number): number {
  const quoted = measurement.northOffsetNoiseDeg ?? ORIENTATION_FILTER.magneticNoiseDeg;
  const interval = Math.max(elapsedSeconds, ORIENTATION_FILTER.minimumMagneticIntervalSeconds);
  const readings = ORIENTATION_FILTER.magneticCorrelationSeconds / interval;
  return quoted * Math.sqrt(Math.max(1, readings));
}

function gyroMagnitudeDegPerSecond(measurement: AttitudeMeasurement): number {
  const gyro = measurement.gyroRadPerSecond;
  return gyro ? toDegrees(Math.hypot(gyro.x, gyro.y, gyro.z)) : 0;
}

/**
 * The fastest one Euler axis can be turning while the body turns at
 * `gyroRateDegPerSecond`, in deg/s — the bound a rate estimate has to stay
 * inside to be describing motion rather than a mis-timed reading.
 *
 * The Euler rates are the body rate resolved onto axes that are not orthogonal:
 * the pitch rate is at most the body rate, and the heading and roll rates at
 * most that divided by `cos(pitch)`, which is the larger of the two and so
 * bounds all three. Plus the slack, and floored away from the vertical, both of
 * which `ORIENTATION_FILTER` explains — as it does why this exists at all.
 *
 * A reading with no gyro cannot be bounded this way and gets the backstop
 * instead, which is above anything a hand does rather than anything a sensor
 * does.
 */
function believableRateDegPerSecond(gyroRateDegPerSecond: number, pitchDeg: number): number {
  if (gyroRateDegPerSecond <= 0) return ORIENTATION_FILTER.maxRateWithoutGyroDegPerSecond;
  const cosPitch = Math.max(
    Math.abs(Math.cos(toRadians(pitchDeg))),
    ORIENTATION_FILTER.verticalPitchCosineFloor
  );
  return gyroRateDegPerSecond / cosPitch + ORIENTATION_FILTER.rateSlackDegPerSecond;
}

/**
 * Smooths device attitude into the direction the AR view is drawn with, and
 * carries it forward between readings. Three parts, each for one artefact:
 *
 * 1. **Heading is rebuilt, not measured.** It is yaw plus a bearing to north.
 *    The yaw is quiet; the magnetic north term carries tenths of a degree of
 *    noise per sample and is not a per-frame quantity at all — it is a fixed
 *    bearing that only drifts. So it gets its own long-memory filter, and all
 *    the fast motion comes from the yaw.
 * 2. **Each axis is a constant-velocity Kalman filter.** Smoothing alone
 *    trades jitter for lag, which is worse mid-pan; carrying the turn rate as
 *    a state lets the estimate keep up.
 * 3. **The smoothing adapts to the turn rate.** Still, it averages hard, which
 *    is where the shimmer lives; mid-pan it opens up. The rate comes from the
 *    gyro magnitude when there is one — a magnitude needs no axis convention —
 *    and otherwise from the filter's own rate states.
 */
export class OrientationFilter {
  private readonly heading = new AngleKalmanFilter();
  private readonly pitch = new AngleKalmanFilter();
  private readonly roll = new AngleKalmanFilter();
  private readonly northReference = new AngleRandomWalkFilter();
  private lastTimestampSeconds: number | null = null;

  /**
   * Drops the estimate. Call on a seek or a stream change: the attitude either
   * side is unrelated, and fusing across would swing the view through motion
   * that never happened.
   */
  reset(): void {
    this.heading.reset();
    this.pitch.reset();
    this.roll.reset();
    this.northReference.reset();
    this.lastTimestampSeconds = null;
  }

  /**
   * The bearing the heading is currently being built with: where the attitude
   * source's yaw origin is thought to sit relative to north.
   *
   * Read by the celestial alignment at the moment a frame is captured, because
   * what a sighting of the sun measures is the *heading*, and turning that back
   * into a correction to this needs the value this had when that heading was
   * produced — a second earlier, by the time the frame has come back. See
   * `CelestialSightingInput.northOffsetDeg`.
   */
  get northOffsetDeg(): number {
    return this.northReference.angle;
  }

  /**
   * Corrects that bearing from something other than the magnetometer.
   *
   * The same state and the same filter the magnetic readings correct, on
   * purpose. A sighting of the sun arrives with a standard deviation of a
   * fraction of a degree against the compass's three to forty, so the Kalman
   * gain does all of the work an override would have done — the reference snaps
   * onto the sighting, and the magnetometer's next several hundred readings
   * barely move it because its variance has collapsed. It then decays back
   * towards the compass as `predict` reopens that variance — measured at about
   * half a minute for a compass the platform grades high and five for one it
   * will not vouch for — which is the right behaviour for a fix that is no
   * longer being renewed and would have taken a mode flag and an unwind to
   * arrange by hand. The corollary is that the correction is not remembered:
   * see the note in the README on estimating the compass bias instead.
   *
   * No `predict` here: this arrives between readings, and the next `update`
   * advances the reference over the whole interval either way. That slightly
   * over-widens the estimate, which is the safe direction.
   */
  correctNorthOffset(bearingDeg: number, noiseDeg: number): void {
    this.northReference.correct(bearingDeg, noiseDeg);
  }

  /** Fuses one reading and returns the smoothed attitude at its timestamp. */
  update(measurement: AttitudeMeasurement): SmoothedOrientation {
    const previous = this.lastTimestampSeconds;
    const elapsed = previous === null ? 0 : measurement.timestampSeconds - previous;

    // Time running backwards, or a gap long enough that the device could be
    // pointing anywhere: start over rather than interpolate across it.
    if (previous !== null && (elapsed < 0 || elapsed > ORIENTATION_FILTER.maxSampleGapSeconds)) {
      this.reset();
      return this.update(measurement);
    }

    const gyroRate = gyroMagnitudeDegPerSecond(measurement);

    this.northReference.predict(elapsed, ORIENTATION_FILTER.magneticDriftDegPerRootSecond);
    if (measurement.northOffsetDeg !== undefined) {
      // Per reading rather than per filter: on a phone this rises and falls
      // with the platform's own calibration, and a bearing it has graded
      // unusable has to be taken as one rather than fused as if it were good.
      this.northReference.correct(
        measurement.northOffsetDeg,
        magneticNoiseDeg(measurement, elapsed)
      );
    }

    this.heading.predict(elapsed, this.angularAcceleration(this.heading.rate, gyroRate));
    this.pitch.predict(elapsed, this.angularAcceleration(this.pitch.rate, gyroRate));
    this.roll.predict(elapsed, this.angularAcceleration(this.roll.rate, gyroRate));

    this.heading.correct(
      measurement.yawDeg + this.northReference.angle,
      ORIENTATION_FILTER.headingNoiseDeg
    );
    this.pitch.correct(measurement.pitchDeg, ORIENTATION_FILTER.pitchNoiseDeg);
    this.roll.correct(measurement.rollDeg, ORIENTATION_FILTER.rollNoiseDeg);

    // What the gyro says is possible, applied after the corrections rather than
    // to them: a reading handed over late carries a sound angle and an interval
    // that never happened, so what has to be thrown away is the rate the two of
    // them imply and not the angle itself. Corrected first, clamped second, the
    // view keeps following the phone and stops coasting on a rate no hand could
    // produce — see the note in `ORIENTATION_FILTER`.
    const believable = believableRateDegPerSecond(gyroRate, this.pitch.angle);
    this.heading.limitRate(believable);
    this.pitch.limitRate(believable);
    this.roll.limitRate(believable);

    this.lastTimestampSeconds = measurement.timestampSeconds;
    return this.orientationAt(0);
  }

  /**
   * The smoothed attitude at `timestampSeconds`, coasted forward at the
   * estimated rate but never committed to the filter.
   *
   * What the render loop calls: frames are drawn faster than readings arrive,
   * and coasting is what keeps markers moving instead of stepping. Capped, so
   * that a paused video or a stalled sensor holds the view rather than sliding
   * the markers off on their own.
   */
  sample(timestampSeconds: number): SmoothedOrientation {
    if (this.lastTimestampSeconds === null) return LEVEL;
    const elapsed = timestampSeconds - this.lastTimestampSeconds;
    return this.orientationAt(
      Math.max(0, Math.min(elapsed, ORIENTATION_FILTER.maxExtrapolationSeconds))
    );
  }

  private orientationAt(elapsedSeconds: number): SmoothedOrientation {
    return {
      headingDeg: wrapDegrees360(this.heading.projectTo(elapsedSeconds)),
      pitchDeg: wrapDegrees180(this.pitch.projectTo(elapsedSeconds)),
      rollDeg: wrapDegrees180(this.roll.projectTo(elapsedSeconds)),
      rotationRateDegPerSecond: this.estimatedRateDegPerSecond()
    };
  }

  private estimatedRateDegPerSecond(): number {
    return Math.hypot(this.heading.rate, this.pitch.rate, this.roll.rate);
  }

  /**
   * Angular acceleration the motion model allows on one axis, in deg/s². Rises
   * with the turn rate, since a moving device is likelier to change pace.
   *
   * Per axis, from that axis's own rate: driving all three from the total would
   * let a fast pan unlock the pitch filter and stop it rejecting noise on an
   * axis that is barely moving. The gyro is folded in at a fraction of its
   * magnitude as an early warning, a few frames ahead of the rate states.
   */
  private angularAcceleration(axisRateDegPerSecond: number, gyroRateDegPerSecond: number): number {
    const rate = Math.max(
      Math.abs(axisRateDegPerSecond),
      gyroRateDegPerSecond * ORIENTATION_FILTER.gyroRateShare
    );
    return (
      ORIENTATION_FILTER.baseAngularAccelerationDegPerSecondSquared +
      ORIENTATION_FILTER.angularAccelerationPerDegPerSecond * rate
    );
  }
}
