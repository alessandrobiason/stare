import { CameraAttitude } from "../camera/attitude";
import { ORIENTATION_FILTER } from "../constants";
import { toDegrees, wrapDegrees180, wrapDegrees360 } from "../math/angles";
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

function gyroMagnitudeDegPerSecond(measurement: AttitudeMeasurement): number {
  const gyro = measurement.gyroRadPerSecond;
  return gyro ? toDegrees(Math.hypot(gyro.x, gyro.y, gyro.z)) : 0;
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
      this.northReference.correct(measurement.northOffsetDeg, ORIENTATION_FILTER.magneticNoiseDeg);
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
