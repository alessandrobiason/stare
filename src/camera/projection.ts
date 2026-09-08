import { DEVICE_CAMERA_FIELD_OF_VIEW } from "../constants";
import { toRadians } from "../math/angles";
import { EnuPosition } from "../types";
import { axesFromAttitude, CameraAttitude, CameraAxes } from "./attitude";

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
  return projectWithAxes(position, axesFromAttitude(attitude), lens);
}

/**
 * The same projection again, onto axes that have already been built.
 *
 * `axesFromAttitude` is six trigonometric functions, and an attitude that is
 * fixed for a whole frame — the sky mask's, which is aimed where the camera was
 * when its frame was captured — would otherwise pay for them once per satellite
 * per displayed frame. Callers projecting many positions against one attitude
 * build the axes once and come in here.
 */
export function projectWithAxes(
  position: EnuPosition,
  axes: CameraAxes,
  lens: FrameLens
): FramePoint | null {
  const { forward, right, up } = axes;

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

/**
 * How far in front of the camera a position is, in the units it is given in.
 *
 * The depth the projection divides by, on its own: a position with none of it
 * is beside the camera and one with less is behind it, and neither can be
 * placed on a frame at all. Exposed because a *line* through the sky can have
 * one end either side of that plane — see `projectChain` — where a single point
 * can only be dropped.
 */
export function depthAlong(position: EnuPosition, axes: CameraAxes): number {
  const { forward } = axes;
  return position.east * forward.east + position.north * forward.north + position.up * forward.up;
}

/**
 * How far back from the plane behind the camera the crossing point is placed,
 * as a share of the step it is found on.
 *
 * A point exactly on the plane has no projection — the divide is by zero — and
 * one just in front of it projects a long way off the frame, which is where it
 * belongs: the line leaves the view and keeps going. A thousandth of the step
 * is far enough in front to be finite and near enough that the direction the
 * line leaves at is the direction it would have left at. What stops the
 * coordinates growing without bound is the clip that follows (`clipPolyline`),
 * not this.
 */
const NEAR_PLANE_BACKOFF = 1e-3;

/**
 * A chain of positions projected onto the frame, cut where it passes behind the
 * camera.
 *
 * The markers are points and a point behind the camera is simply not drawn. A
 * landmark's path is a line a hundred and eighty degrees long
 * (`src/satellite/orbitPath.ts`), so on any frame it crosses, most of it is
 * behind the camera and the interesting part is the crossing itself: drop the
 * points that cannot be placed and the line stops short of the edge of the view
 * by up to a whole sample, which reads as a path that gives up before it gets
 * there. So the segment that straddles the plane is cut on it instead, and the
 * cut point carries the line off the frame in the direction it was heading.
 *
 * Returns one run of points per stretch in front of the camera — usually one,
 * two when a path leaves the view and comes back into it — with the runs too
 * short to draw a line from left out.
 */
export function projectChain(
  positions: readonly EnuPosition[],
  axes: CameraAxes,
  lens: FrameLens
): FramePoint[][] {
  const runs: FramePoint[][] = [];
  let run: FramePoint[] = [];
  let previous: EnuPosition | null = null;
  let previousDepth = 0;

  const place = (position: EnuPosition) => {
    const point = projectWithAxes(position, axes, lens);
    if (point) run.push(point);
  };

  for (const position of positions) {
    const depth = depthAlong(position, axes);
    if (depth > 0) {
      if (previous && previousDepth <= 0) place(nearPlane(position, depth, previous, previousDepth));
      place(position);
    } else if (previous && previousDepth > 0) {
      place(nearPlane(previous, previousDepth, position, depth));
      if (run.length > 1) runs.push(run);
      run = [];
    }
    previous = position;
    previousDepth = depth;
  }

  if (run.length > 1) runs.push(run);
  return runs;
}

/** Where the step from a point in front of the camera to one behind it crosses. */
function nearPlane(
  front: EnuPosition,
  frontDepth: number,
  behind: EnuPosition,
  behindDepth: number
): EnuPosition {
  const share = (frontDepth / (frontDepth - behindDepth)) * (1 - NEAR_PLANE_BACKOFF);
  return {
    east: front.east + (behind.east - front.east) * share,
    north: front.north + (behind.north - front.north) * share,
    up: front.up + (behind.up - front.up) * share
  };
}
