import React, { useCallback, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { BOOT_SKY_BACKGROUND } from "./bootSky";
import { BootSky } from "./BootSky";
import { FrameSize } from "./markerGeometry";
import { SafeAreaLayer } from "./SafeAreaLayer";
import { theme } from "./theme";

type Props = {
  /** Called once the second page is accepted. Boot starts on the other side. */
  onDone: () => void;
};

/**
 * The screen the app opens on the very first time it runs on a device.
 *
 * Two pages over the same moving sky the boot screen shows, so the intro and
 * the launch after it are one continuous thing rather than two designs: what
 * the app does, and the two permissions it is about to ask for.
 *
 * The copy sits in a card at the foot of the screen rather than over the middle
 * of it. The upper half is where the satellite crosses, and text there is read
 * against a moving light — the card keeps the words on a surface of known
 * colour and leaves the composition above them intact.
 *
 * Pages advance by swipe or by the button, which is the same button throughout
 * and only changes what it says on the last page: there it is the one that
 * lets boot — and so the system's own permission prompts — begin.
 */
export const IntroScreen: React.FC<Props> = ({ onDone }) => {
  const [frame, setFrame] = useState<FrameSize | null>(null);
  /**
   * The safe area inside that frame, which is what the pages are laid out in.
   *
   * Measured separately rather than derived, because the two boxes are now
   * different things: the sky is drawn over the whole screen, notch and home
   * indicator included, and the words are not. A page is one screenful wide, so
   * a pager sized to the frame instead would scroll by a little more than it
   * shows on any phone with insets down the sides.
   */
  const [safeBox, setSafeBox] = useState<FrameSize | null>(null);
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);
  // Subscribed to, so a rotated device locale is picked up without a reload —
  // this screen renders on a swipe, so reading the strings again costs nothing
  // worth memoising.
  useLocale();
  const t = strings().intro;
  const pages = [
    { wordmark: true, body: t.what.body },
    {
      title: t.access.title,
      body: t.access.body,
      access: [t.access.camera, t.access.location],
      footnote: t.access.footnote
    }
  ];

  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height }
    );
  }, []);

  const measureSafeBox = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSafeBox((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height }
    );
  }, []);

  /** Where a swipe left the pager, in whole pages. */
  const settled = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const width = event.nativeEvent.layoutMeasurement.width;
    if (width <= 0) return;
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  }, []);

  const advance = useCallback(() => {
    if (page >= pages.length - 1) {
      onDone();
      return;
    }
    const next = page + 1;
    setPage(next);
    // The state above is what the dots and the label read; this is only the
    // pager catching up with them.
    pager.current?.scrollTo({ x: next * (safeBox?.width ?? 0), y: 0, animated: true });
  }, [safeBox, onDone, page, pages.length]);

  return (
    <View style={styles.root} onLayout={measure}>
      <BootSky frame={frame} turning />

      {pages[page]?.wordmark && (
        <View style={styles.wordmarkLayer} pointerEvents="none">
          <Text style={styles.wordmark}>STARE</Text>
        </View>
      )}

      {/* The sky above is drawn over the whole screen; everything read or
          tapped is inside the safe area. The pager measures itself in here
          rather than against the frame, so a page is exactly one screenful of
          the box it scrolls in. See `SafeAreaLayer`. */}
      <SafeAreaLayer>
        <View style={styles.contentBox} onLayout={measureSafeBox}>
          {safeBox ? (
            <>
              <ScrollView
                ref={pager}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={settled}
                style={styles.pager}
              >
                {pages.map((content, index) => (
                  <View key={index} style={[styles.page, { width: safeBox.width }]}>
                    <View style={styles.card}>
                      {content.title ? <Text style={styles.title}>{content.title}</Text> : null}
                      <Text style={styles.body}>{content.body}</Text>

                      {content.access?.map((access) => (
                        <View key={access.name} style={styles.access}>
                          <Text style={styles.accessName}>{access.name}</Text>
                          <Text style={styles.accessReason}>{access.reason}</Text>
                        </View>
                      ))}

                      {content.footnote ? (
                        <Text style={styles.footnote}>{content.footnote}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <View style={styles.dots}>
                  {pages.map((_, index) => (
                    <View key={index} style={[styles.dot, index === page && styles.dotHere]} />
                  ))}
                </View>

                <Pressable accessibilityRole="button" style={styles.button} onPress={advance}>
                  <Text style={styles.buttonLabel}>
                    {page === pages.length - 1 ? t.allowAccess : t.next}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </SafeAreaLayer>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // The sky's own darkest colour, so the frame before the first drawn one is
    // the same night rather than a flash of a different one.
    backgroundColor: BOOT_SKY_BACKGROUND,
    overflow: "hidden"
  },
  // Everything read or tapped, inside the safe area: the pages, the footer,
  // and the box the pager measures a page against.
  contentBox: {
    flex: 1
  },
  pager: {
    flex: 1
  },
  // Centred over the whole frame rather than inside the pager, so the name
  // lands exactly where the boot screen puts it — under the satellite's pass —
  // rather than the smaller area the pager leaves above the footer.
  wordmarkLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center"
  },
  // Identical to `BootScreen`'s own `wordmark` style: same word, same screen,
  // same font.
  wordmark: {
    color: theme.color.textBright,
    fontSize: 17,
    fontWeight: "500",
    letterSpacing: 9,
    marginLeft: 9,
    opacity: 0.92
  },
  page: {
    flex: 1,
    // Bottom-aligned, so a shorter page does not drift up into the middle of
    // the screen where the sky is meant to be looked at.
    justifyContent: "flex-end",
    paddingHorizontal: 20
  },
  card: {
    borderRadius: 16,
    padding: 20,
    // Nearly opaque, where the heads-up panels are not. Those are laid over a
    // camera picture someone is trying to see past them; this one is laid over
    // a decoration, and carries the only words the app ever says. A satellite
    // drifting behind the sentence explaining why the phone is about to ask for
    // the camera is not worth the glimpse of sky it buys.
    backgroundColor: "rgba(4, 13, 26, 0.94)",
    borderWidth: 1,
    borderColor: theme.color.divider
  },
  title: {
    color: theme.color.textBright,
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  body: {
    marginTop: 10,
    color: theme.color.textDim,
    fontSize: 13,
    lineHeight: 19
  },
  access: {
    marginTop: 14
  },
  accessName: {
    color: theme.color.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1
  },
  accessReason: {
    marginTop: 3,
    color: theme.color.textDim,
    fontSize: 12,
    lineHeight: 17
  },
  footnote: {
    marginTop: 16,
    color: theme.color.textFaint,
    fontSize: 11,
    lineHeight: 16
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center"
  },
  dot: {
    width: 6,
    height: 6,
    marginHorizontal: 4,
    borderRadius: 3,
    backgroundColor: theme.color.control
  },
  dotHere: {
    backgroundColor: theme.color.textBright
  },
  button: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: theme.color.controlActive
  },
  buttonLabel: {
    color: theme.color.textBright,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5
  }
});

export default IntroScreen;
