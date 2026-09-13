import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { SceneTab } from "../hooks/useSceneControls";
import { Icon, IconName } from "./Icon";
import { glass, theme } from "./theme";

type Props = {
  tab: SceneTab;
  onSelect: (tab: SceneTab) => void;
  /**
   * Whether boot reported anything degraded. A dot on the settings tab, which
   * is where the console that explains it lives — see `SettingsScreen`.
   */
  warned?: boolean;
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
 * The bar sits inside the safe area (`SafeAreaLayer`), so on a phone with a
 * home indicator it stops above it rather than under it.
 */
export const TabBar: React.FC<Props> = React.memo(({ tab, onSelect, warned = false }) => {
  // The three labels are words, and nothing else here changes when the
  // console's picker changes the language. See `useLocale`.
  useLocale();
  const t = strings().tabs;

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map(({ id, icon }) => {
        const on = id === tab;
        return (
          <Pressable
            key={id}
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
                size={21}
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: 8,
    paddingBottom: 8,
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
    gap: 4,
    // A thumb-sized target, which is the whole point of a tab bar.
    minHeight: 44
  },
  label: {
    color: theme.color.textDim,
    fontSize: 10,
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
