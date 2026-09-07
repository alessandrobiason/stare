import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { strings } from "../i18n";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "../satellite/categories";
import { cssColor, MarkerPalette } from "./palette";
import { panelStyles, theme } from "./theme";
import { Toggle } from "./Toggle";

type Props = {
  enabledCategories: Set<SatelliteCategory>;
  onToggleCategory: (category: SatelliteCategory) => void;
  onEnableAll: () => void;
  /**
   * The colours the sky is currently drawn in. The swatches are markers rather
   * than squares of colour, so they have to be the markers being drawn now:
   * through twilight the whole palette moves, and a key that stayed on the
   * night set would be pointing at colours that are no longer on the frame.
   */
  palette: MarkerPalette;
};

const DIMMED_SWATCH_OPACITY = 0.25;
const DIMMED_TEXT_OPACITY = 0.45;

/**
 * Per-category visibility filter, and the key to the two marker shapes.
 *
 * Closed by default, and no larger than its own title until someone asks for
 * it: the filter is set once and then left alone, while the sky behind it is
 * the whole point of the screen. Open, it is the full list — the swatches are
 * the markers rather than plain squares of colour, because the overlay says as
 * much with shape as with hue, and the last row carries no toggle and filters
 * nothing: it is there to explain why a good quarter of the markers on a
 * southward frame are rings that never move.
 *
 * Closed, it still has to say whether it is hiding anything, or a sky missing
 * three quarters of its markers looks like a bug rather than a setting — hence
 * the count beside the title whenever a category is switched off.
 *
 * `memo` for the same reason as `DebugPanel`: the view around it re-renders on
 * every animation frame, and none of those frames can change a filter nobody
 * has touched.
 */
export const CategoryLegend: React.FC<Props> = React.memo(({
  enabledCategories,
  onToggleCategory,
  onEnableAll,
  palette
}) => {
  const t = strings().filter;
  const [expanded, setExpanded] = useState(false);
  const enabledCount = SATELLITE_CATEGORIES.filter((category) =>
    enabledCategories.has(category)
  ).length;
  const filtering = enabledCount < SATELLITE_CATEGORIES.length;

  return (
    <View style={[panelStyles.panel, styles.position, !expanded && styles.closed]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.open}
        aria-expanded={expanded}
        style={[styles.header, expanded ? styles.headerOpen : styles.headerClosed]}
        hitSlop={expanded ? { top: 10, bottom: 5, left: 12, right: 12 } : undefined}
        onPress={() => setExpanded((open) => !open)}
      >
        <Text style={[panelStyles.title, styles.headerTitle]}>{t.title}</Text>
        {filtering && (
          <Text style={styles.count}>
            {enabledCount}/{SATELLITE_CATEGORIES.length}
          </Text>
        )}
        <Text style={styles.chevron}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {expanded && (
        <>
          {SATELLITE_CATEGORIES.map((category) => {
            const enabled = enabledCategories.has(category);
            return (
              <Pressable
                key={category}
                style={styles.row}
                onPress={() => onToggleCategory(category)}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: palette.categories[category],
                      borderColor: cssColor(palette.outline),
                      opacity: enabled ? 1 : DIMMED_SWATCH_OPACITY
                    }
                  ]}
                />
                <Text style={[styles.label, { opacity: enabled ? 1 : DIMMED_TEXT_OPACITY }]}>
                  {t.categories[category]}
                </Text>
                <Toggle on={enabled} />
              </Pressable>
            );
          })}
          <View style={styles.keyRow}>
            <View style={[styles.swatch, styles.ringSwatch]} />
            <Text style={styles.keyLabel}>{t.ringKey}</Text>
          </View>
          <Pressable onPress={onEnableAll} style={styles.showAll}>
            <Text style={styles.showAllText}>{t.showAll}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
});
CategoryLegend.displayName = "CategoryLegend";

const SWATCH_SIZE = 10;

const styles = StyleSheet.create({
  position: {
    top: 24,
    right: 12,
    backgroundColor: theme.color.panelLight
  },
  closed: {
    // The padding moves onto the header, so the whole pill is the tap target
    // rather than a line of text with dead margin around it.
    padding: 0
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    gap: 8
  },
  headerClosed: {
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  headerOpen: {
    marginBottom: 7
  },
  headerTitle: {
    // The shared title carries the gap to the rows below it; the header owns
    // that spacing here, because there is nothing below it when closed.
    marginBottom: 0
  },
  count: {
    color: theme.color.accent,
    fontSize: 9,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  chevron: {
    color: theme.color.textFaint,
    fontSize: 9,
    fontWeight: "700"
  },
  row: {
    minWidth: 164,
    // Was a fixed height; a two-line label in a long language has to be able
    // to push the row taller rather than being cut off inside it.
    minHeight: 26,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center"
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    marginRight: 7,
    // Rimmed like the marks on the sky are; the colour comes from the palette.
    borderWidth: 1.5
  },
  ringSwatch: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: theme.color.textDim
  },
  label: {
    flex: 1,
    // A translated category is longer than the English it replaces, and the
    // panel is a pill over the sky rather than a page: the row grows with the
    // word, and the word wraps rather than running under the toggle.
    marginRight: 6,
    color: theme.color.text,
    fontSize: 10,
    fontWeight: "600"
  },
  keyRow: {
    marginTop: 4,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.color.divider
  },
  keyLabel: {
    flex: 1,
    color: theme.color.textFaint,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.4
  },
  showAll: {
    marginTop: 6,
    alignItems: "center",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: theme.color.divider
  },
  showAllText: {
    color: theme.color.textBright,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1
  }
});
