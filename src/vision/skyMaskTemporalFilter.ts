import { axesFromAttitude, CameraAttitude, CameraAxes } from "../camera/attitude";
import { FrameLens } from "../camera/projection";
import { EnuPosition } from "../types";
import { sampleMask, SkyMask } from "./skyMask";

/** Device attitude at the moment a mask was produced. */
export type SkyMaskSensorSample = {
  timestampSeconds: number;
  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  gyroRadPerSecond?: { x: number; y: number; z: number };
};

type FilterState = { mask: SkyMask; sample: SkyMaskSensorSample };

/** Blend weight given to the previous mask when the camera is perfectly still. */
const MAX_PRIOR_WEIGHT = 0.45;
/** Rotation rate (deg/s) at which the prior is discarded entirely. */
const MAX_ROTATION_RATE_DEG_PER_SECOND = 100;
/** Gap beyond which the previous mask is considered stale (e.g. after a seek). */
const MAX_SAMPLE_GAP_SECONDS = 2.5;
/** Below this weight, blending is not worth the work. */
const MIN_USEFUL_PRIOR_WEIGHT = 0.01;

function gyroMagnitudeRadPerSecond(sample: SkyMaskSensorSample): number {
  const gyro = sample.gyroRadPerSecond;
  return gyro ? Math.hypot(gyro.x, gyro.y, gyro.z) : 0;
}

function attitudeOf(sample: SkyMaskSensorSample): CameraAttitude {
  return {
    headingDeg: sample.headingDeg ?? 0,
    pitchDeg: sample.pitchDeg ?? 0,
    rollDeg: sample.rollDeg ?? 0
  };
}

const dot = (a: EnuPosition, b: EnuPosition): number =>
  a.east * b.east + a.north * b.north + a.up * b.up;

/**
 * Temporally smooths successive sky masks.
 *
 * The segmentation model runs on isolated frames, so its output flickers. This
 * filter re-aims the previous mask at the sky the current one is looking at,
 * then blends it in. The blend weight falls to zero during fast pans, after a
 * seek, and in proportion to how much of the frame is new, so a stale mask can
 * never leave a trail across the picture.
 *
 * `lens` is the frame being smoothed — the recording's, or the phone's own
 * preview. It sets how many degrees of sky a cell covers, which is the whole
 * content of the re-aiming, so the wrong one drags the prior by a fixed factor.
 */
export class SkyMaskTemporalFilter {
  private previous: FilterState | null = null;

  constructor(private readonly lens: FrameLens) {}

  /** Drops the prior. Call on a seek, when frames are no longer contiguous. */
  reset(): void {
    this.previous = null;
  }

  update(current: SkyMask, sample: SkyMaskSensorSample): SkyMask {
    const previous = this.previous;
    const sameGrid =
      previous &&
      previous.mask.columns === current.columns &&
      previous.mask.rows === current.rows;
    if (!previous || !sameGrid) return this.accept(current, sample);

    const elapsed = sample.timestampSeconds - previous.sample.timestampSeconds;
    if (elapsed <= 0 || elapsed > MAX_SAMPLE_GAP_SECONDS) return this.accept(current, sample);

    const priors = reaimedPrior(current, previous.mask, this.lens, sample, previous.sample);
    const weight = priorWeight(priors, sample, previous.sample);
    if (weight <= MIN_USEFUL_PRIOR_WEIGHT) return this.accept(current, sample);

    return this.accept(blend(current, priors, weight), sample);
  }

  private accept(mask: SkyMask, sample: SkyMaskSensorSample): SkyMask {
    this.previous = { mask, sample };
    return mask;
  }
}

type ReaimedPrior = {
  /** The previous mask's confidence at each current cell, `NaN` where it had none. */
  values: Float64Array;
  /**
   * The same for each sub-cell of a refined cell, laid out like the current
   * mask's own residuals, or `null` when the current mask carries no detail.
   */
  subValues: Float64Array | null;
  /** Fraction of the current frame the previous one also covered, in `[0, 1]`. */
  overlap: number;
};

/**
 * The direction a point of the frame looks along, in the observer's ENU frame.
 * `x` and `y` are fractions of the frame from its top-left corner.
 */
function rayThroughFrame(
  lens: FrameLens,
  axes: CameraAxes,
  x: number,
  y: number
): EnuPosition {
  // The point as the tangents of the angles off the optical axis — the same
  // normalized coordinates `projectToFrame` divides down to, so the two agree by
  // construction.
  const horizontal = (2 * x - 1) * lens.horizontalScale;
  const vertical = (1 - 2 * y) * lens.verticalScale;

  return {
    east: axes.forward.east + axes.right.east * horizontal + axes.up.east * vertical,
    north: axes.forward.north + axes.right.north * horizontal + axes.up.north * vertical,
    up: axes.forward.up + axes.right.up * horizontal + axes.up.up * vertical
  };
}

/**
 * What the previous mask says about the sky along `ray`, or `null` when that
 * direction was not in the previous frame at all.
 */
function priorAlong(
  previous: SkyMask,
  previousAxes: CameraAxes,
  lens: FrameLens,
  ray: EnuPosition
): number | null {
  const depth = dot(ray, previousAxes.forward);
  // Behind the previous camera: that sky was not in the last frame at all.
  if (depth <= 0) return null;

  const horizontal = dot(ray, previousAxes.right) / depth / lens.horizontalScale;
  const vertical = dot(ray, previousAxes.up) / depth / lens.verticalScale;

  return sampleMask(
    previous,
    ((horizontal + 1) / 2) * previous.columns - 0.5,
    ((1 - vertical) / 2) * previous.rows - 0.5
  );
}

