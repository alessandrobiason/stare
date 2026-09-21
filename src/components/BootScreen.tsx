import React, { useCallback, useState } from "react";
import {
  LayoutChangeEvent,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { bootFailureText, opensSettings } from "../boot/bootFailure";
import { describeBuild } from "../debug/buildIdentity";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { BootProgressFeed } from "../hooks/useAppBoot";
import { BOOT_SKY_BACKGROUND } from "./bootSky";
import { BootProgressBar } from "./BootProgressBar";
import { APP_NAME, WORDMARK_WEIGHT, wordmarkTracking } from "./wordmark";
import { BootSky } from "./BootSky";
import { FrameSize } from "./markerGeometry";
import { theme } from "./theme";

/**
 * Whether this platform can be sent to the app's own page in the system
 * settings.
 *
 * The phone can; a browser cannot, and `react-native-web`'s `Linking` simply
 * has no `openSettings` on it — so the replay harness, which renders this very
 * screen (`testing/replay/App.tsx`), would throw on the press rather than
 * degrade. Asked at all because the honest thing to do with a button that
 * cannot work is not to draw it, and asked at render rather than at import so
 * that what is checked is the platform the screen is actually drawn on.
 */
function canOpenSettings(): boolean {
  return typeof Linking.openSettings === "function";
}

type Props = {
  failed: boolean;
  /**
   * What was thrown, when `failed` — not a sentence about it.
   *
   * Turned into words here rather than by whoever caught it, so the reason is
   * written in the language the app is in at the moment it is drawn, and so
   * this screen can tell a refused permission from a dropped connection and
   * offer the right way out of each. See `src/boot/bootFailure.ts`.
   */
  error: unknown;
  /** Whether trying again could help; a missing sensor is not going to appear. */
  retryable?: boolean;
  onRetry: () => void;
  /**
   * How far start-up has got, for the bar under the name. Optional so that a
   * screen shown for a failure alone — and the tests that render one — does not
   * have to invent one. See `BootProgressBar`.
   */
  progress?: BootProgressFeed;
};

/**
 * The screen the app opens on, and the one it comes back to when something
 * fatal happens.
 *
 * While it is loading it is the sky, the app's name and one short bar — a
 * satellite crossing the night above the word, and under it how far start-up
 * has got (see `bootSky` and `BootProgressBar`). It used to carry a tagline and
 * the list of start-up steps as they settled as well, which was a lot of screen
 * spent telling someone that a catalogue they have never heard of is being
 * downloaded; none of that was actionable. The bar is, in the one way that
 * matters on the launch that fetches 95 MB of segmentation model: it separates
 * an app that is working from an app that has hung, which nothing else on this
 * screen can do.
 *
 * A failure is that reason, and is the only other thing this screen ever
 * writes. The name gives way to it, and the light stops where it is
 * underneath, because its moving is what was saying that something is still
 * happening.
 */
export const BootScreen: React.FC<Props> = ({
  failed,
  error,
  retryable = true,
  onRetry,
  progress
}) => {
  // Subscribed to, so a failure is written in the language the app is in. See
  // `useLocale`.
  useLocale();
  const t = strings().boot;
  const [frame, setFrame] = useState<FrameSize | null>(null);
  // Read once: it cannot change while the app is running.
  const [build] = useState(describeBuild);
  // Written out on every render rather than remembered, because the language
  // can change under it: the settings tab is behind this screen only when boot
  // succeeded, but a failure that arrives after a language change has to be in
  // the new one.
  const reason = failed && error !== null ? bootFailureText(error) : null;
  // A refused camera, a refused fix, location services off for the whole
  // phone: all three are a switch two levels down the system settings, and
  // "try again" on its own is a button that fails the same way. See
  // `opensSettings`.
  const settings = failed && opensSettings(error) && canOpenSettings();

  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height }
    );
  }, []);

  return (
    <View style={styles.root} onLayout={measure}>
      <BootSky frame={frame} turning={!failed} />

      {!failed && (
        <>
          <Text style={styles.wordmark}>{APP_NAME.toUpperCase()}</Text>
          {progress ? <BootProgressBar progress={progress} /> : null}
        </>
      )}

      {failed && (
        <View style={styles.card}>
          <Text style={styles.title}>{t.failed}</Text>
          {reason ? (
            // Scrolled and selectable, because a reason can be long. The
            // camera's capture failures now carry the AVFoundation error and
            // the session's state with them, which is a paragraph rather than a
            // sentence — and the screen it lands on is centred inside an
            // `overflow: "hidden"` root, so without this the end of the message
            // is clipped off the bottom with no way to reach it. Selectable so
            // it can be copied out rather than photographed.
            <ScrollView style={styles.reasonScroll} contentContainerStyle={styles.reasonContent}>
              <Text style={styles.reason} selectable>
                {reason}
              </Text>
            </ScrollView>
          ) : null}

          {/* The way out of the failure, where the phone's own settings are
              it: first, and filled in, because on a refused permission it is
              the button that works and the retry beside it is the one that
              cannot. `openSettings` lands on this app's own page rather than
              the top of the list, so nothing has to be described in words. */}
          {settings ? (
            <Pressable
              accessibilityRole="button"
              style={styles.retry}
              onPress={() => {
                // Swallowed: a phone that will not open its own settings is
                // not a reason to crash the screen reporting the failure.
                try {
                  void Linking.openSettings().catch(() => undefined);
                } catch {
                  // Nothing to do, and nothing worth saying about it here.
                }
              }}
            >
              <Text style={styles.retryLabel}>{t.openSettings}</Text>
            </Pressable>
          ) : null}

          {retryable ? (
            <Pressable
              accessibilityRole="button"
              style={[styles.retry, settings && styles.retrySecondary]}
              onPress={onRetry}
            >
              <Text style={[styles.retryLabel, settings && styles.retryLabelSecondary]}>
                {t.tryAgain}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.footnote}>{t.unsupported}</Text>
          )}

          {/* Which binary is reporting this. See `describeBuild`: a fix that
              never reached the phone reads exactly like a fix that did not
              work, and the difference has to be legible from the screen
              someone photographs. */}
          {build ? (
            <Text style={styles.build} selectable>
              {build}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    // The sky's own darkest colour, so the frame before the first drawn one is
    // the same night rather than a flash of a different one.
    backgroundColor: BOOT_SKY_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    overflow: "hidden"
  },
  /**
   * The name, in the middle of the night the satellite crosses.
   *
   * Set small, light and wide, the way a name is set on something made with
   * care rather than on a sign: the light above it is the thing to look at, and
   * the word only has to say whose sky it is. Every pass in `BOOT_PASSES` peaks
   * well above the middle of the screen, so the two never meet.
   *
   * `letterSpacing` is applied after the last letter as well as between them, so
   * the box is a space wider than the word in it and the letters sit half a
   * space left of the middle. A margin shifts a centred box by half of itself,
   * which is why the correction is the whole space rather than half of it.
   */
  wordmark: {
    color: theme.color.textBright,
    fontSize: 17,
    fontWeight: WORDMARK_WEIGHT,
    letterSpacing: wordmarkTracking(17),
    marginLeft: wordmarkTracking(17),
    opacity: 0.92
  },
  card: {
    width: "100%",
    maxWidth: 380,
    padding: 20,
    borderRadius: 14,
    backgroundColor: theme.color.panel,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder
  },
  title: {
    color: theme.color.danger,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1
  },
  reasonScroll: {
    marginTop: 10,
    // Tall enough for a real diagnostic, short enough that the title and the
    // retry button stay on screen with it.
    maxHeight: 260
  },
  reasonContent: {
    paddingRight: 4
  },
  reason: {
    color: theme.color.text,
    fontSize: 12,
    lineHeight: 18
  },
  retry: {
    marginTop: 18,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: theme.color.controlActive
  },
  retryLabel: {
    color: theme.color.textBright,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5
  },
  /**
   * The retry when it is the second button rather than the only one.
   *
   * Outlined instead of filled: with the settings button above it the two are
   * not equal offers — one goes to the switch that is actually in the way, and
   * this one is for somebody who has already flipped it and come back.
   */
  retrySecondary: {
    marginTop: 8,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider
  },
  retryLabelSecondary: {
    color: theme.color.textDim
  },
  build: {
    marginTop: 14,
    color: theme.color.textFaint,
    fontSize: 9,
    lineHeight: 13
  },
  footnote: {
    marginTop: 14,
    color: theme.color.textFaint,
    fontSize: 10,
    lineHeight: 15
  }
});

export default BootScreen;
