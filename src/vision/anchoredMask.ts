import { axesFromAttitude, CameraAttitude, CameraAxes } from "../camera/attitude";
import { FrameLens, FramePoint, projectWithAxes } from "../camera/projection";
import { clamp, toDegrees } from "../math/angles";
import { EnuPosition } from "../types";
import { skyConfidenceAt, SkyMask } from "./skyMask";

/**
 * A sky mask together with where the camera was pointing when the frame behind
 * it was taken.
 *
 * The mask is a grid over a *frame*, and a frame is a piece of sky only once
 * you know where the camera was aimed. Without the attitude the grid is pinned
 * to the screen, and the screen is the one thing that moves: the phone turns,
 * every marker follows the sky immediately because the projection is recomputed
 * from the live attitude, and the mask stays where it was until the next pass
 * lands a second or more later. What that looks like is exactly what it is —
 * satellites drawn over a building because the mask still believes the building
 * is somewhere else.
 *
 * Carried with the mask, the attitude turns it back into a map of the sky:
 * a direction is read at the place it occupied in the mask's own frame, so
 * rotating the phone does not change what the mask says about anything. What
 * rotating does change is how much of the view the mask still covers, which is
 * honest — the sky the turn revealed has not been looked at yet.
 */
export type AnchoredSkyMask = {
  mask: SkyMask;
  /** Where the camera was aimed when the mask's frame was captured. */
  attitude: CameraAttitude;
};

/**
 * How far outside its own frame a mask may be read, in cells.
 *
 * `skyConfidenceAt` clamps to the nearest cell, so the outer half-cell of the
 * frame already answers for sky slightly beyond the edge; one cell keeps a
 * marker sitting exactly on the border from flickering between an answer and no
 * answer as the phone breathes. Past that the mask is extrapolating into sky it
 * never saw, and `null` — "no reading" — is the truthful answer.
 */
const EDGE_MARGIN_CELLS = 1;

/**
 * Reads the mask in world directions rather than in screen positions.
 *
 * Returns a function from an ENU direction to the sky confidence there, or
 * `null` where that direction falls outside the frame the mask was taken from.
 * The camera axes are built once for the whole frame rather than per direction,
 * which is what makes this affordable for every tracked satellite on every
 * displayed frame.
 */
export function skyProbe(
  anchored: AnchoredSkyMask,
  lens: FrameLens
): (position: EnuPosition) => number | null {
  const axes = axesFromAttitude(anchored.attitude);
  const marginLeft = (EDGE_MARGIN_CELLS * 100) / anchored.mask.columns;
  const marginTop = (EDGE_MARGIN_CELLS * 100) / anchored.mask.rows;

  return (position: EnuPosition): number | null => {
    const point = projectWithAxes(position, axes, lens);
    if (!point) return null;
    if (Math.abs(point.left - 50) > 50 + marginLeft) return null;
    if (Math.abs(point.top - 50) > 50 + marginTop) return null;
    return skyConfidenceAt(anchored.mask, point.left, point.top);
  };
}

/** Angle between two aims: how far the camera has turned from one to the other. */
export function aimOffsetDeg(from: CameraAttitude, to: CameraAttitude): number {
  const a = axesFromAttitude(from).forward;
  const b = axesFromAttitude(to).forward;
  return toDegrees(Math.acos(clamp(a.east * b.east + a.north * b.north + a.up * b.up, -1, 1)));
}

/** Angle between where the mask was aimed and where the camera is aimed now. */
export function maskOffsetDeg(anchored: AnchoredSkyMask, attitude: CameraAttitude): number {
  return aimOffsetDeg(anchored.attitude, attitude);
}

/**
 * How far the camera may turn off a mask's aim before that mask is answering
 * for materially less than the view: `fraction` of the narrower of the two
 * fields of view the frame covers.
 *
 * Off the narrower one, so the figure means the same thing whichever way the
 * phone is turned — a frame is wider one way than the other, and a tolerance
 * taken off the wide side would let half as much again of a portrait frame go
 * unmapped across the narrow one before it noticed.
 *
 * A fraction of the field of view rather than of the frame, and the two are not
 * quite the same thing: frame position goes as the tangent of the angle, so a
 * turn of an eighth of the field of view sweeps a little over an eighth of the
 * frame's width past the edge. That is the conservative direction — slightly
 * more sky uncovered at the threshold than the fraction suggests, never less.
 */
export function aimToleranceDeg(lens: FrameLens, fraction: number): number {
  const halfNarrowSide = Math.min(lens.horizontalScale, lens.verticalScale);
  return fraction * 2 * toDegrees(Math.atan(halfNarrowSide));
}

/**
 * Where the mask's frame has ended up in the frame on screen: the placement the
 * debug overlay draws it at.
 *
 * A rotation between two attitudes is a homography on the frame, not a
 * similarity, so this is a fit rather than the transform itself — the mask's
 * centre and the middle of two of its edges, projected exactly and then read as
 * a translation, a rotation and a scale. That is all a view transform can carry,
 * and over the second or so of lag being drawn here the perspective term it
 * drops is a fraction of a cell. What must not be approximated is which
 * satellites are hidden, and that is not: `skyProbe` projects every direction
 * through the full model.
 *
 * `null` when the mask's frame has been turned far enough away that its centre
 * is behind the camera and there is nothing sensible to draw.
 */
export type MaskAlignment = {
  /** Where the mask frame's centre now sits, in percent of the view frame. */
  centre: FramePoint;
  /** Rotation about that centre, in degrees clockwise on screen. */
  rotationDeg: number;
  /** Uniform scale about that centre. */
  scale: number;
};

export function maskAlignment(
  anchored: AnchoredSkyMask,
  attitude: CameraAttitude,
  lens: FrameLens
): MaskAlignment | null {
  const maskAxes = axesFromAttitude(anchored.attitude);
  const viewAxes = axesFromAttitude(attitude);

  const centre = projectWithAxes(maskAxes.forward, viewAxes, lens);
  const right = projectWithAxes(maskEdge(maskAxes, lens, "right"), viewAxes, lens);
  const bottom = projectWithAxes(maskEdge(maskAxes, lens, "bottom"), viewAxes, lens);
  if (!centre || !right || !bottom) return null;

  // Percentages of width and of height are different angles, so the two are put
  // on one scale — the lens's own half-extents — before an angle is taken off
  // them. That scale is the frame's aspect ratio, which is the pixel grid the
  // transform ends up in, so the rotation and the scale come out in it directly.
  const columnX = ((right.left - centre.left) * lens.horizontalScale) / (50 * lens.horizontalScale);
  const columnY = ((right.top - centre.top) * lens.verticalScale) / (50 * lens.horizontalScale);
  const rowX = ((bottom.left - centre.left) * lens.horizontalScale) / (50 * lens.verticalScale);
  const rowY = ((bottom.top - centre.top) * lens.verticalScale) / (50 * lens.verticalScale);

  return {
    centre,
    rotationDeg: toDegrees(Math.atan2(columnY, columnX)),
    scale: (Math.hypot(columnX, columnY) + Math.hypot(rowX, rowY)) / 2
  };
}

/** The direction through the middle of one edge of the mask's own frame. */
function maskEdge(axes: CameraAxes, lens: FrameLens, edge: "right" | "bottom"): EnuPosition {
  const along = edge === "right" ? axes.right : axes.up;
  const scale = edge === "right" ? lens.horizontalScale : -lens.verticalScale;

  return {
    east: axes.forward.east + along.east * scale,
    north: axes.forward.north + along.north * scale,
    up: axes.forward.up + along.up * scale
  };
}
