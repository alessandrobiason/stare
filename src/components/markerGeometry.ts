import { FramePoint } from "../camera/projection";
import { SATELLITE_MARKERS } from "../constants";

/** The frame the markers are drawn over, in layout pixels. */
export type FrameSize = { width: number; height: number };

/** How far a marker's own motion carries it across the frame, in pixels. */
export type TrailReach = {
  /** Displacement from the marker to where it will be, in layout pixels. */
  dx: number;
  dy: number;
  /** Its length: the distance the object covers in the trail window. */
  length: number;
};

/**
 * Marker diameter for an object at `rangeKm`, in frame pixels.
 *
 * Logarithmic, because the range within a single frame of sky spans two
 * decades: a linear scale would collapse everything past low orbit into the
 * same dot and spend its whole span on the nearest few hundred kilometres.
 * Clamped at both ends so the marker stays a marker.
 */
export function markerDiameterPx(range: number): number {
  const { nearDiameterPx, farDiameterPx, nearRangeKm, farRangeKm } = SATELLITE_MARKERS;
  if (!(range > nearRangeKm)) return nearDiameterPx;
  const decades = Math.log10(range / nearRangeKm) / Math.log10(farRangeKm / nearRangeKm);
  const scaled = nearDiameterPx - (nearDiameterPx - farDiameterPx) * decades;
  return Math.max(farDiameterPx, scaled);
}

/**
 * How far the object travels between two projected points, in pixels.
 *
 * A displacement rather than a placed box. The tail is drawn as a polygon
 * behind the mark (`markerScene`), so what it needs is a direction and a
 * length, and both come out of the difference between the two points.
 *
 * Both points arrive as percentages of the frame, and the frame is not square,
 * so they are converted to pixels before any length or direction is taken —
 * measured in percent, a diagonal would come out at the wrong angle and the
 * tails would fan away from the direction of travel.
 *
 * `null` when the two points are close enough that the object is holding
 * station, which is the case the ring is drawn for.
 */
export function trailReach(
  from: FramePoint,
  to: FramePoint,
  frame: FrameSize
): TrailReach | null {
  const dx = ((to.left - from.left) / 100) * frame.width;
  const dy = ((to.top - from.top) / 100) * frame.height;
  const length = Math.hypot(dx, dy);
  // Only to keep a degenerate shape off the frame; what actually decides that
  // an object draws no tail is `parked`, settled from its orbit rather than
  // from how short its line came out.
  if (!(length > SATELLITE_MARKERS.minimumTrailPx)) return null;

  return { dx, dy, length };
}

/**
 * Whether a projected point lands on the frame at all.
 *
 * The frame is `0..100` on both axes in these coordinates, so this is the test
 * the projection itself makes when it is asked to keep a point inside the view.
 * It is shared rather than repeated because a marker whose head has left the
 * frame is still drawn while its trail crosses it (`trailOnFrame`), and
 * everything that treats a marker as one of the ones *on screen* — the visible
 * count, the landmark labels, a tap — has to agree about which those are.
 */
export function pointOnFrame(point: FramePoint): boolean {
  return Math.abs(point.left - 50) <= 50 && Math.abs(point.top - 50) <= 50;
}

/**
 * Whether the trail behind a marker crosses the frame, given where the object
 * is and where it is heading.
 *
 * What this is for is the head that has *already* left. A trail is the ground
 * the object has just covered, and at twelve seconds of orbital motion the long
 * ones are a good fraction of the frame across — so dropping a satellite the
 * moment its mark passed the edge cut a tail that was still most of the way
 * across the view, and a phone turning at any speed did it several times a
 * second. What the eye reads there is not a satellite leaving: it is trails
 * being clipped off at the border, which is the flicker the edge had.
 *
 * Kept while its trail is on the frame, the same satellite instead slides out
 * of view the way it arrived — tip last — and the canvas clips what is past the
 * edge, as it already does for the half of a tail that hangs over one.
 *
 * The tail runs *backwards*: from the mark to the reflection of where the
 * object is heading (`markerScene`), which is where it was a trail-window ago.
 * Both points arrive as percentages, and percent is a per-axis scaling of
 * pixels, so the frame is still the box `0..100` and the tail is still a
 * straight segment — the test costs no frame size and no trigonometry. The
 * segment is clipped against the box a slab at a time: it meets the frame when
 * what is left of it after both axes is not empty.
 */
export function trailOnFrame(from: FramePoint, to: FramePoint): boolean {
  const tipLeft = 2 * from.left - to.left;
  const tipTop = 2 * from.top - to.top;

  let enters = 0;
  let leaves = 1;

  const dx = tipLeft - from.left;
  if (dx === 0) {
    if (from.left < 0 || from.left > 100) return false;
  } else {
    const first = -from.left / dx;
    const second = (100 - from.left) / dx;
    enters = Math.max(enters, Math.min(first, second));
    leaves = Math.min(leaves, Math.max(first, second));
  }

  const dy = tipTop - from.top;
  if (dy === 0) {
    if (from.top < 0 || from.top > 100) return false;
  } else {
    const first = -from.top / dy;
    const second = (100 - from.top) / dy;
    enters = Math.max(enters, Math.min(first, second));
    leaves = Math.min(leaves, Math.max(first, second));
  }

  return enters <= leaves;
}

/**
 * Picks which of `points` may carry a label, in the order given.
 *
 * A label is the most expensive thing the overlay can spend, so the ones it
 * spends have to be readable: crew and cargo vehicles share a coordinate with
 * the station they are docked to, and left alone they print four names on top
 * of each other exactly where the one name matters. Earlier points win, so
 * callers order by whatever they want to survive the collision.
 *
 * The clearance is in layout pixels and does not scale with the frame, because
 * the thing being kept apart does not either: a label is set at a fixed size
 * whatever the window is, so shrinking the window brings the names closer
 * together rather than further apart.
 */
export function labellablePoints(points: FramePoint[], frame: FrameSize): boolean[] {
  const clearX = SATELLITE_MARKERS.labelClearancePx.x;
  const clearY = SATELLITE_MARKERS.labelClearancePx.y;
  const placed: { x: number; y: number }[] = [];

  return points.map((point) => {
    const x = (point.left / 100) * frame.width;
    const y = (point.top / 100) * frame.height;
    const collides = placed.some(
      (other) => Math.abs(other.x - x) < clearX && Math.abs(other.y - y) < clearY
    );
    if (collides) return false;
    placed.push({ x, y });
    return true;
  });
}
