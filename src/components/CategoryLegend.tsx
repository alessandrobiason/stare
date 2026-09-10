import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "../satellite/categories";
import { cssColor, MarkerPalette } from "./palette";
import { panelStyles, theme } from "./theme";
import { Toggle } from "./Toggle";

type Props = {
  enabledCategories: Set<SatelliteCategory>;
  onToggleCategory: (category: SatelliteCategory) => void;
  /**
   * Whether Starlink is drawn. Its own row under communications rather than a
   * category of its own — see `isStarlink` for why it is singled out at all.
   */
  starlink: boolean;
  onToggleStarlink: () => void;
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

/** The category Starlink's row hangs off, because that is what Starlink is. */
const STARLINK_PARENT: SatelliteCategory = "COMMS";

/**
 * The one row in this panel whose label is not translated.
 *
 * It is the name its operator gave it, and there is no Italian for "Starlink"
 * — the same reason the fleet names in the breakdown are not in `src/i18n`
 * either (see `src/satellite/fleets.ts`). Upper-cased to sit in the same
 * column as the category labels, which are written that way in every language.
 */
const STARLINK_LABEL = "STARLINK";

/**
 * How many switches the panel carries: the five categories, and Starlink.
 *
 * The count beside the closed title is out of this rather than out of the
 * taxonomy, because what it answers is "is this panel hiding anything", and
 * Starlink switched off hides about half the sky.
 */
const FILTER_ROWS = SATELLITE_CATEGORIES.length + 1;

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
  starlink,
  onToggleStarlink,
  onEnableAll,
  palette
}) => {
  // The one thing that gets through the memo above: none of these props change
  // when the console's picker changes the language, and every word in the panel
  // does. See `useLocale`.
  useLocale();
  const t = strings().filter;
  const [expanded, setExpanded] = useState(false);
  // Rows rather than categories: Starlink has a switch of its own in the list,
  // so it is one of the things the count is counting. Off with everything else
  // on, the closed pill has to say the sky is being edited — which is the whole
  // job of this figure.
  //
  // Counted only while its category is on, because that is when its switch is
  // the thing deciding anything: with communications off, Starlink is off
  // whatever its own row says, and the row is drawn dimmed to match.
  const enabledCount =
    SATELLITE_CATEGORIES.filter((category) => enabledCategories.has(category)).length +
    (starlink && enabledCategories.has(STARLINK_PARENT) ? 1 : 0);
  const filtering = enabledCount < FILTER_ROWS;

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
            {enabledCount}/{FILTER_ROWS}
          </Text>
        )}
        <Text style={styles.chevron}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {expanded && (
        <>
          {/* Capped and scrollable rather than left to grow: six rows plus the
              two key rows is already close to what the smallest screen this
              ships to has room for below `top: 24`, and a translation running
              to two lines — or a phone's own larger text size — is exactly the
              margin that tips it over. Scrolling here is what keeps SHOW ALL
              below the last row on every phone instead of past the bottom of
              the screen on some of them, the same fix `DebugPanel` and
              `LanguagePicker` use for the same reason. */}
          <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
            {SATELLITE_CATEGORIES.map((category) => {
              const enabled = enabledCategories.has(category);
              // Starlink is drawn only where its own switch and its category's
              // both say so, so its row reads as off under either.
              const starlinkDrawn = enabled && starlink;
              return (
                <React.Fragment key={category}>
                  <Pressable style={styles.row} onPress={() => onToggleCategory(category)}>
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

                  {/* Indented under communications rather than listed beside it,
                      because it is not a sixth alternative to the five: it is one
                      operator inside one of them, and the row says so by sitting
                      under its parent in its parent's colour. Its own switch all
                      the same — see `isStarlink`. */}
                  {category === STARLINK_PARENT && (
                    <Pressable style={[styles.row, styles.subRow]} onPress={onToggleStarlink}>
                      <View
                        style={[
                          styles.swatch,
                          styles.subSwatch,
                          {
                            backgroundColor: palette.categories[STARLINK_PARENT],
                            borderColor: cssColor(palette.outline),
                            opacity: starlinkDrawn ? 1 : DIMMED_SWATCH_OPACITY
                          }
                        ]}
                      />
                      <Text
                        style={[
                          styles.label,
                          styles.subLabel,
                          { opacity: starlinkDrawn ? 1 : DIMMED_TEXT_OPACITY }
                        ]}
                      >
                        {STARLINK_LABEL}
                      </Text>
                      <Toggle on={starlink} />
                    </Pressable>
                  )}
                </React.Fragment>
              );
            })}
            <View style={styles.keyRow}>
              <View style={[styles.swatch, styles.ringSwatch]} />
              <Text style={styles.keyLabel}>{t.ringKey}</Text>
            </View>
            {/* The other thing a mark says that its colour does not. Drawn at the
                same strength the sky draws it at, so the swatch is the mark. */}
            <View style={styles.keyRow}>
              <View style={[styles.swatch, styles.shadowSwatch]} />
              <Text style={styles.keyLabel}>{t.shadowKey}</Text>
            </View>
          </ScrollView>

          {/* Outside the scroll on purpose: the one row here someone is likely
              to want with the categories already scrolled out of view, so it
              stays where a tap can reach it rather than scrolling away with
              them. */}
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
const SUB_SWATCH_SIZE = 7;

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
  rows: {
    // The same budget `BootScreen`'s own scrollable panel uses: room for the
    // whole list on an ordinary render, and a hard ceiling under a two-line
    // translation or a phone's own larger text size, so growth past that
    // turns into a scroll rather than into the bottom of the screen.
    maxHeight: 260,
    flexGrow: 0
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
  subRow: {
    // Stepped in under its parent, and tightened up against it: the pair is one
    // block of the list rather than two entries that happen to be adjacent.
    marginTop: -3,
    paddingLeft: 12,
    minHeight: 22
  },
  subSwatch: {
    // Smaller than a category's, which is the other half of saying it sits
    // inside one rather than beside it.
    width: SUB_SWATCH_SIZE,
    height: SUB_SWATCH_SIZE,
    borderRadius: SUB_SWATCH_SIZE / 2,
    borderWidth: 1,
    marginRight: 7 + (SWATCH_SIZE - SUB_SWATCH_SIZE) / 2
  },
  subLabel: {
    fontSize: 9,
    color: theme.color.textDim
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
  shadowSwatch: {
    // `SHADOW_ALPHA` in `markerScene.ts`, which is what the sky draws these at.
    opacity: 0.5,
    backgroundColor: theme.color.textDim,
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
