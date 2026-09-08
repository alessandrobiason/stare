import { clamp, wrapDegrees180 } from "../math/angles";

/**
 * Scalar Kalman filter over one angle, carrying angular rate as a second state.
 *
 * The constant-velocity model is what makes it usable for a head-tracked view.
 * A low-pass heavy enough to hide the noise lags by its time constant times the
 * turn rate — 9 deg at 60 deg/s and 0.15 s, an eighth of the frame — which
 * reads as markers sliding out from behind the scene. Estimating the rate
 * removes that lag for steady motion, so the filter can smooth hard when still
 * and still keep up through a pan.
 *
 * Angles are degrees; every innovation is wrapped, so the filter crosses north
 * without unwinding.
 */
export class AngleKalmanFilter {
  private angleDeg = 0;
  private rateDegPerSecond = 0;
  /** Covariance of [angle, rate]. Symmetric, so `p01` stands for both corners. */
  private p00 = 0;
  private p01 = 0;
  private p11 = 0;
  private started = false;

  /** Latest smoothed angle, wrapped to `[-180, 180)`. */
  get angle(): number {
    return this.angleDeg;
  }

  /** Latest smoothed angular rate, in degrees per second. */
  get rate(): number {
    return this.rateDegPerSecond;
  }

  get isStarted(): boolean {
    return this.started;
  }

  /** Drops the estimate. The next measurement is adopted as-is. */
  reset(): void {
    this.started = false;
    this.angleDeg = 0;
    this.rateDegPerSecond = 0;
    this.p00 = 0;
    this.p01 = 0;
    this.p11 = 0;
  }

  /**
   * Advances the estimate by `dtSeconds` under a continuous white-noise
   * acceleration model, where `angularAcceleration` is the standard deviation
   * of the angular acceleration the motion is allowed to have, in deg/s².
   */
  predict(dtSeconds: number, angularAcceleration: number): void {
    if (!this.started || dtSeconds <= 0) return;

    this.angleDeg = wrapDegrees180(this.angleDeg + this.rateDegPerSecond * dtSeconds);

    // P = F P Fᵀ + Q, written out for F = [[1, dt], [0, 1]].
    const variance = angularAcceleration * angularAcceleration;
    this.p00 +=
      dtSeconds * (2 * this.p01 + dtSeconds * this.p11) +
      (variance * dtSeconds * dtSeconds * dtSeconds) / 3;
    this.p01 += dtSeconds * this.p11 + (variance * dtSeconds * dtSeconds) / 2;
    this.p11 += variance * dtSeconds;
  }

  /**
   * Fuses an angle measurement with standard deviation `noiseDeg`. The first is
   * adopted outright — there is no prior to weigh it against, and starting from
   * zero would swing the view in from north on the first frame.
   */
  correct(measurementDeg: number, noiseDeg: number): void {
    const variance = noiseDeg * noiseDeg;

    if (!this.started) {
      this.started = true;
      this.angleDeg = wrapDegrees180(measurementDeg);
      this.rateDegPerSecond = 0;
      this.p00 = variance;
      this.p01 = 0;
      // No rate information yet: leave it wide open for the first few updates.
      this.p11 = INITIAL_RATE_VARIANCE;
      return;
    }

    const innovation = wrapDegrees180(measurementDeg - this.angleDeg);
    const innovationVariance = this.p00 + variance;
    const gainAngle = this.p00 / innovationVariance;
    const gainRate = this.p01 / innovationVariance;

    this.angleDeg = wrapDegrees180(this.angleDeg + gainAngle * innovation);
    this.rateDegPerSecond += gainRate * innovation;

    // P = (I - K H) P, with H = [1, 0]. `p01` is needed twice, so keep it.
    const priorP01 = this.p01;
    this.p00 -= gainAngle * this.p00;
    this.p01 -= gainAngle * priorP01;
    this.p11 -= gainRate * priorP01;
  }

  /**
   * Holds the rate state inside `maxDegPerSecond`, in both directions.
   *
   * The state only, not the covariance: what this answers is a measurement the
   * filter's model cannot describe — an angle step delivered in an interval too
   * short to have contained it — and the filter's uncertainty about the rate is
   * unchanged by the fact that one correction overshot. Left widened, the next
   * honest reading still carries the gain to move the rate wherever it belongs.
   *
   * A projection onto what is possible rather than a rejection of the reading,
   * because the angle the reading carries is good even when the interval it
   * arrived in is not: the phone really is pointing there, and only the story
   * about how fast it got there is wrong.
   */
  limitRate(maxDegPerSecond: number): void {
    if (!this.started) return;
    this.rateDegPerSecond = clamp(this.rateDegPerSecond, -maxDegPerSecond, maxDegPerSecond);
  }

  /**
   * Where the angle is heading `dtSeconds` from the last update, without
   * committing to it. Used to carry the view forward between measurements.
   */
  projectTo(dtSeconds: number): number {
    return wrapDegrees180(this.angleDeg + this.rateDegPerSecond * dtSeconds);
  }
}

/** Rate variance, in (deg/s)², assumed before any motion has been observed. */
const INITIAL_RATE_VARIANCE = 180 * 180;

/**
 * Scalar Kalman filter over an angle expected to hold still and drift rather
 * than move — the magnetic north reference, in practice.
 *
 * One state and a random walk: a long memory averages the noise away, and the
 * drift term stops that memory closing entirely, so a slow bias is still
 * tracked.
 */
export class AngleRandomWalkFilter {
  private angleDeg = 0;
  private variance = 0;
  private started = false;

  get angle(): number {
    return this.angleDeg;
  }

  get isStarted(): boolean {
    return this.started;
  }

  reset(): void {
    this.started = false;
    this.angleDeg = 0;
    this.variance = 0;
  }

  /** Widens the estimate over `dtSeconds` at `driftDeg` per root second. */
  predict(dtSeconds: number, driftDeg: number): void {
    if (!this.started || dtSeconds <= 0) return;
    this.variance += driftDeg * driftDeg * dtSeconds;
  }

  correct(measurementDeg: number, noiseDeg: number): void {
    const measurementVariance = noiseDeg * noiseDeg;

    if (!this.started) {
      this.started = true;
      this.angleDeg = wrapDegrees180(measurementDeg);
      this.variance = measurementVariance;
      return;
    }

    const gain = this.variance / (this.variance + measurementVariance);
    this.angleDeg = wrapDegrees180(
      this.angleDeg + gain * wrapDegrees180(measurementDeg - this.angleDeg)
    );
    this.variance -= gain * this.variance;
  }
}
