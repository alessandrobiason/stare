import { lensFor } from "../../src/camera/projection";
import { fieldOfViewDeg } from "../../src/constants";

/**
 * Tuning that belongs to the staged recording rather than to the app: the
 * camera that shot it, and where it was shot.
 *
 * Kept here rather than in `src/constants.ts` because none of it describes the
 * product. A different recording changes every figure on this page and nothing
 * on that one.
 */

/**
 * The replayed iPhone's rear camera, as it reaches the screen.
 *
 * The recording is 1280x720 landscape with a 90-degree display rotation, so it
 * plays as a 720x1280 portrait frame: width spans the sensor's short side.
 * Focal length is the iPhone 6s's — a 4.15 mm lens over the 4.8 mm the 16:9
 * crop takes from the sensor is 1077 px at this width.
 */
export const REPLAY_CAMERA = {
  focalLengthPx: 1077,
  /** Displayed frame size, after the recording's rotation. */
  widthPx: 720,
  heightPx: 1280
} as const;

/** Field of view of the displayed frame, derived from the camera above. */
export const REPLAY_CAMERA_FIELD_OF_VIEW = {
  horizontalDeg: fieldOfViewDeg(REPLAY_CAMERA.widthPx, REPLAY_CAMERA.focalLengthPx),
  verticalDeg: fieldOfViewDeg(REPLAY_CAMERA.heightPx, REPLAY_CAMERA.focalLengthPx)
} as const;

/** Half-extents of that field of view, which the markers are projected with. */
export const REPLAY_LENS = lensFor(REPLAY_CAMERA_FIELD_OF_VIEW);

/**
 * Magnetic declination at the staged recording's location, in degrees east.
 *
 * Specific to wherever that recording was made — the magnetometer measures
 * magnetic north while satellites are placed from true north, and the two can
 * be many degrees apart. One figure covers a walk of a few hundred metres;
 * update it when staging a recording from elsewhere. The app itself asks the
 * platform for the local value instead (`readMagneticDeclinationDeg`).
 */
export const MAGNETIC_DECLINATION_DEG = 10;

/**
 * Human-readable name of the replayed recording, shown in the HUD. Generic by
 * default since any staged recording can be swapped in; set
 * `EXPO_PUBLIC_DATASET_LABEL` to name the one in use.
 */
export const REPLAY_DATASET_LABEL = process.env.EXPO_PUBLIC_DATASET_LABEL ?? "Recorded replay";
