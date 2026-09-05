import { DEVICE_CAMERA_FIELD_OF_VIEW } from "../constants";
import { toRadians } from "../math/angles";
import { EnuPosition } from "../types";
import { axesFromAttitude, CameraAttitude } from "./attitude";

/** Position within the video frame, in percent from the top-left corner. */
export type FramePoint = { left: number; top: number };

/**
 * Half-extents of a frame at unit depth: the tangents of the half angles the
 * lens covers.
 *
 * Precomputed per lens rather than per call, because the projection runs for
 * every tracked satellite on every displayed frame and the tangents do not
 * change between them.
 */
export type FrameLens = { horizontalScale: number; verticalScale: number };

export function lensFor(fieldOfView: {
  horizontalDeg: number;
  verticalDeg: number;
}): FrameLens {
  return {
    horizontalScale: Math.tan(toRadians(fieldOfView.horizontalDeg / 2)),
    verticalScale: Math.tan(toRadians(fieldOfView.verticalDeg / 2))
  };
}

/**
 * The phone's own lens.
 *
 * Every projection here takes the lens it is placing onto rather than assuming
 * one. The replay harness projects onto the recording's lens instead
 * (`testing/replay/constants.ts`), and the two are several degrees apart: a
 * default would silently be the wrong one half the time.
 */
export const DEVICE_LENS = lensFor(DEVICE_CAMERA_FIELD_OF_VIEW);

/**
 * Projects a satellite's local ENU position into frame coordinates for a
 * camera held at `attitude`.
 *
 * The target is resolved onto the camera's own three axes and divided by its
 * depth — the pinhole model — rather than by subtracting the camera's heading
 * and pitch from the target's azimuth and elevation. Those subtractions are
 * only equivalent on the two centre lines of the frame. Away from them they
 * are wrong by the convergence of the meridians, which is a couple of degrees
 * at the corners of this camera and grows with the pitch, and they have no way
 * at all to express roll: the markers slid across the scene whenever the phone
 * was not held upright, which is most of a hand-held recording.
 *
 * `lens` is the frame being projected onto — the phone's own preview, or the
 * recording's under the replay harness. Getting it wrong leaves every marker at
 * the right bearing but the wrong distance from the centre of the frame.
 *
 * Returns `null` when the target is behind the camera or outside the frame.
 */
export function projectToFrame(
  position: EnuPosition,
  attitude: CameraAttitude,
  lens: FrameLens
): FramePoint | null {
  const point = projectBeyondFrame(position, attitude, lens);
  if (!point) return null;
  if (Math.abs(point.left - 50) > 50 || Math.abs(point.top - 50) > 50) return null;
  return point;
}

/**
 * The same projection without the frame bounds test.
 *
 * A marker's trail is drawn from where the satellite is to where it will be,
 * and near the edge of the frame that second point is usually just outside it.
 * Discarding it would truncate exactly the trails whose direction is most
 * informative — the ones about to leave the view — so the point is returned
 * and the overlay clips the line it draws. Still `null` behind the camera,
 * where the projection has no meaning at all.
 */
export function projectBeyondFrame(
  position: EnuPosition,
  attitude: CameraAttitude,
  lens: FrameLens
): FramePoint | null {
  const { forward, right, up } = axesFromAttitude(attitude);

  const depth =
    position.east * forward.east + position.north * forward.north + position.up * forward.up;
  if (depth <= 0) return null;

  const horizontal =
    (position.east * right.east + position.north * right.north + position.up * right.up) / depth;
  const vertical =
    (position.east * up.east + position.north * up.north + position.up * up.up) / depth;

  return {
    left: 50 + (horizontal / lens.horizontalScale) * 50,
    top: 50 - (vertical / lens.verticalScale) * 50
  };
}

/**
 * Direction of the ray through a frame point, as a unit vector in the
 * observer's ENU frame: the inverse of `projectBeyondFrame`.
 *
 * The forward projection answers "where does this piece of sky land on the
 * screen"; this answers "what part of the sky is this pixel looking at", which
 * is what lets the horizon be located in the frame without anything to project.
 * Both go through the same axes and the same two scales, so the two cannot
 * drift apart.
 */
export function rayThroughFrame(
  point: FramePoint,
  attitude: CameraAttitude,
  lens: FrameLens
): EnuPosition {
  const { forward, right, up } = axesFromAttitude(attitude);

  const horizontal = ((point.left - 50) / 50) * lens.horizontalScale;
  const vertical = ((50 - point.top) / 50) * lens.verticalScale;
  // The axes are orthonormal, so the ray's length follows from its components
  // on them; dividing by it makes `up` the sine of the ray's elevation.
  const length = Math.hypot(1, horizontal, vertical);

  return {
    east: (forward.east + horizontal * right.east + vertical * up.east) / length,
    north: (forward.north + horizontal * right.north + vertical * up.north) / length,
    up: (forward.up + horizontal * right.up + vertical * up.up) / length
  };
}
