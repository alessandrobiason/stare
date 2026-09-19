import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import appConfig from "../../app.json";
import { describeBuild } from "../debug/buildIdentity";
import { useLocale } from "../hooks/useLocale";
import { usePassAlertAccess } from "../hooks/usePassAlertAccess";
import { strings } from "../i18n";
import { LANGUAGE_NAMES, LOCALES, Locale, setLocale } from "../i18n/locale";
import { askForPassAlerts, openPassAlertSettings } from "../notifications/alertAccess";
import { PassAlertAccess } from "../notifications/alertTypes";
import { CONSOLE_LABEL } from "./consoleLabel";
import { Icon } from "./Icon";
import { theme } from "./theme";

/** Where the source lives, and whose name goes beside it. Kept in one place
 * rather than in `i18n`, since a GitHub handle and an author's name are not
 * words that translate. */
const GITHUB_URL = "https://github.com/alessandrobiason/stare";
const AUTHOR_NAME = "Alessandro Biason";
/**
 * The version people are told, which is the one the store shows: `app.json`'s,
 * read from the file rather than copied here so the two cannot disagree.
 */
const APP_VERSION = appConfig.expo.version;

type Props = {
  /** Starts the tour over the sky. */
  onOpenGuide: () => void;
  /** Opens the console over the sky, which is a tab away from here. */
  onOpenConsole: () => void;
  /** Whether boot reported anything degraded; the detail is on the STATUS page. */
  warned?: boolean;
};

/**
 * Everything about the app rather than about the sky.
 *
 * Five rows: Help, which runs the tour of the sky view again, the language, the
 * pass alerts, the console, and About. None of them is about what is overhead,
 * none is touched more than once in a session, and the first few used to spend
 * a corner of a photograph saying so. A tab is where they belong.
 *
 * It covers the sky while it is open — a list of settings read against a
 * moving camera picture is a list nobody can read — but the camera keeps
 * running underneath and the tab bar stays put, so going back is one tap and
 * lands on a view that never stopped.
 *
 * **The language is a list rather than a link.** It is the one setting here
 * that somebody may need without being able to read the row above it; a list
 * of endonyms is legible whichever language the app is currently in.
 *
 * **The console keeps its English name** — see `CONSOLE_LABEL` — and its row
 * carries the warning dot when boot reported something degraded, because the
 * page that says what was degraded is behind it.
 *
 * **About opens in place, like the language.** It used to be a link straight to
 * the repository, which is one of three things somebody asking "about" might
 * want and the only one that leaves the app. So it is a short list instead —
 * the author, the project with its link, and the version — and the version is
 * no longer a footnote under the rows: the build line that says exactly which
 * binary this is (`describeBuild`) goes with it, under the number people are
 * told.
 */
