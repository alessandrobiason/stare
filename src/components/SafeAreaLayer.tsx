import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  children: React.ReactNode;
  /**
   * Laid over the layer's own. The insets are not negotiable; how the children
   * are arranged inside them is the caller's business.
   */
  style?: StyleProp<ViewStyle>;
};

/**
 * The screen's safe area, as a layer over a picture that fills the whole of it.
 *
 * The app is full screen: the camera is the background, edge to edge, and
 * nothing insets it. A picture with the notch's height of black above it and
 * the home indicator's below is a smaller picture rather than a safer one, and
 * on a tall phone that is a third of the screen spent on nothing.
 *
 * What does have to be inset is everything written *over* it, which is what
 * this is for. The panels place themselves absolutely as they always have —
 * `top: 20`, `bottom: 12`, a corner each — and an absolutely positioned child
 * is placed against its parent's padding box, so putting them in here is the
 * whole of the change: the corner each one measures from becomes the safe one
 * instead of the screen's. Nothing else about a panel knows this exists.
 *
 * `pointerEvents: "box-none"`, so the layer is not a sheet of glass over the
 * sky: a tap between the panels falls through to the picture underneath, which
 * is the one control the normal view has (`SkyOverlay`). Only the panels
 * themselves take touches.
 *
 * The insets come from `react-native-safe-area-context` — the phone's real
 * ones, read from the window rather than assumed from a screen size, and the
 * same numbers in the replay harness, where a browser reports
 * `env(safe-area-inset-*)` and every one of them is zero. They are applied here
 * as padding rather than by the library's own `SafeAreaView` so that the
 * mechanism above is a line of code rather than a component's behaviour: this
 * layer is the only place in the app that knows what a notch is, and what it
 * does with that has to be readable.
 *
 * Both roots mount `SafeAreaProvider` (`src/App.tsx`, `testing/replay/App.tsx`);
 * without one, `useSafeAreaInsets` throws rather than quietly reporting zero,
 * which is the failure worth having — an app that has silently stopped insetting
 * anything looks fine until it is held in front of a notch.
 */
export const SafeAreaLayer: React.FC<Props> = ({ children, style }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.layer,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right
        },
        style
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    // In the style rather than as the `pointerEvents` prop, which both React
    // Native and the web have moved on from and the latter warns about.
    pointerEvents: "box-none"
  }
});

export default SafeAreaLayer;
