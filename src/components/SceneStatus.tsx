import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { fill, strings } from "../i18n";
import { FleetBreakdown } from "../satellite/fleets";
import { panelStyles, theme } from "./theme";

type Props = {
  markerCount: number;
  /**
   * What those markers are, largest fleet first. The count answers "how many";
   * this is the answer to the question anyone asks straight afterwards.
   */
  fleets: FleetBreakdown;
};

/**
 * How many markers the last frame placed — and, on a tap, what they are.
 *
 * Everything this panel used to carry — the fix, the attitude, the sky mask and
 * boot's warnings — is a readout rather than a thing to look at, and readouts
 * belong on the debug pages, which is where they now are (`statusSection`). The
 * count stays on the normal view because it is the one figure that says whether
 * the view is working at all: a sky with no markers is either a filtered sky, a
 * clouded one, or a broken one, and the number is the first half of that answer.
 *
 * The second half is the breakdown behind it, which is why the number opens.
 * "Twelve" is a number; "eight Starlink, one ISS and three others" is a thing
 * someone can go and look for — and it is what turns a marker count into an
 * answer about the particular sky overhead rather than about the app. Shut by
 * default and shut again on the next tap, like the filter it borrows its shape
 * from: the sky behind it is the whole point of the screen, and this is a list
 * someone asks for rather than one they read continuously.
 *
 * The same panel as the filter in the opposite corner, deliberately — same
 * pill, same title row, same chevron — because they are the same kind of thing:
 * one says what may be drawn, the other what is. That it opens at all is said
 * once, on the intro's third page, beside a copy of this panel; a caption here
 * would be a permanent word over the sky for the sake of the first thirty
 * seconds of the first launch. See `introPages`.
 *
 * A degraded boot tints the console toggle rather than this panel — see
 * `DebugToggle` — since that is the control that opens the STATUS page saying
 * what was degraded, and this number is about the sky rather than the phone.
 */
export const SceneStatus: React.FC<Props> = ({ markerCount, fleets }) => {
  // Nothing in this component's props changes when the console's picker changes
  // the language, and the words in the open panel all do. See `useLocale`.
  useLocale();
  const t = strings().scene;
  const [expanded, setExpanded] = useState(false);
  const empty = fleets.rows.length === 0 && fleets.other === 0;

  return (
    <View style={[panelStyles.panel, styles.status]}>
      <Pressable
        accessibilityRole="button"
        // Still what it always said, because it is still the same thing: the
        // number, spelled out for anyone not reading the screen. The replay's
        // end-to-end suite waits on this label to know the app has booted.
        accessibilityLabel={fill(t.visibleSatellites, { count: markerCount })}
        aria-expanded={expanded}
        style={[styles.header, expanded && styles.headerOpen]}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        onPress={() => setExpanded((open) => !open)}
      >
        <Text style={styles.count}>{markerCount}</Text>
        <Text style={styles.chevron}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.breakdown}>
          <Text style={[panelStyles.title, styles.breakdownTitle]}>{t.breakdown.title}</Text>
          {empty && <Text style={styles.emptyLabel}>{t.breakdown.empty}</Text>}
          {fleets.rows.map((fleet) => (
            <View key={fleet.name} style={styles.row}>
              <Text style={styles.label}>{fleet.name}</Text>
              <Text style={styles.rowCount}>{fleet.count}</Text>
            </View>
          ))}
          {/* Counted rather than hidden: a breakdown that adds up to less than
              the number above it reads as a fault in one of the two. */}
          {fleets.other > 0 && (
            <View style={[styles.row, styles.otherRow]}>
              <Text style={[styles.label, styles.otherLabel]}>{t.breakdown.other}</Text>
              <Text style={[styles.rowCount, styles.otherLabel]}>{fleets.other}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  status: {
    top: 20,
    left: 12,
    minWidth: 40,
    // The padding is the header's, so the whole pill is the tap target rather
    // than a number with dead margin around it — as the filter does.
    padding: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    // Centred shut, because shut the pill is the number: a two-digit count and
    // a three-digit one should both sit in the middle of it rather than
    // hanging off the same left edge.
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  headerOpen: {
    // Open, the number heads a list, and a heading centred over a left-aligned
    // list reads as a different panel from the one below it.
    justifyContent: "flex-start",
    paddingBottom: 2
  },
  count: {
    color: theme.color.textBright,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  chevron: {
    color: theme.color.textFaint,
    fontSize: 9,
    fontWeight: "700"
  },
  breakdown: {
    paddingHorizontal: 10,
    paddingBottom: 10
  },
  breakdownTitle: {
    marginBottom: 6
  },
  row: {
    // Wide enough for a fleet name and its figure, and no wider: this sits over
    // the sky, and the filter's list in the far corner is the same width.
    minWidth: 150,
    minHeight: 20,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center"
  },
  label: {
    flex: 1,
    // A fleet name is a proper noun and does not translate, but it can still be
    // long enough to wrap — `AST SpaceMobile` — so the row grows rather than
    // running the name under its own count.
    marginRight: 8,
    color: theme.color.text,
    fontSize: 10,
    fontWeight: "600"
  },
  rowCount: {
    color: theme.color.textBright,
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  otherRow: {
    marginTop: 3,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: theme.color.divider
  },
  otherLabel: {
    color: theme.color.textFaint
  },
  emptyLabel: {
    minWidth: 150,
    color: theme.color.textFaint,
    fontSize: 10,
    fontWeight: "600"
  }
});

export default SceneStatus;
