import { GestureResponderEvent } from "react-native";
import { pressPoint } from "../src/components/pressPoint";

/**
 * The web implementation, which is the one jest resolves (`moduleFileExtensions`
 * puts `web.ts` first, as the bundler does for the browser). It is also the one
 * that was wrong: `react-native-web` raises `onPress` from a DOM `click`, whose
 * `nativeEvent` carries no `locationX`, so every tap on a satellite in the
 * replay harness was discarded before it reached the hit test.
 */

/** A press on a frame whose top-left corner is at `(100, 40)` on the page. */
function click(overrides: Record<string, unknown> = {}): GestureResponderEvent {
  return {
    nativeEvent: { clientX: 260, clientY: 300, detail: 1, ...overrides },
    currentTarget: {
      getBoundingClientRect: () => ({ left: 100, top: 40 })
    }
  } as unknown as GestureResponderEvent;
}

test("measures the press against the element the handler is on", () => {
  expect(pressPoint(click())).toEqual({ x: 160, y: 260 });
});

test("ignores a click the browser raised from a key press", () => {
  // Chrome reports `clientX: 0, clientY: 0, detail: 0` for one of these, which
  // would otherwise select whatever sits in the frame's top-left corner.
  expect(pressPoint(click({ clientX: 0, clientY: 0, detail: 0 }))).toBeNull();
});

test("has no point to give when the event carries no coordinates", () => {
  expect(pressPoint(click({ clientX: undefined }))).toBeNull();
});
