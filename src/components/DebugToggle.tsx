import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { CONSOLE_LABEL } from "./consoleLabel";
import { theme } from "./theme";

type Props = {
  on: boolean;
  onToggle: () => void;
};

/**
 * The one control that switches the view between its two modes: normal, and
 * normal plus everything the console overlay adds.
 *
 * Bottom right, thumb-sized and always in the same place, so the way out of
 * the console is where the way in was. `memo` because the scene around it
 * re-renders on every animation frame and this never changes.
 *
 * Says "CONSOLE" in every language, which is the one place the app does that
 * — see `CONSOLE_LABEL` for why, and the intro's third page for where it is
 * said out loud.
 */
export const DebugToggle: React.FC<Props> = React.memo(({ on, onToggle }) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel={CONSOLE_LABEL}
    accessibilityState={{ checked: on }}
    style={[styles.pill, on && styles.pillOn]}
    onPress={onToggle}
  >
    <Text style={[styles.label, on && styles.labelOn]}>{CONSOLE_LABEL}</Text>
  </Pressable>
));

DebugToggle.displayName = "DebugToggle";

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: 12,
    bottom: 12,
    height: 38,
    // Wide enough for the longer word this now carries, and the compass
    // notice beside it holds its own edge clear of the same figure.
    minWidth: 92,
    paddingHorizontal: 14,
    borderRadius: 6,
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
