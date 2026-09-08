import { MARKER_SELECTION } from "../constants";
import { MarkerFrame, SatelliteMarker } from "../hooks/useAnimatedMarkers";
import { FrameSize, markerDiameterPx, pointOnFrame } from "./markerGeometry";
import { DESIGN_FRAME_WIDTH_PX } from "./markerScene";

/** Where a tap landed, in layout pixels from the frame's top-left corner. */
export type TapPoint = { x: number; y: number };

/**
 * Which satellites a tap is asking about, nearest to the tap first.
 *
 * Pure, and the counterpart of `buildMarkerScene`: that turns a drawn frame
 * into shapes, and this turns a point back into the markers under it, from the
 * same frame and the same sizes. Nothing here knows about touches, React or
 * either canvas — which is what lets a test say exactly what a finger over a
 * cluster picks out.
 *
 * **The target is the finger's size, not the marker's.** A marker is 8 to 17
 * pixels across, and the far end of that is a four-pixel radius: aimed at
 * directly, it is a target most taps miss. So a mark is hit anywhere within
 * `tapRadiusPx` of its centre, or within its own radius when it is drawn larger
 * than that on a big frame.
 *
 * **A tap over a group returns the group.** The sky puts satellites on top of
 * each other — crew vehicles sit on the station they are docked to, and the
 * geostationary belt is a line of markers a few pixels apart — so there is
 * frequently no single right answer to "which one is that". Returning the
 * nearest one alone would silently pick for the person tapping, and one drawn
 * underneath another could never be reached at all. The overlay shows the
 * first, and offers the rest.
 *
 * Ordered by distance from the tap, and where two markers are on the same
 * coordinate, by which of them is drawn on top: `frame.markers` is in painter's
 * order (far to near, landmarks last), so the later of two is the one visibly
 * in front, and it is the one a tap on both of them is asking about.
 *
 * One marker per name, because a name is what everything downstream treats as
 * an object's identity — the card looks a satellite up by it, and the ring
 * finds the mark to draw on by it. CelesTrak's active catalog carries the same
 * name more than once (a run of `TBA - TO BE ASSIGNED` among them), and two
 * chips reading alike would be a choice between indistinguishable things.
 */
export function markersUnder(
  frame: MarkerFrame,
  box: FrameSize,
  tap: TapPoint,
  limit: number = MARKER_SELECTION.maxCandidates
): SatelliteMarker[] {
  if (!(box.width > 0) || !(box.height > 0)) return [];
  const scale = box.width / DESIGN_FRAME_WIDTH_PX;

  const hits: { marker: SatelliteMarker; distancePx: number; depth: number }[] = [];
  frame.markers.forEach((marker, depth) => {
    // Marks on the frame answer for themselves; one kept only because its
    // trail still crosses the frame (`trailOnFrame`) is off the screen, and a
    // tap near an edge must not pick out a satellite there is no mark under.
    if (!pointOnFrame(marker.point)) return;
    const x = (marker.point.left / 100) * box.width;
    const y = (marker.point.top / 100) * box.height;
    const distancePx = Math.hypot(x - tap.x, y - tap.y);
    const reach = Math.max(
      MARKER_SELECTION.tapRadiusPx,
      (markerDiameterPx(marker.rangeKm) * scale) / 2
    );
    if (distancePx <= reach) hits.push({ marker, distancePx, depth });
  });

  hits.sort((first, second) =>
    first.distancePx === second.distancePx
      ? second.depth - first.depth
      : first.distancePx - second.distancePx
  );

  const distinct: SatelliteMarker[] = [];
  const named = new Set<string>();
  for (const hit of hits) {
    if (distinct.length >= limit) break;
    if (named.has(hit.marker.name)) continue;
    named.add(hit.marker.name);
    distinct.push(hit.marker);
  }
  return distinct;
}
