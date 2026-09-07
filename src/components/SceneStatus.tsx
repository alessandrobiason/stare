import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fill, strings } from "../i18n";
import { panelStyles, theme } from "./theme";

type Props = {
  markerCount: number;
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
 * A degraded boot tints the console toggle rather than this panel — see
 * `DebugToggle` — since that is the control that opens the page explaining it.
 */
export const SceneStatus: React.FC<Props> = ({ markerCount }) => (
  <View
    style={[panelStyles.panel, styles.status]}
    accessibilityLabel={fill(strings().scene.visibleSatellites, { count: markerCount })}
  >
    <Text style={styles.count}>{markerCount}</Text>
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
  count: {
    color: theme.color.textBright,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  }
});

export default SceneStatus;
