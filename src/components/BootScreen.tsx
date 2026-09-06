import React, { useCallback, useState } from "react";
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeBuild } from "../debug/buildIdentity";
import { BOOT_SKY_BACKGROUND } from "./bootSky";
import { BootSky } from "./BootSky";
import { FrameSize } from "./markerGeometry";
import { theme } from "./theme";

type Props = {
  failed: boolean;
  /** The failure to show, when `failed`. */
  error: string | null;
  /** Whether trying again could help; a missing sensor is not going to appear. */
  retryable?: boolean;
  onRetry: () => void;
  /**
   * Whether to name the app in the middle of the sky while it loads.
   *
   * Off for the launch that has just come out of the intro, which said the name
   * on its own first page a moment ago (`src/App.tsx`, `useIntro`).
   */
  wordmark?: boolean;
};

/**
 * The screen the app opens on, and the one it comes back to when something
 * fatal happens.
 *
 * While it is loading it is the sky and the app's name — five satellites
 * turning, and the one word they turn around (see `bootSky`). It used to carry
 * a tagline, a progress bar and the list of start-up steps as they settled,
 * which was a lot of screen spent telling someone that a catalogue they have
 * never heard of is being downloaded. None of it was actionable: the app either
 * opens, or it comes back here with a reason.
 *
 * A failure is that reason, and is the only other thing this screen ever
 * writes. The name gives way to it, and the sky stops turning underneath,
 * because the turning is what was saying that something is still happening.
 */
export const BootScreen: React.FC<Props> = ({
  failed,
  error,
  retryable = true,
  onRetry,
  wordmark = true
}) => {
  const [frame, setFrame] = useState<FrameSize | null>(null);
  // Read once: it cannot change while the app is running.
  const [build] = useState(describeBuild);

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

      {!failed && wordmark && <Text style={styles.wordmark}>STARE</Text>}

      {failed && (
        <View style={styles.card}>
          <Text style={styles.title}>Could not start</Text>
          {error ? (
            // Scrolled and selectable, because a reason can be long. The
            // camera's capture failures now carry the AVFoundation error and
            // the session's state with them, which is a paragraph rather than a
            // sentence — and the screen it lands on is centred inside an
            // `overflow: "hidden"` root, so without this the end of the message
            // is clipped off the bottom with no way to reach it. Selectable so
            // it can be copied out rather than photographed.
            <ScrollView style={styles.reasonScroll} contentContainerStyle={styles.reasonContent}>
              <Text style={styles.reason} selectable>
                {error}
              </Text>
            </ScrollView>
          ) : null}

          {retryable ? (
            <Pressable style={styles.retry} onPress={onRetry}>
              <Text style={styles.retryLabel}>TRY AGAIN</Text>
            </Pressable>
          ) : (
            <Text style={styles.footnote}>This device cannot run the sky view.</Text>
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
   * The name, in the eye of the orbits.
   *
   * It has to fit inside them. The innermost satellite in `BOOT_ORBITS` runs at
   * 175 design units with a body of 28, so the clear circle around the centre is
   * 147 of the design frame's 1820 tall — 54 layout points on the smallest
   * screen this ships to, a 375 x 667 phone, and 69 on a current one. Five
   * letters at this size and spacing measure 91 points across, so the word ends
   * some eight points short of the closest satellite even there. Grow either
   * figure and they meet.
   *
   * `letterSpacing` is applied after the last letter as well as between them, so
   * the box is a space wider than the word in it and the letters sit half a
   * space left of the middle. A margin shifts a centred box by half of itself,
   * which is why the correction is the whole space rather than half of it.
   */
  wordmark: {
    color: theme.color.textBright,
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: 7,
    marginLeft: 7,
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
