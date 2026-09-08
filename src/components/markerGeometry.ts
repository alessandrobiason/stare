import { FramePoint } from "../camera/projection";
import { SATELLITE_MARKERS } from "../constants";

/** The frame the markers are drawn over, in layout pixels. */
export type FrameSize = { width: number; height: number };

/**
 * How the picture is laid over the screen.
 *
 * `cover` fills the screen with it and lets the frame run off the edges;
 * `contain` fits the whole frame into the space available and leaves the rest
 * of the screen empty.
 */
export type FrameFit = "cover" | "contain";

/**
 * The part of the frame someone can actually see, in frame percent.
 *
 * The whole of it under `contain`, and the middle of it under `cover`, where
 * the screen is the window and the frame is wider than the window. Everything
 * outside it is drawn and then clipped, which is what makes the difference
 * invisible to the projection and visible to anything that counts what is on
 * screen.
 */
export type FrameViewport = { left: number; top: number; right: number; bottom: number };

/** The frame entire: what a fitted picture shows, and the default everywhere. */
export const WHOLE_FRAME: FrameViewport = { left: 0, top: 0, right: 100, bottom: 100 };

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
 * everything that treats a marker as one of the ones being *drawn* has to agree
 * about which those are.
 *
 * On the frame is not the same thing as on the screen once the picture covers
 * one — see `pointInViewport`, which is what the visible count asks instead.
 */
export function pointOnFrame(point: FramePoint): boolean {
  return pointInViewport(point, WHOLE_FRAME);
}

/**
 * The box the picture is drawn in, in layout pixels, or `null` before there is
 * a screen to measure it against.
 *
 * The box always carries the camera's own shape, whichever way it is fitted,
 * and that is the whole of why this function exists. Markers and mask are
 * placed in percentages of the frame, so they land where the projection put
 * them only if the box they are placed in covers the field of view they were
 * projected against. Stretching a 4:3 camera onto a 19.5:9 screen instead
 * repoints those percentages at a different piece of sky at a different scale,
 * and the markers drift as the camera moves.
 *
 * So the shape is kept and the size is chosen. `contain` picks the largest box
 * that fits, which leaves the screen part empty — the harness's window, where
 * the whole recorded frame is the thing being looked at. `cover` picks the
 * smallest box that fills the screen, which puts the rest of the frame past its
 * edges: the phone, where the app is a camera and a camera that stops short of
 * the edge of the screen is a picture of a camera. Nothing is scaled or
 * squashed either way, so the projection cannot tell the two apart — under
 * `cover` some of what it places is simply outside the window, and `viewportOf`
 * is how anything that cares about that finds out.
 */
export function frameBoxFor(
  available: FrameSize | null,
  aspectRatio: number,
  fit: FrameFit
): FrameSize | null {
  if (!available || available.width <= 0 || available.height <= 0) return null;
  const filled = available.height * aspectRatio;
  const width =
    fit === "cover" ? Math.max(available.width, filled) : Math.min(available.width, filled);
  return { width, height: width / aspectRatio };
}

/**
 * Which part of `box` the screen is showing, in frame percent.
 *
 * The box is centred in the space available, so what is cut is split evenly
 * between the two edges of whichever axis overflows — and neither axis
 * overflows when the picture is fitted, which is why the answer there is the
 * whole frame.
 */
export function viewportOf(box: FrameSize, available: FrameSize): FrameViewport {
  const across = visibleShare(available.width, box.width);
  const down = visibleShare(available.height, box.height);
  return {
    left: 50 - across * 50,
    right: 50 + across * 50,
    top: 50 - down * 50,
    bottom: 50 + down * 50
  };
}

/** How much of a box's axis fits in the space available, in `(0, 1]`. */
function visibleShare(available: number, box: number): number {
  if (!(box > 0)) return 1;
  return Math.min(1, available / box);
}

