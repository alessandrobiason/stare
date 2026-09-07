import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { LANGUAGE_NAMES, LOCALES, Locale, setLocale } from "../i18n/locale";
import { theme } from "./theme";

/**
 * The language picker, for the corner of the intro.
 *
 * The app takes its language from the phone and is right nearly always, which
 * is exactly why this has to be visible on the first screen: the launch where
 * the phone is wrong about it is the launch where four pages of explanation
 * are in a language the reader may not have. A picker inside a settings screen
 * they cannot read is not a way out of that; a corner of the first screen is.
 *
 * The pill says the language it is currently in rather than the word
 * "Language" — the whole list is endonyms (`LANGUAGE_NAMES`), so what it shows
 * is legible to whoever is looking for it, and the word behind it is on the
 * control for a screen reader.
 *
 * Once the intro is behind it, the same choice lives on the console's STATUS
 * page (`languageChoice`). This does not follow the app into the sky view: the
 * corners there are the marker count and the filter, and the language is not
 * something anyone changes twice.
 */
export const LanguagePicker: React.FC = () => {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const t = strings().language;

  const choose = useCallback((next: Locale) => {
    // Ordered so the list is closed against the language it was opened in:
    // `setLocale` re-renders this, and the list would otherwise blink through
    // the new one on its way out.
    setOpen(false);
    setLocale(next);
  }, []);

  return (
    <>
      {/* Anywhere else on the screen dismisses the list. Below it in the tree
          and above the pages, so a tap meant for the sky behind an open list
          closes it rather than reaching the pager. */}
      {open && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.close}
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
        />
      )}

      <View style={styles.corner}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.title}: ${LANGUAGE_NAMES[locale]}`}
          accessibilityState={{ expanded: open }}
          style={[styles.pill, open && styles.pillOpen]}
          onPress={() => setOpen((was) => !was)}
        >
          <Text numberOfLines={1} style={styles.pillLabel}>
            {LANGUAGE_NAMES[locale]}
          </Text>
        </Pressable>

        {open && (
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{t.title}</Text>
            {/* Twelve rows is taller than the top half of a small phone, and
                the list hangs from a corner rather than filling the screen. */}
            <ScrollView
              accessibilityRole="radiogroup"
              style={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {LOCALES.map((option) => {
                const on = option === locale;
                return (
                  <Pressable
                    key={option}
                    // What matters about one of these is which is the case,
                    // which is a radio; twelve buttons announce twelve labels
                    // and leave the current language unsaid.
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.option, on && styles.optionOn]}
                    onPress={() => choose(option)}
                  >
                    <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>
                      {LANGUAGE_NAMES[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    </>
  );
};

export default LanguagePicker;

const styles = StyleSheet.create({
  /**
   * The corner itself: the pill, and the list hanging under it.
   *
   * Right-aligned rather than stretched, so the list is as wide as the longest
   * language in it and the sky either side of it is still sky.
   */
  corner: {
    position: "absolute",
    top: 12,
    right: 12,
    alignItems: "flex-end"
  },
  pill: {
    height: 32,
    minWidth: 78,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.color.divider,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.panel
  },
  pillOpen: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.controlActive
  },
  pillLabel: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6
  },
  menu: {
    marginTop: 6,
    minWidth: 150,
    // As nearly opaque as the intro's own card: this is a list of words to be
    // read and chosen from, not a heads-up panel over something being watched.
    backgroundColor: "rgba(4, 13, 26, 0.94)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.color.divider,
    overflow: "hidden"
  },
  menuTitle: {
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
    color: theme.color.textFaint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1
  },
  list: {
    // Four fifths of the shortest screen this ships to, less the corner it
    // hangs from: enough for eight of the twelve, and the rest are a scroll.
    maxHeight: 380,
    flexGrow: 0
  },
  option: {
    // A thumb-sized row, which is what makes a list of twelve usable at all.
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: theme.color.divider
  },
  optionOn: {
    backgroundColor: theme.color.controlActive
  },
  optionLabel: {
    color: theme.color.textDim,
    fontSize: 13
  },
  optionLabelOn: {
    color: theme.color.textBright,
    fontWeight: "700"
  }
});
