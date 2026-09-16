import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import {
  CATEGORY_COLORS,
  SATELLITE_CATEGORIES,
  SATELLITE_SUBCATEGORIES,
  SatelliteCategory,
  SatelliteSubcategory,
  SUBCATEGORIES_OF
} from "../satellite/categories";
import { cssColor } from "./palette";
import { glass, lift, theme } from "./theme";
import { Toggle } from "./Toggle";

type Props = {
  /** Whether the panel is down from its button. The header's icon owns this. */
  open: boolean;
  enabledCategories: Set<SatelliteCategory>;
  onToggleCategory: (category: SatelliteCategory) => void;
  /**
   * Which subcategories are drawn: each a row indented under its category
   * rather than a category of its own. See `SUBCATEGORIES_OF`.
   */
  enabledSubcategories: Set<SatelliteSubcategory>;
  onToggleSubcategory: (subcategory: SatelliteSubcategory) => void;
  onEnableAll: () => void;
};

const DIMMED_SWATCH_OPACITY = 0.25;
const DIMMED_TEXT_OPACITY = 0.45;

/**
 * How many switches the panel carries: every category, and every subcategory
 * under the ones that are split.
 *
 * The count in the title is out of this rather than out of the categories,
 * because what it answers is "is this panel hiding anything", and Starlink
 * switched off hides about half the sky.
 */
const FILTER_ROWS = SATELLITE_CATEGORIES.length + SATELLITE_SUBCATEGORIES.length;

/**
 * Per-purpose visibility filter, the key to the marks' colours, and the key to
 * the two kinds of mark that are not the ordinary point.
 *
 * It hangs from the layers button in the top right and is not on the screen at
 * all until that button is pressed. The filter is set once and then left alone,
 * while the sky behind it is the whole point of the screen — so what used to be
 * a pill saying FILTER over the picture is now an icon, and the panel is what
 * the icon opens.
 *
 * Open, it is the full list. Each purpose carries its colour as a point of light
 * — a pastel dot in a halo of itself, the way the sky draws it at night — and
 * the same colour is on the card, so the list is the key and nothing else has to
 * be. The last two rows carry a neutral swatch instead, since they are true of a
 * mark of any colour, and they carry no toggle and filter nothing: they are
 * there to explain why a good quarter of the markers on a southward frame are
 * rings that never move, and why half of them on a clear night are drawn
 * faintly.
 *
 * Whether it is hiding anything is said in its own title — `9/12` — and on the
 * button, which is lit while the panel is open. A sky missing three quarters of
 * its markers has to read as a setting rather than as a fault.
 *
 * `memo` for the same reason as `DebugPanel`: the view around it re-renders on
 * every animation frame, and none of those frames can change a filter nobody
 * has touched.
 */
export const CategoryLegend: React.FC<Props> = React.memo(({
  open,
  enabledCategories,
  onToggleCategory,
  enabledSubcategories,
  onToggleSubcategory,
  onEnableAll
}) => {
  // The one thing that gets through the memo above: none of these props change
  // when the console's picker changes the language, and every word in the panel
  // does. See `useLocale`.
  useLocale();
  const t = strings().filter;
  // Rows rather than categories: a subcategory has a switch of its own in the
  // list, so it is one of the things the count is counting.
  //
  // Counted only while its category is on, because that is when its switch is
  // the thing deciding anything: with a category off, its subcategories are off
  // whatever their own rows say, and the rows are drawn dimmed to match.
  const enabledCount = SATELLITE_CATEGORIES.reduce(
    (count, category) =>
      enabledCategories.has(category)
        ? count +
          1 +
          SUBCATEGORIES_OF[category].filter((sub) => enabledSubcategories.has(sub)).length
        : count,
    0
  );
  const filtering = enabledCount < FILTER_ROWS;

  if (!open) return null;

  return (
    <View style={styles.panel} accessibilityLabel={t.open}>
      <View style={styles.head}>
        <Text style={styles.title}>{t.title}</Text>
        {filtering && (
          <Text style={styles.count}>
            {enabledCount}/{FILTER_ROWS}
          </Text>
        )}
      </View>

      {/* Capped and scrollable rather than left to grow: six categories, six
          subcategories and the two key rows are more than the smallest screen
          this ships to has room for under the header, and a translation running to two lines
          — or a phone's own larger text size — is exactly the margin that tips
          it over. Scrolling here is what keeps SHOW ALL below the last row on
          every phone instead of past the bottom of the screen on some of them,
          the same fix `DebugPanel` uses for the same
          reason. */}
      <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
        {SATELLITE_CATEGORIES.map((category) => {
          const enabled = enabledCategories.has(category);
          return (
            <React.Fragment key={category}>
              <Pressable style={styles.row} onPress={() => onToggleCategory(category)}>
                <View
                  style={[
                    styles.swatch,
                    swatchColors(category),
                    { opacity: enabled ? 1 : DIMMED_SWATCH_OPACITY }
                  ]}
                />
                <Text style={[styles.label, { opacity: enabled ? 1 : DIMMED_TEXT_OPACITY }]}>
                  {t.categories[category]}
                </Text>
                <Toggle on={enabled} />
              </Pressable>

              {/* Indented under their category rather than listed beside it,
                  because they are not alternatives to the categories: each is
                  a part of one, and the row says so by sitting under its parent
                  in its parent's colour. Their own switches all the same. */}
              {SUBCATEGORIES_OF[category].map((subcategory) => {
                // Drawn only where its own switch and its category's both say
                // so, so its row reads as off under either.
                const drawn = enabled && enabledSubcategories.has(subcategory);
                return (
                  <Pressable
                    key={subcategory}
                    style={[styles.row, styles.subRow]}
                    onPress={() => onToggleSubcategory(subcategory)}
                  >
                    <View
                      style={[
                        styles.swatch,
                        styles.subSwatch,
                        swatchColors(category),
                        { opacity: drawn ? 1 : DIMMED_SWATCH_OPACITY }
                      ]}
                    />
                    <Text
                      style={[
                        styles.label,
                        styles.subLabel,
                        { opacity: drawn ? 1 : DIMMED_TEXT_OPACITY }
                      ]}
                    >
                      {t.subcategories[subcategory]}
                    </Text>
                    <Toggle on={enabledSubcategories.has(subcategory)} />
                  </Pressable>
                );
              })}
            </React.Fragment>
          );
        })}

        <View style={styles.keyRow}>
          <View style={[styles.swatch, styles.ringSwatch]} />
          <Text style={styles.keyLabel}>{t.ringKey}</Text>
        </View>
      </ScrollView>

      {/* Outside the scroll on purpose: the one row here somebody is likely to
          want with the categories already scrolled out of view, so it stays
          where a tap can reach it rather than scrolling away with them. */}
      <Pressable onPress={onEnableAll} style={styles.showAll}>
        <Text style={styles.showAllText}>{t.showAll}</Text>
      </Pressable>
    </View>
  );
});
CategoryLegend.displayName = "CategoryLegend";

