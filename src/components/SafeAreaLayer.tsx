import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { EdgeInsets, useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  children: React.ReactNode;
  /**
   * Laid over the layer's own. The insets are not negotiable; how the children
   * are arranged inside them is the caller's business.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Takes the layer off the screen without taking anything in it down.
   *
   * For while something is laid over the whole view — the guide
   * (`IntroScreen`'s `guide` mode). The panels would otherwise show through its
   * dimmed backdrop as a second set of controls under its own, and the guide's
   * button drawn over the ghost of the console is a screen that reads as two.
   * Hidden rather than unmounted, so a filter left open is still open when the
   * guide is put away; and hidden rather than transparent, so a screen reader
   * does not find them behind it either.
   */
  hidden?: boolean;
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
 * `top: 20`, `bottom: 12`, a corner each — and this layer is the box those
 * corners belong to: it is the safe area itself, positioned to it, so a panel
 * measuring from its parent's top-left is measuring from below the clock.
 * Nothing else about a panel knows this exists.
 *
 * The edges are the layer's own `top`/`left`/`right`/`bottom` rather than
 * padding, and that is the whole of what makes it work. React Native's layout
 * engine is not CSS here: an absolutely positioned child with an inset of its
 * own is placed against its parent's *border* box, with the parent's padding
 * added to neither edge (`yoga/algorithm/AbsoluteLayout.cpp`, and no errata
 * switches it — CSS would use the padding box). A padded layer therefore insets
 * nothing at all that places itself in a corner, which is every panel the app
 * has: they sat at the screen's corners with the status bar drawn through the
 * top two. Moving the layer's own edges is what a panel's corner follows.
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
 * by hand rather than by the library's own `SafeAreaView` so that the mechanism
 * above is a line of code rather than a component's behaviour: this layer is
 * the only place in the app that knows what a notch is, and what it does with
 * that has to be readable.
 *
 * Both roots mount `SafeAreaProvider` (`src/App.tsx`, `testing/replay/App.tsx`);
 * without one, `useSafeAreaInsets` throws rather than quietly reporting zero,
 * which is the failure worth having — an app that has silently stopped
 * insetting anything looks fine until it is held in front of a notch.
 */
export const SafeAreaLayer: React.FC<Props> = ({ children, style, hidden = false }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.layer, safeAreaBox(insets), hidden && styles.hidden, style]}>
      {children}
    </View>
  );
};

/**
 * The safe area as a box to position a layer at: each inset becomes the offset
 * of that edge from the screen's.
 *
 * Separate from the component, and the reason is the paragraph above — that
 * these have to be offsets and not padding is a fact about the layout engine
 * rather than about this app, so it is not something the next reader can check
 * by looking at the screen. It is checkable here.
 */
export function safeAreaBox(insets: EdgeInsets): ViewStyle {
  return {
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
    left: insets.left
  };
}

const styles = StyleSheet.create({
  layer: {
    // The offsets come from the insets; this is only what makes them offsets.
    position: "absolute",
    // In the style rather than as the `pointerEvents` prop, which both React
    // Native and the web have moved on from and the latter warns about.
    pointerEvents: "box-none"
  },
  hidden: {
    display: "none"
  }
});

export default SafeAreaLayer;
