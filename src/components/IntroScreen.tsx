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
import { IntroMode, introButtonLabel, introPages } from "../onboarding/introPages";
import { BOOT_SKY_BACKGROUND } from "./bootSky";
import { BootSky } from "./BootSky";
import { CalloutList, ColorKey, MarkTile, PassesPicture, PathPicture } from "./IntroFigures";
import { LanguagePicker } from "./LanguagePicker";
import { FrameSize } from "./markerGeometry";
import { SafeAreaLayer } from "./SafeAreaLayer";
import { theme } from "./theme";

type Props = {
  /**
   * Called once the last page is accepted. On the first launch, boot starts on
   * the other side; in the guide it is the way back to the sky, from the last
   * page's button or from the corner.
   */
  onDone: () => void;
  /**
   * Which telling of the pages this is: the first launch unless said otherwise,
   * or the guide the sky view's `?` opens over itself. See `IntroMode`.
   */
  mode?: IntroMode;
};

/**
 * The screen the app opens on the very first time — and the part of it worth
 * reading again, whenever somebody asks for it.
 *
 * Six pages over the same turning sky the boot screen shows, so the intro and
 * the launch after it are one continuous thing rather than two designs. What is
 * said, and what is pictured, is in `introPages.ts`; this lays it out.
 *
 * The copy sits in a card at the foot of the screen rather than over the middle
 * of it. The middle is where the satellites turn, and text there is read against
 * five moving bodies — the card keeps the words on a surface of known colour and
 * leaves the composition above them intact. The pictures in the card are pieces
 * of night sky of their own (`IntroFigures`), for the same reason.
 *
 * Pages advance by swipe or by the button, which is the same button throughout
 * and only changes what it says on the last page: there it is the one that lets
 * boot — and so the system's own permission prompts — begin.
 *
 * The corner holds the language picker, and this is the screen that most needs
 * one: everything here is to be read, and a phone whose language is not its
 * reader's makes every page useless at once. See `LanguagePicker`.
 *
 * **As the guide** (`mode="guide"`, opened by `GuideToggle`) it is the four
 * pages about reading the screen, laid over the sky view rather than put in its
 * place. The view goes on running underneath, dimmed instead of hidden behind
 * the boot sky: what the pages explain is the screen behind them, and closing
 * them should land on a sky that is still aimed rather than one that has to
 * settle again. Nothing about the first launch comes with them — no welcome, no
 * permissions, and a last button that goes back to the sky instead of asking
 * for anything. The corner is a way out from any page rather than the languages,
 * which are the console's to change once the intro is behind the phone.
 */