/**
 * Reads the previous mask at the piece of sky each current cell now covers.
 *
 * Every cell centre is turned into the direction it looks along, and that
 * direction is projected into the previous frame — the exact rotation between
 * the two attitudes, through the same pinhole model the markers are placed with.
 *
 * The linear shift this replaces — heading difference as a fraction of the field
 * of view, times the column count — is only right on the frame's centre lines
 * and only for small turns, because pixels go as the tangent of the angle and
 * not the angle. It also rotated roll in *cell* coordinates, where a cell was
 * two and a half times taller than it was wide, so a roll of ten degrees threw
 * the corners of the prior out by several degrees of sky: more error than the
 * smoothing was removing.
 */
function reaimedPrior(
  current: SkyMask,
  previous: SkyMask,
  lens: FrameLens,
  sample: SkyMaskSensorSample,
  previousSample: SkyMaskSensorSample
): ReaimedPrior {
  const currentAxes = axesFromAttitude(attitudeOf(sample));
  const previousAxes = axesFromAttitude(attitudeOf(previousSample));

  const detail = current.detail;
  const factor = detail?.factor ?? 1;
  const values = new Float64Array(current.columns * current.rows);
  const subValues = detail ? new Float64Array(detail.residuals.length) : null;
  let covered = 0;

  for (let row = 0; row < current.rows; row += 1) {
    for (let column = 0; column < current.columns; column += 1) {
      const index = row * current.columns + column;
      const prior = priorAlong(
        previous,
        previousAxes,
        lens,
        rayThroughFrame(lens, currentAxes, (column + 0.5) / current.columns, (row + 0.5) / current.rows)
      );

      values[index] = prior ?? NaN;
      if (prior !== null) covered += 1;

      const start = detail ? detail.blockStart[index] : -1;
      if (!detail || !subValues || start < 0) continue;

      // A refined cell is re-aimed sub-cell by sub-cell, through the same
      // projection its centre went through. Reading the prior once for the whole
      // cell and reusing it would blend every sub-cell towards one number, which
      // is the cell's own value again: the edge would be smoothed out of the
      // mask by the very filter that exists to hold it steady.
      for (let subRow = 0; subRow < factor; subRow += 1) {
        for (let subColumn = 0; subColumn < factor; subColumn += 1) {
          const subPrior = priorAlong(
            previous,
            previousAxes,
            lens,
            rayThroughFrame(
              lens,
              currentAxes,
              (column + (subColumn + 0.5) / factor) / current.columns,
              (row + (subRow + 0.5) / factor) / current.rows
            )
          );
          subValues[start + subRow * factor + subColumn] = subPrior ?? NaN;
        }
      }
    }
  }

  return { values, subValues, overlap: values.length ? covered / values.length : 0 };
}

/**
 * Trust in the previous mask: full when still, tapering to zero as the rotation
 * rate rises or as the frame turns away from what the last one covered.
 */
function priorWeight(
  priors: ReaimedPrior,
  sample: SkyMaskSensorSample,
  previous: SkyMaskSensorSample
): number {
  const rotationRateDeg =
    Math.max(gyroMagnitudeRadPerSecond(sample), gyroMagnitudeRadPerSecond(previous)) *
    (180 / Math.PI);

  const stillness = Math.max(0, 1 - rotationRateDeg / MAX_ROTATION_RATE_DEG_PER_SECOND);
  return MAX_PRIOR_WEIGHT * stillness * priors.overlap;
}

const mix = (value: number, prior: number, weight: number): number =>
  Number.isNaN(prior) ? value : value * (1 - weight) + prior * weight;

/**
 * Mixes the re-aimed prior into the current mask. Cells with no prior keep their
 * value, and so do sub-cells: near the edge of the frame a cell can have a prior
 * where part of its inside does not.
 *
 * A refined cell is blended on its sub-cells and its own value taken back from
 * their mean, so the cell and its inside cannot drift apart — the invariant
 * `coarsen` establishes and everything reading the mask relies on.
 */
function blend(current: SkyMask, priors: ReaimedPrior, priorWeight: number): SkyMask {
  const confidence = current.confidence.map((value, index) =>
    mix(value, priors.values[index], priorWeight)
  );

  const detail = current.detail;
  if (!detail || !priors.subValues) {
    return { columns: current.columns, rows: current.rows, confidence };
  }

  const perCell = detail.factor * detail.factor;
  const residuals = new Float32Array(detail.residuals.length);

  for (let cell = 0; cell < confidence.length; cell += 1) {
    const start = detail.blockStart[cell];
    if (start < 0) continue;

    let sum = 0;
    for (let sub = 0; sub < perCell; sub += 1) {
      const blended = mix(
        current.confidence[cell] + detail.residuals[start + sub],
        priors.subValues[start + sub],
        priorWeight
      );
      residuals[start + sub] = blended;
      sum += blended;
    }

    const mean = sum / perCell;
    confidence[cell] = mean;
    for (let sub = 0; sub < perCell; sub += 1) residuals[start + sub] -= mean;
  }

  return {
    columns: current.columns,
    rows: current.rows,
    confidence,
    detail: { factor: detail.factor, blockStart: detail.blockStart, residuals }
  };
}
