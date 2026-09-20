import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { fill, strings } from "../i18n";
import { Icon } from "./Icon";
import { glass, lift, theme } from "./theme";

/**
 * Where to point the phone for the object somebody just picked out of a list.
 *
 * Worded where it is raised rather than here, because the bearing is a reading
 * off the tracker at the instant of the press (`lookDirection`) and this is a
 * sign that outlives it by a few seconds — an object crossing overhead moves
 * tens of degrees in that time, and a line that kept up with it would be
 * re-rendering the middle of the picture to correct advice nobody is reading
 * twice.
 */
export type SkyAim = {
  /**
   * Which press this is.
   *
   * The same object picked twice is two pieces of news, and both are worth
   * showing: the first may have been missed, and the second is somebody asking
   * again. So the sign restarts on the id rather than on the name.
   */
  id: number;
  /** Where to point, already worded: a compass point and a height. */
  direction: string;
  /**
   * Whether it is high enough to be drawn on the frame, which decides what is
   * said: a bearing to point along, or that its crossing is drawn and has not
   * begun. See `MINIMUM_SATELLITE_ELEVATION_DEG` — an object a degree up has
   * no mark to find, so it counts as not there yet.
   */
  risen: boolean;
};

/** How long the sign takes to arrive, how long it stays, and how long it takes to go. */
const IN_MS = 240;
const HOLD_MS = 3400;
const OUT_MS = 420;
/** How far it drifts up as it arrives, in points. */
const RISE = 10;
/** The phone animates off the UI thread; the browser has no such driver. */
const useNativeDriver = Platform.OS !== "web";

type Props = {
  /** The aim to show, or `null` for nothing to say. */
  aim: SkyAim | null;
  /** Called once it has faded out, so the owner can forget it. */
  onDone: () => void;
};

/**
 * The line over the middle of the picture: go and look for it.
 *
 * A row in the passes panel and a row in the catalog both end in the same
 * place — that object's card at the foot of the screen — and that is the whole
 * problem. A card opening at the bottom of a screen is what happens when an app
 * has something to *read*, so the phone stays at chest height and the sky the
 * app just drew a line across goes unseen. The mark is up there, lit and ringed,
 * with its whole crossing drawn through it (`useFocusedPath`); nobody looks up
 * for something they have no reason to think is there.
 *
 * So the app says so, once, in the one part of the screen it otherwise never
 * writes on: the middle, which is where the camera picture is and where the
 * eyes of someone holding the phone already are. It fades in, holds for about
 * as long as it takes to read twice, and fades out on its own — the answer is a
 * bearing, and a bearing is read once and acted on. Nothing to dismiss and
 * nothing under it made unreachable: it takes no touches at all, so a tap that
 * lands on it is a tap on the sky behind it.
 *
 * Two things to say, because a list of *upcoming* passes is mostly objects that
 * have not risen: "look for it in the sky" is wrong for something still under
 * the horizon, and sending somebody out to look for a mark that is not drawn
 * would be the one way to make this worse than saying nothing. So the bearing
 * is given only for an object high enough to have a mark on the frame; for the
 * rest it says what is true — the crossing is already drawn, and the way to
 * see it is to raise the phone.
 */
export const FindInSky: React.FC<Props> = ({ aim, onDone }) => {
  const t = strings().scene.findIt;
  const fade = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // On the id, not on the object: picking the same satellite again is somebody
  // asking again, and the sign starts over for it.
  const id = aim?.id ?? null;
  useEffect(() => {
    if (id === null) return;
    fade.setValue(0);
    const run = Animated.sequence([
      Animated.timing(fade, {
        toValue: 1,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(fade, {
        toValue: 0,
        duration: OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver
      })
    ]);
    // Only a run that reached the end is the sign having been shown; one
    // stopped by the next press is that press's business, and calling back
    // there would clear the aim it has just raised.
    run.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => run.stop();
  }, [fade, id]);

  if (!aim) return null;

  return (
    <View style={styles.middle}>
      <Animated.View
        // Said rather than only drawn: this is the app volunteering something
        // that was not asked for, which is what a live region is.
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.sign,
          {
            opacity: fade,
            transform: [
              { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }
            ]
          }
        ]}
      >
        <View style={styles.badge}>
          <Icon name="sky" size={20} color={theme.color.accent} />
        </View>
        <Text style={styles.title}>{aim.risen ? t.look : t.notUp}</Text>
        <Text style={styles.body}>
          {aim.risen ? fill(t.aim, { direction: aim.direction }) : t.wait}
        </Text>
      </Animated.View>
    </View>
  );
};

const BADGE_SIZE = 38;

const styles = StyleSheet.create({
  /**
   * The middle of the picture, and nothing else in the app is laid out here.
   *
   * Over everything, because it is about the sky rather than about the panels;
   * and transparent to touches down to the last pixel, because what is under it
   * is the one control the normal view has.
   */
  middle: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    // In the style rather than as the prop, which both React Native and the
    // web have moved on from.
    pointerEvents: "none"
  },
  sign: {
    maxWidth: 300,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: theme.radius.panel,
    ...glass(theme.color.panelDeep, 26),
    ...lift
  },
  /** The passes panel's badge, so the sign reads as having come from that list. */
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.accentBorder,
    backgroundColor: theme.color.accentSoft
  },
  title: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textAlign: "center"
  },
  body: {
    color: theme.color.textBright,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center"
  }
});

export default FindInSky;
