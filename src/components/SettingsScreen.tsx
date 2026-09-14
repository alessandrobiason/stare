import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeBuild } from "../debug/buildIdentity";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { LANGUAGE_NAMES, LOCALES, Locale, setLocale } from "../i18n/locale";
import { CONSOLE_LABEL } from "./consoleLabel";
import { Icon } from "./Icon";
import { theme } from "./theme";
import { APP_NAME } from "./wordmark";

/** Where the source lives, and whose name goes beside it. Kept in one place
 * rather than in `i18n`, since a GitHub handle and an author's name are not
 * words that translate. */
const GITHUB_URL = "https://github.com/alessandrobiason/stare";
const AUTHOR_NAME = "Alessandro Biason";

type Props = {
  /** Opens the guide over the sky: the intro's pages about the screen. */
  onOpenGuide: () => void;
  /** Opens the console over the sky, which is a tab away from here. */
  onOpenConsole: () => void;
  /** Whether boot reported anything degraded; the detail is on the STATUS page. */
  warned?: boolean;
};

/**
 * Everything about the app rather than about the sky.
 *
 * Four rows: the `?` that brings back the pages about the screen, the
 * language, the console, and the link to where this is built. None of them is
 * about what is overhead, none is touched more than once in a session, and the
 * first three used to spend a corner of a photograph saying so. A tab is where
 * they belong.
 *
 * It covers the sky while it is open — a list of settings read against a
 * moving camera picture is a list nobody can read — but the camera keeps
 * running underneath and the tab bar stays put, so going back is one tap and
 * lands on a view that never stopped.
 *
 * **The language is a list rather than a link.** It is the one setting here
 * that somebody may need without being able to read the row above it, which is
 * why the intro carries the same choice in its corner (`LanguagePicker`); a
 * list of endonyms is legible whichever language the app is currently in.
 *
 * **The console keeps its English name** — see `CONSOLE_LABEL` — and its row
 * carries the warning dot when boot reported something degraded, because the
 * page that says what was degraded is behind it.
 */
export const SettingsScreen: React.FC<Props> = ({ onOpenGuide, onOpenConsole, warned = false }) => {
  const locale = useLocale();
  const t = strings();
  const [languages, setLanguages] = useState(false);
  // Read once: it cannot change while the app is running.
  const [build] = useState(describeBuild);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* The tab's own label, so the bar and the page cannot disagree. */}
        <Text style={styles.title}>{t.tabs.settings}</Text>

        <View style={styles.group}>
          <Row
            label={t.guide.open}
            detail={t.intro.corners.guide.meaning}
            onPress={onOpenGuide}
          />

          <Row
            label={t.language.title}
            value={LANGUAGE_NAMES[locale]}
            open={languages}
            onPress={() => setLanguages((was) => !was)}
          />
          {languages && (
            <View accessibilityRole="radiogroup" style={styles.languages}>
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
                    style={styles.language}
                    onPress={() => choose(option, setLanguages)}
                  >
                    <Text style={[styles.languageLabel, on && styles.languageLabelOn]}>
                      {LANGUAGE_NAMES[option]}
                    </Text>
                    {on && <View style={styles.chosen} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Row
            label={CONSOLE_LABEL}
            detail={t.intro.corners.console.meaning}
            warned={warned}
            onPress={onOpenConsole}
          />

          <Row
            label="About"
            detail={AUTHOR_NAME}
            onPress={() => void Linking.openURL(GITHUB_URL).catch(() => undefined)}
            last
          />
        </View>

        {/* Which binary this is. See `describeBuild`: a fix that never reached
            the phone reads exactly like a fix that did not work, and the
            difference has to be legible from the screen someone photographs.
            Empty in the replay harness, which has no updates module. */}
        <Text style={styles.build}>{build ? `${APP_NAME} · ${build}` : APP_NAME}</Text>
      </ScrollView>
    </View>
  );
};

/**
 * Sets the language, closing the list first.
 *
 * Ordered so the list is closed against the language it was opened in:
 * `setLocale` re-renders this screen, and the list would otherwise blink
 * through the new one on its way out.
 */
function choose(next: Locale, close: (open: boolean) => void): void {
  close(false);
  setLocale(next);
}

type RowProps = {
  label: string;
  /** What it is for, under the label. One line, and not every row has one. */
  detail?: string;
  /** The setting's current value, at the right-hand end of the row. */
  value?: string;
  /** Whether this row's own list is open under it, for the chevron. */
  open?: boolean;
  warned?: boolean;
  onPress: () => void;
  /** The last row in a group carries no rule under it. */
  last?: boolean;
};

/** One setting: what it is, what it is worth, and the way into it. */
const Row: React.FC<RowProps> = ({
  label,
  detail,
  value,
  open = false,
  warned = false,
  onPress,
  last = false
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.row, last && styles.rowLast]}
    onPress={onPress}
  >
    <View style={styles.rowText}>
      <View style={styles.rowHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        {warned && <View style={styles.warned} />}
      </View>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
    {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    <Icon
      name="chevron"
      size={16}
      direction={open ? "up" : "right"}
      color={theme.color.textFaint}
    />
  </Pressable>
);

const styles = StyleSheet.create({
  screen: {
    // Over the camera, which keeps running underneath: this is a sheet on the
    // sky rather than a screen the app has navigated to.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.scrim
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    // Clear of the tab bar, which is drawn over the foot of this sheet.
    paddingBottom: 96
  },
  title: {
    color: theme.color.textBright,
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.4,
    marginBottom: 18
  },
  group: {
    borderRadius: theme.radius.panel,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    // A thumb-sized row, which is what makes a list usable at all.
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider
  },
  rowLast: {
    borderBottomWidth: 0
  },
  rowText: {
    flex: 1,
    gap: 3
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  rowLabel: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: "600"
  },
  rowDetail: {
    color: theme.color.textFaint,
    fontSize: 11,
    lineHeight: 15
  },
  rowValue: {
    color: theme.color.textDim,
    fontSize: 13
  },
  warned: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.warning
  },
  languages: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider,
    backgroundColor: "rgba(0, 0, 0, 0.2)"
  },
  language: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // A thumb-sized row, which is what makes a list of twelve usable at all.
    minHeight: 44,
    paddingHorizontal: 18
  },
  languageLabel: {
    color: theme.color.textDim,
    fontSize: 13
  },
  languageLabelOn: {
    color: theme.color.textBright,
    fontWeight: "700"
  },
  chosen: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.accent
  },
  build: {
    marginTop: 16,
    textAlign: "center",
    color: theme.color.textFaint,
    fontSize: 10,
    letterSpacing: 0.3
  }
});

export default SettingsScreen;
