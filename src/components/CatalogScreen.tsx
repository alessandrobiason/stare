import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { Icon } from "./Icon";
import { theme } from "./theme";

/**
 * The catalog, which is not built yet.
 *
 * The sky view answers "what is above me now"; the question it cannot answer is
 * "where is the thing I came looking for", because an object below the horizon
 * has no mark to tap. That is what this tab is for, and it is honest about not
 * being here yet rather than being left off the bar: a tab that appears later
 * is a feature nobody was waiting for, and a tab that says what is coming is a
 * promise the screen can keep.
 *
 * The camera keeps running behind it, as it does behind the settings, so
 * leaving is one tap back onto a view that never stopped.
 */
export const CatalogScreen: React.FC = () => {
  // Both lines are words, and nothing in this component changes when the
  // console's picker changes the language. See `useLocale`. The title is the
  // tab's own label, so the bar and the page cannot come to disagree.
  useLocale();
  const t = strings();

  return (
    <View style={styles.screen}>
      <View style={styles.middle}>
        <View style={styles.badge}>
          <Icon name="catalog" size={26} color={theme.color.textDim} />
        </View>
        <Text style={styles.title}>{t.tabs.catalog}</Text>
        <Text style={styles.body}>{t.catalog.soon}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    backgroundColor: theme.color.scrim
  },
  middle: {
    alignItems: "center",
    // Off the middle of the screen by a little, which is where a page with one
    // thing on it reads best: the bottom third is the tab bar's.
    marginBottom: 48
  },
  badge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  title: {
    color: theme.color.textBright,
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 8
  },
  body: {
    textAlign: "center",
    color: theme.color.textDim,
    fontSize: 13,
    lineHeight: 19
  }
});

export default CatalogScreen;