/**
 * A category's swatch as a point of light: its colour, in a band of the same
 * colour thinned out, which is the glow the sky draws round the mark at night.
 */
function swatchColors(category: SatelliteCategory) {
  const color = CATEGORY_COLORS[category];
  return { backgroundColor: color, borderColor: cssColor({ color, alpha: 0.3 }) };
}

const SWATCH_SIZE = 10;
const SUB_SWATCH_SIZE = 7;

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    // Under the header's own row: 6 down, a 40pt button, and a gap.
    top: 54,
    right: 16,
    // Wide enough for the longest category name any language has — Spanish's
    // `OBSERVACIÓN TERRESTRE` at 150 points — beside its switch, and no
    // wider: this hangs over the sky.
    width: 248,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 4,
    borderRadius: theme.radius.panel,
    ...glass(theme.color.panelDeep, 24),
    ...lift
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6
  },
  title: {
    flex: 1,
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4
  },
  count: {
    color: theme.color.accent,
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  rows: {
    // The same budget `BootScreen`'s own scrollable panel uses: room for the
    // whole list on an ordinary render, and a hard ceiling under a two-line
    // translation or a phone's own larger text size, so growth past that
    // turns into a scroll rather than into the bottom of the screen.
    maxHeight: 300,
    flexGrow: 0
  },
  row: {
    // Was a fixed height; a two-line label in a long language has to be able
    // to push the row taller rather than being cut off inside it.
    minHeight: 34,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center"
  },
  subRow: {
    // Stepped in under its parent, and tightened up against it: the pair is one
    // block of the list rather than two entries that happen to be adjacent.
    marginTop: -4,
    paddingLeft: 14,
    minHeight: 28
  },
  subSwatch: {
    // Smaller than a category's, which is the other half of saying it sits
    // inside one rather than beside it.
    width: SUB_SWATCH_SIZE,
    height: SUB_SWATCH_SIZE,
    borderRadius: SUB_SWATCH_SIZE / 2,
    borderWidth: 1.5,
    marginRight: 9 + (SWATCH_SIZE - SUB_SWATCH_SIZE) / 2
  },
  subLabel: {
    fontSize: 11,
    color: theme.color.textDim,
    letterSpacing: 0
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    marginRight: 9,
    borderWidth: 2
  },
  ringSwatch: {
    // A band with the panel showing through, as the sky shows through the
    // ring. Neutral, because a mark of any colour can be one.
    backgroundColor: "transparent",
    borderWidth: 2.5,
    borderColor: theme.color.textDim
  },
  label: {
    flex: 1,
    // A translated category is longer than the English it replaces, and the
    // panel is a sheet over the sky rather than a page: the row grows with the
    // word, and the word wraps rather than running under the switch.
    marginRight: 8,
    color: theme.color.text,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  keyRow: {
    marginTop: 4,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth * 2,
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
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: theme.color.divider
  },
  showAllText: {
    color: theme.color.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2
  }
});
