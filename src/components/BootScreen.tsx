import React, { useCallback, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
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
};

/**
 * The screen the app opens on, and the one it comes back to when something
 * fatal happens.
 *
 * While it is loading it is only the sky — five satellites turning, and not a
 * word (see `bootSky`). It used to carry a wordmark, a tagline, a progress bar
 * and the list of start-up steps as they settled, which was a lot of screen
 * spent telling someone that a catalogue they have never heard of is being
 * downloaded. None of it was actionable: the app either opens, or it comes
 * back here with a reason.
 *
 * A failure is that reason, and is the only thing this screen ever writes. The
 * sky stops turning under it, because the turning is what was saying that
 * something is still happening.
 */
export const BootScreen: React.FC<Props> = ({ failed, error, retryable = true, onRetry }) => {
  const [frame, setFrame] = useState<FrameSize | null>(null);

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

      {failed && (
        <View style={styles.card}>
          <Text style={styles.title}>Could not start</Text>
          {error ? <Text style={styles.reason}>{error}</Text> : null}

          {retryable ? (
            <Pressable style={styles.retry} onPress={onRetry}>
              <Text style={styles.retryLabel}>TRY AGAIN</Text>
            </Pressable>
          ) : (
            <Text style={styles.footnote}>This device cannot run the sky view.</Text>
          )}
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
  reason: {
    marginTop: 10,
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
  footnote: {
    marginTop: 14,
    color: theme.color.textFaint,
    fontSize: 10,
    lineHeight: 15
  }
});

export default BootScreen;