/**
 * Whether a projected point lands where someone can see it.
 *
 * The question `pointOnFrame` used to be the whole of: with the picture fitted,
 * the frame and the screen were the same box. Under `cover` they are not, and
 * the two questions come apart — a marker off the window is still on the frame,
 * still drawn, and still clipped. What is drawn is the frame's business (a
 * marker sliding out of view leaves tip last, and its trail is clipped at the
 * edge like any other); what is *counted* is this one's, because the number in
 * the corner is a claim about the sky in front of the person holding the phone.
 */
export function pointInViewport(point: FramePoint, viewport: FrameViewport): boolean {
  return (
    point.left >= viewport.left &&
    point.left <= viewport.right &&
    point.top >= viewport.top &&
    point.top <= viewport.bottom
  );
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
  const tip = { left: 2 * from.left - to.left, top: 2 * from.top - to.top };
  return clipSegment(from, tip, WHOLE_FRAME) !== null;
}

/**
 * The part of a straight segment that lies inside a box, or `null` when none of
 * it does.
 *
 * Both ends arrive in frame percent, and percent is a per-axis scaling of
 * pixels, so a straight line is still straight and the box is still a box: the
 * clip costs no frame size and no trigonometry. It is the parametric one —
 * walk the segment from 0 to 1, let each of the four edges push the entry
 * forward or pull the exit back, and what is left over is the crossing — which
 * answers "does it cross at all" and "where" in the same arithmetic. The
 * markers' trails ask the first question (`trailOnFrame`) and the landmarks'
 * paths ask the second (`clipPolyline`).
 */
export function clipSegment(
  from: FramePoint,
  to: FramePoint,
  box: FrameViewport
): { from: FramePoint; to: FramePoint } | null {
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  let enters = 0;
  let leaves = 1;

  // Each edge as "how fast the segment approaches it" against "how far outside
  // it starts": a segment running parallel to an edge is either wholly inside
  // it or wholly out, and one crossing it moves the entry or the exit.
  const edges: [number, number][] = [
    [-dx, from.left - box.left],
    [dx, box.right - from.left],
    [-dy, from.top - box.top],
    [dy, box.bottom - from.top]
  ];

  for (const [towards, outside] of edges) {
    if (towards === 0) {
      if (outside < 0) return null;
      continue;
    }
    const at = outside / towards;
    if (towards < 0) {
      if (at > leaves) return null;
      if (at > enters) enters = at;
    } else {
      if (at < enters) return null;
      if (at < leaves) leaves = at;
    }
  }

  return {
    from: { left: from.left + dx * enters, top: from.top + dy * enters },
    to: { left: from.left + dx * leaves, top: from.top + dy * leaves }
  };
}

/**
 * A polyline clipped to a box, as the runs of it that survive.
 *
 * What this is for is the sheer length of a landmark's path: an arc from one
 * horizon to the other is most of a full turn of sky, so on a frame spanning
 * sixty degrees the great majority of every path is somewhere off the screen,
 * and the piece of it that crosses the view is a few points out of fifty. The
 * canvas would clip the rest anyway — but not before the segment that leaves
 * the camera's near plane has been handed to it a thousand frames wide
 * (`projectChain`), and not without walking every point of every path on every
 * frame.
 *
 * More than one run comes back when a path leaves the box and re-enters it,
 * which a pass overhead does whenever the phone is held across its line.
 */
export function clipPolyline(points: FramePoint[], box: FrameViewport): FramePoint[][] {
  const runs: FramePoint[][] = [];
  let run: FramePoint[] = [];

  const close = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };

  for (let index = 1; index < points.length; index += 1) {
    const clipped = clipSegment(points[index - 1], points[index], box);
    if (!clipped) {
      close();
      continue;
    }
    // A segment that starts where the last one ended continues the run; one
    // that starts anywhere else has come back into the box somewhere new.
    const tail = run[run.length - 1];
    if (!tail || Math.abs(tail.left - clipped.from.left) > JOIN_EPSILON ||
        Math.abs(tail.top - clipped.from.top) > JOIN_EPSILON) {
      close();
      run.push(clipped.from);
    }
    run.push(clipped.to);
  }

  close();
  return runs;
}

/** How far apart two clipped ends may be and still be the same point, in percent. */
const JOIN_EPSILON = 1e-9;

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
