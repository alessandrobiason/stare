import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fill, strings } from "../i18n";
import { panelStyles, theme } from "./theme";

type Props = {
  markerCount: number;
  /** Whether boot reported anything degraded; the detail is on the debug page. */
  warned?: boolean;
};

/**
 * How many markers the last frame placed, and nothing else.
 *
 * Everything this panel used to carry — the fix, the attitude, the sky mask and
 * boot's warnings — is a readout rather than a thing to look at, and readouts
 * belong on the debug pages, which is where they now are (`statusSection`). The
 * count stays on the normal view because it is the one figure that says whether
 * the view is working at all: a sky with no markers is either a filtered sky, a
 * clouded one, or a broken one, and the number is the first half of that answer.
 *
 * What it counts is said once, on the intro's third page, beside a copy of this
 * panel — a bare number over a photograph explains nothing on its own, and a
 * caption here would be a permanent word over the sky for the sake of the first
 * thirty seconds of the first launch. See `introPages`.
 *
 * A warning tints the number rather than printing itself here. Boot's warnings
 * last the whole session, so spelling them out means a permanent paragraph over
 * the sky on any phone missing a sensor; the tint says to go and read the
 * console's STATUS page, and costs no space.
 */
export const SceneStatus: React.FC<Props> = ({ markerCount, warned = false }) => (
  <View
    style={[panelStyles.panel, styles.status, warned && styles.warned]}
    accessibilityLabel={fill(strings().scene.visibleSatellites, { count: markerCount })}
  >
    <Text style={[styles.count, warned && styles.countWarned]}>{markerCount}</Text>
  </View>
);

const styles = StyleSheet.create({
  status: {
    // Nothing here is touchable, and it sits over the picture.
    pointerEvents: "none",
    top: 20,
    left: 12,
    minWidth: 40,
    alignItems: "center",
    paddingVertical: 6,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  warned: {
    borderWidth: 1,
    borderColor: theme.color.warning
  },
  count: {
    color: theme.color.textBright,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  countWarned: {
    color: theme.color.warning
  }
});

export default SceneStatus;
