import React from "react";
import { SafeAreaView, StyleProp, StyleSheet, ViewStyle } from "react-native";

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
 * `box-none`, so the layer is not a sheet of glass over the sky: a tap between
 * the panels falls through to the picture underneath, which is the one control
 * the normal view has (`SkyOverlay`). Only the panels themselves take touches.
 *
 * ---
 *
 * `SafeAreaView` is deprecated in React Native, and this is deliberately the
 * only file that imports it.
 *
 * The replacement is `react-native-safe-area-context`, which is a native
 * module — and a native module is not a thing this app can add for a layout
 * change. `runtimeVersion` is the fingerprint policy, so a new autolinked
 * package changes the hash that decides which installed binaries an
 * over-the-air update may reach (`fingerprint.config.js`): the whole of this
 * interface would then wait on a TestFlight build and Apple's review to reach
 * a phone, instead of the two-minute publish it costs as JavaScript. Deprecated
 * and shipping today beats current and shipping next week for a component whose
 * job is four numbers.
 *
 * It is one import in one file, which is what makes it a swap rather than a
 * migration when the app next takes a native dependency for a reason of its own.
 */
export const SafeAreaLayer: React.FC<Props> = ({ children, style }) => (
  <SafeAreaView pointerEvents="box-none" style={[styles.layer, style]}>
    {children}
  </SafeAreaView>
);

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill
  }
});

export default SafeAreaLayer;
