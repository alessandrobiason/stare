import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { SkySummary } from "../hooks/useAnimatedMarkers";
import { useLocale } from "../hooks/useLocale";
import { fill, strings } from "../i18n";
import { clockTime, sunlightSummary } from "../i18n/format";
import { Icon, IconButton } from "./Icon";
import { glass, lift, theme } from "./theme";
import { useTourTarget } from "./tourTargets";
import { APP_NAME, WORDMARK_WEIGHT, wordmarkTracking } from "./wordmark";

type Props = {
  /**
   * What the last frame put on screen: how many marks, what they are, and
   * whether any of them can be seen from where the phone is standing.
   */
  sky: SkySummary;
  /** Whether the filter panel is open under the button on the right. */
  filterOpen: boolean;
  onToggleFilter: () => void;
  /** Whether the view is frozen, by the button beside the filter's. */
  frozen: boolean;
  /** The moment it froze, while it is. */
  frozenAt: Date | null;
  onToggleFrozen: () => void;
  /**
   * Told how tall this ended up, so the overlay under it knows which band of
   * sky it is covering and can keep satellite names out of it. See
   * `labelKeepOut` in `SkyOverlay`.
   */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * The title of the screen, which is also the one figure the sky view reports.
 *
 * Two lines in the top left and one round button in the top right, and that is
 * the whole of the top of this app. The first line is the app's name, which is
 * what makes a camera picture with dots on it read as a thing somebody built
 * rather than as a phone that has gone wrong. The second is the count — *what
 * is over you right now* — which used to be a bare number in a pill in the same
 * corner and said nothing about what it was counting.
 *
 * **The count opens.** "Twelve" is a number; "eight Starlink, one ISS and three
 * others, all of them in sunlight" is a thing somebody can go and look for.
 * That list is a tap on the line rather than something drawn over the sky,
 * because the sky behind it is the point of the screen — the same trade every
 * panel in this app makes.
 *
 * **The buttons are the filter and the freeze**, and they are buttons rather
 * than labelled pills because the word FILTER over a photograph is a word over
 * a photograph. What the filter opens says what it is (`CategoryLegend`); what
 * the freeze does is not something a pause sign can say on its own, so the
 * tour points at both (`GuideTour`).
 *
 * **A frozen view says so**, in one small line under the count: a still sky
 * with nothing to say it is being held looks exactly like an app that has
 * hung. It carries the time it froze at, which is also the time every card
 * opened from it is describing.
 *
 * A degraded boot is not reported here: it tints the settings tab, which is
 * where the console that explains it now lives. This line is about the sky,
 * not about the phone.
 *
 * Memoized: it renders when the count does, not whenever a sky mask lands on
 * the view above it.
 */
export const SkyHeader: React.FC<Props> = React.memo(({
  sky,
  filterOpen,
  onToggleFilter,
  frozen,
  frozenAt,
  onToggleFrozen,
  onLayout
}) => {
  // Nothing in this component's props changes when the console's picker
  // changes the language, and every word in it does. See `useLocale`.
  useLocale();
  const t = strings().scene;
  const [expanded, setExpanded] = useState(false);
  const countRef = useTourTarget("count");
  const filterRef = useTourTarget("filter");
  const freezeRef = useTourTarget("freeze");
  const { count, fleets } = sky;
  const empty = fleets.rows.length === 0 && fleets.other === 0;
  const counted = fill(t.visibleSatellites, { count });

  return (
    <View style={styles.header} onLayout={onLayout}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={styles.wordmark}>{APP_NAME.toUpperCase()}</Text>

          <Pressable
            ref={countRef}
            accessibilityRole="button"
            // Still what it always said, because it is still the same thing:
            // the number, spelled out for anyone not reading the screen. The
            // replay's end-to-end suite waits on this label to know the app has
            // booted.
            accessibilityLabel={counted}
            aria-expanded={expanded}
            hitSlop={{ top: 8, bottom: 10, left: 8, right: 16 }}
            style={styles.countRow}
            onPress={() => setExpanded((open) => !open)}
          >
            <Text numberOfLines={1} style={styles.count}>
              {counted}
            </Text>
            <Icon
              name="chevron"
              size={12}
              direction={expanded ? "up" : "down"}
              color={theme.color.textFaint}
            />
          </Pressable>

          {frozen && frozenAt && (
            <View style={styles.frozen}>
              <Text numberOfLines={1} style={styles.frozenLabel}>
                {fill(t.freeze.frozenAt, { time: clockTime(frozenAt) })}
              </Text>
            </View>
          )}
        </View>

        {/* Wrapped so the tour can find them: the buttons themselves take no
            ref. The freeze first, so the filter keeps the corner it has
            always had. */}
        <View ref={freezeRef} collapsable={false}>
          <IconButton
            icon="pause"
            label={frozen ? t.freeze.resume : t.freeze.freeze}
            on={frozen}
            toggle
            onPress={onToggleFrozen}
          />
        </View>
        <View ref={filterRef} collapsable={false}>
          <IconButton
            icon="layers"
            label={strings().filter.open}
            on={filterOpen}
            onPress={onToggleFilter}
          />
        </View>
      </View>

      {expanded && (
        <View style={styles.breakdown}>
          {empty ? (
            <Text style={styles.emptyLabel}>{t.breakdown.empty}</Text>
          ) : (
            <Text style={styles.sunlight}>{sunlightSummary(sky)}</Text>
          )}
          {fleets.rows.map((fleet) => (
            <View key={fleet.name} style={styles.fleet}>
              <Text style={styles.fleetName}>{fleet.name}</Text>
              <Text style={styles.fleetCount}>{fleet.count}</Text>
            </View>
          ))}
          {/* Counted rather than hidden: a breakdown that adds up to less than
              the number above it reads as a fault in one of the two. */}
          {fleets.other > 0 && (
            <View style={[styles.fleet, styles.otherRow]}>
              <Text style={[styles.fleetName, styles.otherLabel]}>{t.breakdown.other}</Text>
              <Text style={[styles.fleetCount, styles.otherLabel]}>{fleets.other}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

SkyHeader.displayName = "SkyHeader";

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 6,
    left: 18,
    right: 16,
    // The sky between the title and the button is still sky: a tap there picks
    // a marker, as it does anywhere else on the picture. In the style rather
    // than as the prop, which both React Native and the web have moved on
    // from. See `SafeAreaLayer`.
    pointerEvents: "box-none"
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    pointerEvents: "box-none"
  },
  titles: {
    flex: 1,
    // The writing sits straight on the picture rather than in a pill: this is
    // the title of the screen, and a box around it would make it a panel.
    paddingTop: 2
  },
  wordmark: {
    color: theme.color.textBright,
    // Same size, weight and tracking as the wordmark on the boot screen and
    // the intro, so STARE reads as one mark across all three rather than a
    // headline here and a wordmark there. See `wordmarkTracking`.
    fontSize: 17,
    fontWeight: WORDMARK_WEIGHT,
    letterSpacing: wordmarkTracking(17),
    opacity: 0.92,
    // The one shadow spent on text. A title over a camera picture has no
    // background to be read against, so it carries its own.
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8
  },
  countRow: {
    marginTop: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    // Left to its own width, so the tap lands on the line rather than on the
    // sky beside it.
    alignSelf: "flex-start"
  },
  count: {
    color: theme.color.textDim,
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6
  },
  frozen: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.accentBorder,
    backgroundColor: theme.color.accentSoft
  },
  frozenLabel: {
    color: theme.color.accent,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  breakdown: {
    marginTop: 10,
    alignSelf: "flex-start",
    minWidth: 178,
    maxWidth: 240,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.panel,
    ...glass(),
    ...lift
  },
  sunlight: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider,
    color: theme.color.text,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15
  },
  fleet: {
    minHeight: 20,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center"
  },
  fleetName: {
    flex: 1,
    // A fleet name is a proper noun and does not translate, but it can still be
    // long enough to wrap — `AST SpaceMobile` — so the row grows rather than
    // running the name under its own count.
    marginRight: 10,
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "500"
  },
  fleetCount: {
    color: theme.color.text,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  otherRow: {
    marginTop: 3,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: theme.color.divider
  },
  otherLabel: {
    color: theme.color.textFaint
  },
  emptyLabel: {
    color: theme.color.textFaint,
    fontSize: 11,
    fontWeight: "500"
  }
});

export default SkyHeader;
