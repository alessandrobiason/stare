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
import { INTRO_PAGES, introButtonLabel } from "../onboarding/introPages";
import { BOOT_SKY_BACKGROUND } from "./bootSky";
import { BootSky } from "./BootSky";
import { FrameSize } from "./markerGeometry";
import { theme } from "./theme";

type Props = {
  /** Called once the last page is accepted. Boot starts on the other side. */
  onDone: () => void;
};

/**
 * The screen the app opens on the very first time, and never again.
 *
 * Three pages over the same turning sky the boot screen shows, so the intro and
 * the launch after it are one continuous thing rather than two designs. What is
 * said is in `introPages.ts`; this lays it out and nothing else.
 *
 * The copy sits in a card at the foot of the screen rather than over the middle
 * of it. The middle is where the satellites turn, and text there is read against
 * five moving bodies — the card keeps the words on a surface of known colour and
 * leaves the composition above them intact.
 *
 * Pages advance by swipe or by the button, which is the same button throughout
 * and only changes what it says on the last page: there it is the one that lets
 * boot — and so the system's own permission prompts — begin.
 */
export const IntroScreen: React.FC<Props> = ({ onDone }) => {
  const [frame, setFrame] = useState<FrameSize | null>(null);
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);

  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height }
    );
  }, []);

  /** Where a swipe left the pager, in whole pages. */
  const settled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const width = event.nativeEvent.layoutMeasurement.width;
      if (width <= 0) return;
      setPage(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    []
  );

  const advance = useCallback(() => {
    if (page >= INTRO_PAGES.length - 1) {
      onDone();
      return;
    }
    const next = page + 1;
    setPage(next);
    // The state above is what the dots and the label read; this is only the
    // pager catching up with them.
    pager.current?.scrollTo({ x: next * (frame?.width ?? 0), y: 0, animated: true });
  }, [frame, onDone, page]);

  return (
    <View style={styles.root} onLayout={measure}>
      <BootSky frame={frame} turning />

      {INTRO_PAGES[page]?.wordmark && (
        <View style={styles.wordmarkLayer} pointerEvents="none">
          <Text style={styles.wordmark}>STARE</Text>
        </View>
      )}

      {frame ? (
        <>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={settled}
            style={styles.pager}
          >
            {INTRO_PAGES.map((content, index) => (
              <View key={index} style={[styles.page, { width: frame.width }]}>
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
              {INTRO_PAGES.map((_, index) => (
                <View
                  key={index}
                  style={[styles.dot, index === page && styles.dotHere]}
                />
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={advance}
            >
              <Text style={styles.buttonLabel}>{introButtonLabel(page)}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
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
  pager: {
    flex: 1
  },
  // Centred over the whole frame rather than inside the pager, so the name
  // lands exactly where the boot screen puts it — the eye of the orbits —
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
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: 7,
    marginLeft: 7,
    opacity: 0.92
  },
  page: {
    flex: 1,
    // Bottom-aligned, so pages of different lengths grow upwards into the sky
    // instead of moving the button between them.
    justifyContent: "flex-end",
    paddingHorizontal: 20
  },
  card: {
    padding: 20,
    borderRadius: 16,
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
