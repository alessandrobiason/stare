import { GestureResponderEvent } from "react-native";
import { TapPoint } from "./markerHitTest";

/**
 * Where a press landed, in the pressed element's own pixels — measured, because
 * on the web nothing hands it over.
 *
 * `react-native-web` raises `onPress` from the DOM's `click` rather than through
 * the responder system, and says so in as many words (`PressResponder`): the
 * event's `nativeEvent` is a `MouseEvent`, and a `MouseEvent` has no
 * `locationX`. Reading those fields in a browser yields `undefined` on every
 * press, which is how tapping a satellite in the replay harness came to do
 * nothing at all while doing exactly the right thing on a phone.
 *
 * Measured against `currentTarget` rather than `target`, so the point lands in
 * the same box React Native would have quoted it in whatever the click actually
 * hit — the handler is on the frame, and the frame is what the markers are
 * placed against.
 */
export function pressPoint(event: GestureResponderEvent): TapPoint | null {
  const mouse = event.nativeEvent as unknown as Partial<MouseEvent>;
  const { clientX, clientY, detail } = mouse;
  // `detail` is the click count, and zero means the browser raised this click
  // from a key press on a focused button: the finger's counterpart of the
  // native path's missing `locationX`, and it would otherwise read as a tap on
  // the frame's top-left corner.
  if (!detail) return null;
  if (clientX === undefined || clientY === undefined) return null;

  const target = event.currentTarget as unknown as Element | null;
  if (typeof target?.getBoundingClientRect !== "function") return null;

  const rect = target.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}
