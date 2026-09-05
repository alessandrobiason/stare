import { CameraAttitude } from "../camera/attitude";
import { FrameLens, rayThroughFrame } from "../camera/projection";
import { clamp, toDegrees } from "../math/angles";
import { scaledDetail, SkyMask } from "./skyMask";

/**
 * Suppresses the parts of a sky mask that the camera's own attitude says are
 * looking at the ground.
 *
 * The segmentation model sees one image and nothing else, so it has to decide
 * from appearance alone what is above the horizon — and the appearance of open
 * sky is exactly the appearance of sky reflected in water, wet asphalt or
 * glass. That is the failure this model is most prone to, since SkyWater-Seg
 * carries a separate water class precisely because the two are hard to tell
 * apart; the reflection is not merely sky-like, it is a picture of the sky.
 *
 * No amount of looking harder at the pixels settles it, but the device already
 * knows the answer: ARKit's pitch is gravity-referenced and driftless, so where
 * the horizon crosses the frame is a matter of geometry, not of recognition. A
 * cell below it cannot be open sky whatever the image looks like.
 *
 * What this does and does not change: the mask's coverage figure, the debug
 * grid, and what the temporal filter carries into the next frame all become
 * correct below the horizon. Which markers are hidden it does not touch, and
 * cannot — the cap has faded out within one cell's height of the horizon,
 * while `MINIMUM_SATELLITE_ELEVATION_DEG` keeps every marker degrees above it.
 * The two are the same argument at different scales: nothing under the horizon
 * is sky, and nothing that close to it is placed well enough to draw.
 */

/**
 * How the cap falls off across the horizon, in degrees, for a given mask.
 *
 * One cell's own height, which is why it is measured from the lens rather than
 * from a constant: below that the mask cannot say where the horizon runs
 * anyway, since a single cell straddles it. This is deliberately not a tuning
 * knob — a coarser mask localises the horizon less well and gets a gentler
 * ramp for free, and the pitch feeding it is good to a small fraction of a
 * cell either way.
 */
function taperDegrees(mask: SkyMask, lens: FrameLens): number {
  return (2 * toDegrees(Math.atan(lens.verticalScale))) / mask.rows;
}

/**
 * The most sky confidence a cell at this elevation may keep: 1 well above the
 * horizon, 0 well below it, and 0.5 — the classification threshold itself — on
 * the horizon, where the geometry is genuinely undecided.
 */
export function horizonSkyLimit(elevationDeg: number, taperDeg: number): number {
  return clamp(0.5 + elevationDeg / (2 * taperDeg), 0, 1);
}

/** Elevation of the ray through the centre of a mask cell, in degrees. */
function cellElevationDeg(
  mask: SkyMask,
  column: number,
  row: number,
  attitude: CameraAttitude,
  lens: FrameLens
) {
  const direction = rayThroughFrame(
    {
      left: ((column + 0.5) / mask.columns) * 100,
      top: ((row + 0.5) / mask.rows) * 100
    },
    attitude,
    lens
  );
  return toDegrees(Math.asin(clamp(direction.up, -1, 1)));
}

/**
 * Attenuates `mask` by the horizon, returning a new mask.
 *
 * Every cell is cast back into the sky through the same pinhole model and the
 * same lens the markers are projected with, which is what makes the roll term work: a tilted
 * camera has a tilted horizon, and treating the mask's rows as if they were
 * level would clear a triangle of real sky on one side of the frame while
 * leaving the ground standing on the other.
 *
 * Costs one ray per cell — some 1,500 of them — against a model that spends
 * about a second on the same frame, and is run at the segmentation cadence
 * rather than the display one, so there is nothing here worth folding away.
 *
 * A cell's sub-cell detail is capped by the cell's own limit rather than by one
 * ray each, which is deliberate and not a saving of rays. The cap is a ramp one
 * cell tall, so a cell's sub-cells differ from it by well under half the ramp;
 * and everywhere except that one cell of frame the limit has saturated at 0 or
 * 1, where a per-sub-cell ray would return exactly what the cell's did. Refining
 * the geometry of the horizon is not what the detail is for — it is for the
 * branches above it, which the model has to find in the picture.
 */
export function applyHorizonPrior(
  mask: SkyMask,
  attitude: CameraAttitude,
  lens: FrameLens
): SkyMask {
  const taperDeg = taperDegrees(mask, lens);

  const limits = mask.confidence.map((_value, index) => {
    const column = index % mask.columns;
    const row = Math.floor(index / mask.columns);
    return horizonSkyLimit(cellElevationDeg(mask, column, row, attitude, lens), taperDeg);
  });

  return {
    columns: mask.columns,
    rows: mask.rows,
    confidence: mask.confidence.map((value, index) => value * limits[index]),
    detail: scaledDetail(mask, (cell) => limits[cell])
  };
}
