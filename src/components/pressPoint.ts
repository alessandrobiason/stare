import { GestureResponderEvent } from "react-native";
import { TapPoint } from "./markerHitTest";

/**
 * Where a press landed, in the pressed element's own pixels.
 *
 * React Native has already measured it: `locationX`/`locationY` are relative to
 * the element the handler is bound to, which is the box the markers are placed
 * in. There is nothing to do here but check that they are there — a press
 * raised by a keyboard rather than by a finger carries no point, and there is
 * nothing under it to select.
 *
 * The web cannot use this and has to measure its own; `pressPoint.web.ts` says
 * why, and the bundler picks it there.
 */
export function pressPoint(event: GestureResponderEvent): TapPoint | null {
  const { locationX, locationY } = event.nativeEvent;
  if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return null;
  return { x: locationX, y: locationY };
}
