import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "./theme";

type Props = {
  on: boolean;
  onToggle: () => void;
};

/**
 * The one control that switches the view between its two modes: normal, and
 * normal plus everything the debug overlay adds.
 *
 * Bottom right, thumb-sized and always in the same place, so the way out of
 * debug mode is where the way in was. `memo` because the scene around it
 * re-renders on every animation frame and this never changes.
 */
export const DebugToggle: React.FC<Props> = React.memo(({ on, onToggle }) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel="Debug mode"
    accessibilityState={{ checked: on }}
    style={[styles.pill, on && styles.pillOn]}
    onPress={onToggle}
  >
    <Text style={[styles.label, on && styles.labelOn]}>DEBUG</Text>
  </Pressable>
));

DebugToggle.displayName = "DebugToggle";

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: 12,
    bottom: 12,
    height: 38,
    minWidth: 82,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.color.divider,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.panel
  },
  pillOn: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.controlActive
  },
  label: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1
  },
  labelOn: {
    color: theme.color.accent
  }
});

export default DebugToggle;
