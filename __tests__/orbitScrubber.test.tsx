import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GestureResponderEvent, LayoutChangeEvent, PanResponderCallbacks, PanResponderGestureState } from "react-native";
import type { OrbitScrubberProps } from "../src/components/OrbitScrubber";

let mockResponder: PanResponderCallbacks;
let mockLayout: (event: LayoutChangeEvent) => void;

jest.mock("react-native", () => {
  const native = jest.requireActual("react-native-web");
  const react = jest.requireActual("react");
  return {
    ...native,
    View: (props: { onLayout?: (event: LayoutChangeEvent) => void }) => {
      if (props.onLayout) mockLayout = props.onLayout;
      return react.createElement(native.View, props);
    },
    PanResponder: {
      create: (config: PanResponderCallbacks) => {
        mockResponder = config;
        return { panHandlers: {} };
      }
    }
  };
});

// Explicit path: Jest normally selects the browser's range input.
const { OrbitScrubber } = jest.requireActual("../src/components/OrbitScrubber.tsx") as {
  OrbitScrubber: React.FC<OrbitScrubberProps>;
};
const touch = (x: number) => ({ nativeEvent: { locationX: x } }) as GestureResponderEvent;
const move = (dx: number, dy: number) => ({ dx, dy }) as PanResponderGestureState;

function mount() {
  const onChange = jest.fn();
  const onScrubbingChange = jest.fn();
  renderToStaticMarkup(<OrbitScrubber value={0} label="Timeline" valueText="Now" onChange={onChange} onScrubbingChange={onScrubbingChange} />);
  mockLayout({ nativeEvent: { layout: { width: 200 } } } as LayoutChangeEvent);
  return { onChange, onScrubbingChange };
}

test("a drag started on the timeline keeps ownership even when it becomes mostly vertical", () => {
  mount();
  expect(mockResponder.onStartShouldSetPanResponderCapture!(touch(50), move(0, 0))).toBe(true);
  expect(mockResponder.onMoveShouldSetPanResponder!(touch(50), move(10, 120))).toBe(true);
  expect(mockResponder.onPanResponderTerminationRequest!(touch(50), move(10, 120))).toBe(false);
  expect(mockResponder.onShouldBlockNativeResponder!(touch(50), move(10, 120))).toBe(true);
});

test("continues seeking outside the rail in both directions, then restores scrolling on release", () => {
  const { onChange, onScrubbingChange } = mount();
  mockResponder.onPanResponderGrant!(touch(50), move(0, 0));
  expect(onChange).toHaveBeenLastCalledWith(0.25);
  expect(onScrubbingChange).toHaveBeenLastCalledWith(true);
  mockResponder.onPanResponderMove!(touch(130), move(80, 180));
  expect(onChange).toHaveBeenLastCalledWith(0.65);
  mockResponder.onPanResponderMove!(touch(-50), move(-100, -300));
  expect(onChange).toHaveBeenLastCalledWith(0);
  mockResponder.onPanResponderMove!(touch(550), move(500, 400));
  expect(onChange).toHaveBeenLastCalledWith(1);
  mockResponder.onPanResponderMove!(touch(90), move(40, -200));
  expect(onChange).toHaveBeenLastCalledWith(0.45);
  mockResponder.onPanResponderRelease!(touch(90), move(40, -200));
  expect(onScrubbingChange.mock.calls).toEqual([[true], [false]]);
  onChange.mockClear();
  mockResponder.onPanResponderMove!(touch(100), move(50, 200));
  expect(onChange).not.toHaveBeenCalled();
});

test("system cancellation unlocks the card once and a subsequent drag still works", () => {
  const { onChange, onScrubbingChange } = mount();
  mockResponder.onPanResponderGrant!(touch(50), move(0, 0));
  mockResponder.onPanResponderTerminate!(touch(50), move(0, 0));
  mockResponder.onPanResponderRelease!(touch(50), move(0, 0));
  expect(onScrubbingChange.mock.calls).toEqual([[true], [false]]);
  mockResponder.onPanResponderGrant!(touch(100), move(0, 0));
  expect(onChange).toHaveBeenLastCalledWith(0.5);
  mockResponder.onPanResponderRelease!(touch(100), move(0, 0));
  expect(onScrubbingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
});
