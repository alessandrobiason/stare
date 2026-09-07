import { GestureResponderEvent } from "react-native";
import { TapPoint } from "./markerHitTest";

/**
 * Where a press landed inside the view it was raised on, or nothing.
 *
 * The one platform difference in the tap gesture, kept out of `SkyOverlay` so
 * that view holds no branches for where it is running. On a phone the responder
 * system has already measured the press against the view and `locationX/Y` is
 * the answer; on the web the press arrives as a DOM event, where `offsetX/Y` is
 * measured against whatever element was under the finger — which for a tap on a
 * marker is the marker, not the picture — so the only reliable frame of
 * reference is the client point measured against the box the handler is
 * attached to.
 *
 * Nothing at all is a real answer: a press raised by a keyboard carries no
 * point, and a hit test against a point that was never measured would name
 * whichever satellite happens to sit near the frame's top-left corner.
 */
export function pressPoint(event: GestureResponderEvent): TapPoint | null {
  const { locationX, locationY } = event.nativeEvent;
  if (Number.isFinite(locationX) && Number.isFinite(locationY)) {
    return { x: locationX, y: locationY };
  }

  return webPoint(event);
}

/** What a DOM press is worth: the client point, less the handler's own box. */
function webPoint(event: GestureResponderEvent): TapPoint | null {
  const dom = event as unknown as {
    clientX?: number;
    clientY?: number;
    currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } };
  };
  const clientX = dom.clientX ?? (event.nativeEvent as { clientX?: number }).clientX;
  const clientY = dom.clientY ?? (event.nativeEvent as { clientY?: number }).clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const box = dom.currentTarget?.getBoundingClientRect?.();
  if (!box) return null;

  return { x: (clientX as number) - box.left, y: (clientY as number) - box.top };
}

export default pressPoint;