export const SettingsScreen: React.FC<Props> = ({ onOpenGuide, onOpenConsole, warned = false }) => {
  const locale = useLocale();
  // Re-read whenever the app comes back to the foreground, which is how a
  // switch moved out in the phone's settings reaches this row. `null` only for
  // the moment before the first answer. See `usePassAlertAccess`.
  const alerts = usePassAlertAccess();
  const t = strings();
  const [languages, setLanguages] = useState(false);
  const [about, setAbout] = useState(false);
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
            label={t.tour.open}
            detail={t.tour.about}
            onPress={onOpenGuide}
          />

          <Row
            label={t.language.title}
            value={LANGUAGE_NAMES[locale]}
            open={languages}
            onPress={() => setLanguages((was) => !was)}
          />
          {languages && (
            <View accessibilityRole="radiogroup" style={styles.sublist}>
              {LOCALES.map((option) => {
                const on = option === locale;
                return (
                  <Pressable
                    key={option}
                    // What matters about one of these is which is the case,
                    // which is a radio; two buttons announcing two labels
                    // would leave the current language unsaid.
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

          {/* Not drawn at all where there is no notification centre to point
              at, which is the replay harness: a row that says "off" and does
              nothing when tapped is worse than no row. See `alertGateway`. */}
          {alerts && alerts !== "unsupported" && (
            <Row
              label={t.alerts.title}
              // A different line for each state, because what somebody needs to
              // be told differs: what they would get, that they are getting it,
              // or that the phone is holding it back and where to change that.
              detail={t.alerts[alerts]}
              value={alerts === "granted" ? t.alerts.on : t.alerts.off}
              onPress={() => tapAlerts(alerts)}
            />
          )}

          <Row
            label={CONSOLE_LABEL}
            detail={t.console.detail}
            warned={warned}
            onPress={onOpenConsole}
          />

          <Row
            label={t.about.title}
            detail={t.about.detail}
            open={about}
            onPress={() => setAbout((was) => !was)}
            last={!about}
          />
          {about && (
            <View style={[styles.sublist, styles.sublistLast]}>
              <Fact label={t.about.author} value={AUTHOR_NAME} />
              {/* The one fact here that goes somewhere: written as the address
                  it opens rather than as "GitHub", so where a tap leads is on
                  the screen before the tap. */}
              <Fact
                label={t.about.project}
                value={GITHUB_URL.replace(/^https:\/\//, "")}
                onPress={() => void Linking.openURL(GITHUB_URL).catch(() => undefined)}
              />
              {/* Which binary this is, under the number. See `describeBuild`: a
                  fix that never reached the phone reads exactly like a fix that
                  did not work, and the difference has to be legible from the
                  screen someone photographs. Empty in the replay harness, which
                  has no updates module. */}
              <Fact
                label={t.about.version}
                value={APP_VERSION}
                detail={build || null}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

/**
 * What a tap on the alerts row does, which depends on what the phone has
 * already said.
 *
 * iOS puts its notification prompt up exactly once per install. Before that,
 * this row *is* the switch and a tap raises it; after it, whichever way it was
 * answered, the only switch left is the one in the phone's own settings, and
 * the honest thing for a row in an app to do is open that page rather than
 * pretend to a control it does not have. Hence a row with a chevron rather than
 * a toggle: both outcomes are a door, and only one of them is ours.
 */
function tapAlerts(access: PassAlertAccess): void {
  if (access === "undetermined") void askForPassAlerts();
  else void openPassAlertSettings();
}

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

type FactProps = {
  label: string;
  value: string;
  /** A second, quieter line under the fact, for what the value alone does not say. */
  detail?: string | null;
  /** Where the fact leads, for the one that is a link. */
  onPress?: () => void;
};

/**
 * One line of About: a word and what it is. Plain text unless it leads
 * somewhere, in which case the value is lit and the row takes the tap.
 */
const Fact: React.FC<FactProps> = ({ label, value, detail = null, onPress }) => {
  const content = (
    <>
      <View style={styles.factHead}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text
          numberOfLines={1}
          style={[styles.factValue, onPress && styles.factLink]}
          selectable={!onPress}
        >
          {value}
        </Text>
        {onPress && <Icon name="chevron" size={14} color={theme.color.textFaint} />}
      </View>
      {detail ? (
        <Text style={styles.factDetail} selectable>
          {detail}
        </Text>
      ) : null}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      style={styles.fact}
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.fact}>{content}</View>
  );
};

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
    // The sheet itself stops at the tab bar (`SkyOverlay`), so this is only
    // the room a list leaves under its last row.
    paddingBottom: 24
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
  /** A row's own list, opened under it: the languages, or About. */
  sublist: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider,
    backgroundColor: "rgba(0, 0, 0, 0.2)"
  },
  /** At the foot of the group, where the group's own border is the rule. */
  sublistLast: {
    borderBottomWidth: 0
  },
  language: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // A thumb-sized row.
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
  fact: {
    justifyContent: "center",
    // A thumb-sized row, like the languages beside it.
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 3
  },
  factHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  factLabel: {
    color: theme.color.textDim,
    fontSize: 13
  },
  factValue: {
    flex: 1,
    textAlign: "right",
    color: theme.color.text,
    fontSize: 13
  },
  factLink: {
    color: theme.color.accent
  },
  factDetail: {
    color: theme.color.textFaint,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.3,
    textAlign: "right"
  }
});

export default SettingsScreen;