export const IntroScreen: React.FC<Props> = ({ onDone, mode = "intro" }) => {
  const guide = mode === "guide";
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
  // Subscribing rather than reading: nothing here needs to know *which*
  // language it is in, only to be rebuilt from the string table when the
  // corner picker changes it. This screen renders on a swipe, so reading the
  // pages again costs nothing worth memoising.
  useLocale();
  const pages = introPages(mode);

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
  const settled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const width = event.nativeEvent.layoutMeasurement.width;
      if (width <= 0) return;
      setPage(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    []
  );

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
  }, [safeBox, onDone, page, pages]);

  return (
    <View
      style={[styles.root, guide && styles.guideRoot]}
      // Over a view that is still there, so a screen reader is told to leave
      // what is behind it alone. The first launch has nothing behind it.
      aria-modal={guide}
      onLayout={measure}
    >
      {/* The first launch's own sky. The guide's is the sky view itself, still
          running under it. */}
      {!guide && <BootSky frame={frame} turning />}

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
                    {/* The card scrolls if it has to. Its height is a title, a
                        paragraph and a picture's worth of translated rows, and
                        the longest of the twelve languages comes within a few
                        lines of a 667pt screen — bottom-aligned, a page that
                        outgrew the screen would walk off the top of it with no
                        way to reach the rest. `flexShrink` is what caps it at
                        the space available; with room to spare it still sizes
                        to its own content and stays a card at the foot of the
                        sky. */}
                    <ScrollView
                      style={styles.card}
                      contentContainerStyle={styles.cardContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {content.title ? <Text style={styles.title}>{content.title}</Text> : null}
                      <Text style={styles.body}>{content.body}</Text>

                      {content.marks?.map((mark) => (
                        <View key={mark.sample} style={[styles.element, styles.markRow]}>
                          {/* The mark as the sky draws it, in the column the
                              badges keep on the corners page, so the two keys
                              read as one design. */}
                          <MarkTile sample={mark.sample} />
                          <View style={styles.elementText}>
                            <Text style={styles.elementWhere}>{mark.name}</Text>
                            <Text style={styles.elementMeaning}>{mark.meaning}</Text>
                          </View>
                        </View>
                      ))}

                      {content.colors ? (
                        <>
                          <Text style={styles.colorsLabel}>{content.colors.label}</Text>
                          <ColorKey swatches={content.colors.swatches} />
                        </>
                      ) : null}

                      {content.path ? (
                        <View style={styles.figure}>
                          <PathPicture />
                          <CalloutList callouts={content.path.callouts} />
                        </View>
                      ) : null}

                      {content.passes ? (
                        <View style={styles.figure}>
                          <PassesPicture />
                          <CalloutList callouts={content.passes.callouts} />
                        </View>
                      ) : null}

                      {content.elements?.map((element) => (
                        <View key={element.badge} style={styles.element}>
                          {/* The badge as the real screen wears it, so the row
                              is a key to the panel rather than a description of
                              it. Fixed width, so rows of very different badges
                              still line their text up. */}
                          <View style={styles.badge}>
                            <Text numberOfLines={1} style={styles.badgeLabel}>
                              {element.badge}
                            </Text>
                          </View>
                          <View style={styles.elementText}>
                            <Text style={styles.elementWhere}>{element.where}</Text>
                            <Text style={styles.elementMeaning}>{element.meaning}</Text>
                          </View>
                        </View>
                      ))}

                      {content.access?.map((access) => (
                        <View key={access.name} style={styles.access}>
                          <Text style={styles.accessName}>{access.name}</Text>
                          <Text style={styles.accessReason}>{access.reason}</Text>
                        </View>
                      ))}

                      {content.footnote ? (
                        <Text style={styles.footnote}>{content.footnote}</Text>
                      ) : null}
                    </ScrollView>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <View style={styles.dots}>
                  {pages.map((_, index) => (
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
                  <Text style={styles.buttonLabel}>{introButtonLabel(page, mode)}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        {/* Last, so the list it opens is over the pages and the footer both.
            The guide has no list to open: its corner is the way back to the
            sky, from whichever page it is on. */}
        {guide ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings().guide.close}
            hitSlop={6}
            style={styles.close}
            onPress={onDone}
          >
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        ) : (
          <LanguagePicker />
        )}
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
  /**
   * The guide, over a sky view that already fills the screen: laid on top of it
   * rather than in the flow, and the view under it dimmed rather than hidden.
   *
   * The dim is the night the card is cut from, heavy enough that the dots and
   * the button under the pager still read over a daylight sky, and light enough
   * that the view is visibly still there. These are pages about that screen,
   * and a glance past the card at the real marks is worth keeping.
   */
  guideRoot: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(4, 13, 26, 0.82)"
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
    // Sizes to its content, and no further than the space the pager leaves —
    // see the comment where it is used.
    flexGrow: 0,
    flexShrink: 1,
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
  cardContent: {
    padding: 20
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
  element: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start"
  },
  // A tile is taller than a badge, and a short explanation beside it reads as
  // belonging to it only when the two share a middle.
  markRow: {
    alignItems: "center",
    gap: 10
  },
  /**
   * A copy of the panel's own pill, at the panel's own colours.
   *
   * Fixed width rather than sized to its content: the badges are a number and
   * two words of very different length, and left to themselves they would step
   * the explanations in and out by thirty points down the card.
   */
  badge: {
    width: 74,
    minHeight: 22,
    marginRight: 10,
    paddingHorizontal: 6,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.color.divider,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  badgeLabel: {
    color: theme.color.textBright,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6
  },
  elementText: {
    flex: 1
  },
  elementWhere: {
    color: theme.color.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6
  },
  elementMeaning: {
    marginTop: 2,
    color: theme.color.textDim,
    fontSize: 11.5,
    lineHeight: 16
  },
  colorsLabel: {
    marginTop: 14,
    color: theme.color.textDim,
    fontSize: 11.5,
    lineHeight: 16
  },
  figure: {
    marginTop: 14
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
  },
  // The language picker's pill, in the language picker's corner, holding a way
  // out instead: the guide is recognisably the screen the intro was.
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.color.divider,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.panel
  },
  // The satellite card's own close glyph, at its size.
  closeLabel: {
    color: theme.color.textDim,
    fontSize: 13,
    fontWeight: "700"
  }
});

export default IntroScreen;
