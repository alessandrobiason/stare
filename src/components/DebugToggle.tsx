import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { CONSOLE_LABEL } from "./consoleLabel";
import { theme } from "./theme";

type Props = {
  on: boolean;
  onToggle: () => void;
  /** Whether boot reported anything degraded; the detail is on the debug page. */
  warned?: boolean;
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
 *
 * A warning tints the label rather than printing itself here. Boot's warnings
 * last the whole session, so spelling them out means a permanent paragraph
 * over the sky on any phone missing a sensor; the tint says to go and read
 * the console's STATUS page, and costs no space.
 */
export const DebugToggle: React.FC<Props> = React.memo(({ on, onToggle, warned = false }) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel={CONSOLE_LABEL}
    accessibilityState={{ checked: on }}
    style={[styles.pill, on && styles.pillOn, warned && styles.pillWarned]}
    onPress={onToggle}
  >
    <Text style={[styles.label, on && styles.labelOn, warned && styles.labelWarned]}>
      {CONSOLE_LABEL}
    </Text>
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
  pillWarned: {
    borderColor: theme.color.warning
  },
  label: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1
  },
  labelOn: {
    color: theme.color.accent
  },
  labelWarned: {
    color: theme.color.warning
  }
});

export default DebugToggle;
