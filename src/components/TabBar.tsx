import React from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { SceneTab } from "../hooks/useSceneControls";
import { Icon, IconName } from "./Icon";
import { glass, theme } from "./theme";
import { useTourTarget } from "./tourTargets";

type Props = {
  tab: SceneTab;
  onSelect: (tab: SceneTab) => void;
  /**
   * Whether boot reported anything degraded. A dot on the settings tab, which
   * is where the console that explains it lives — see `SettingsScreen`.
   */
  warned?: boolean;
  /**
   * Told how much of the safe area the bar takes, in points from its bottom
   * edge: what a sheet over the camera has to stop above (`SkyOverlay`).
   */
  onHeightChange?: (height: number) => void;
};

/** The three tabs, in the order they are shown. */
const TABS: readonly { id: SceneTab; icon: IconName }[] = [
  { id: "sky", icon: "sky" },
  { id: "catalog", icon: "catalog" },
  { id: "settings", icon: "settings" }
];

/**
 * The bottom bar: the sky, the catalog, and everything about the app.
 *
 * What it replaced was a corner of the camera picture with a `?` and the word
 * CONSOLE stacked in it — two controls that are about the app rather than
 * about the sky, sitting on the sky. Everything of that kind now lives behind
 * the third tab, and the picture keeps its corner.
 *
 * It is a bar and not a floating pill because it is the one piece of this
 * layout that is not floating: the sky is a place you are in, and the tabs are
 * the way out of it. Glass like everything else, a hairline along the top, and
 * the active tab lit in the app's accent — the only colour in the bar.
 *
 * The bar is laid out inside the safe area (`SafeAreaLayer`), so its tabs sit
 * above the home indicator rather than under it — but its glass runs on down
 * to the bottom of the screen, as a tab bar on this platform does. Stopped at
 * the safe area it left a strip of camera picture under the bar, which made a
 * bar of the right height look like one squeezed into too little.
 */
export const TabBar: React.FC<Props> = React.memo(({ tab, onSelect, warned = false, onHeightChange }) => {
  // The three labels are words, and nothing else here changes when the
  // console's picker changes the language. See `useLocale`.
  useLocale();
  const t = strings().tabs;
  // The two tabs the tour points at. The sky's own tab is where the tour is
  // already standing, and needs no introduction.
  const catalogRef = useTourTarget("catalog");
  const settingsRef = useTourTarget("settings");
  const tourRefs: Partial<Record<SceneTab, React.RefCallback<View>>> = {
    catalog: catalogRef,
    settings: settingsRef
  };
  // Past the safe area's foot by the home indicator's height, and padded back
  // up by the same, so the glass reaches the screen's edge and the tabs do not.
  const { bottom } = useSafeAreaInsets();
  const onLayout = onHeightChange
    ? ({ nativeEvent }: LayoutChangeEvent) => onHeightChange(nativeEvent.layout.height - bottom)
    : undefined;

  return (
    <View
      style={[styles.bar, { marginBottom: -bottom, paddingBottom: BAR_PADDING_BOTTOM + bottom }]}
      accessibilityRole="tablist"
      onLayout={onLayout}
    >
      {TABS.map(({ id, icon }) => {
        const on = id === tab;
        return (
          <Pressable
            key={id}
            ref={tourRefs[id]}
            accessibilityRole="tab"
            accessibilityLabel={t[id]}
            // The `aria-` form rather than `accessibilityState`, which is what
            // actually reaches the DOM under react-native-web.
            aria-selected={on}
            style={styles.tab}
            onPress={() => onSelect(id)}
          >
            <View>
              <Icon
                name={icon}
                size={23}
                color={on ? theme.color.accent : theme.color.textDim}
              />
              {/* Boot's warnings last the whole session, so spelling them out
                  means a permanent paragraph over the sky on any phone missing
                  a sensor. The dot says to go and read the console's STATUS
                  page, and costs no space. */}
              {id === "settings" && warned && <View style={styles.warned} />}
            </View>
            <Text numberOfLines={1} style={[styles.label, on && styles.labelOn]}>
              {t[id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

TabBar.displayName = "TabBar";

/** Under the labels, above the home indicator (or the screen's edge, without one). */
const BAR_PADDING_BOTTOM = 6;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: 10,
    ...glass(theme.color.panel, 28),
    // The bar is edge to edge: the only hairline it wears is the one along the
    // top, and the border the glass carries would draw three more.
    borderWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: theme.color.dividerStrong
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    // A thumb-sized target, which is the whole point of a tab bar.
    minHeight: 48
  },
  label: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  labelOn: {
    color: theme.color.accent
  },
  warned: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.warning
  }
});

export default TabBar;
