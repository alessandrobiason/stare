import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BootActivity } from "../boot/bootRunner";
import { MIN_BOOT_SCREEN_MS } from "../constants";
import { BootProgressFeed } from "../hooks/useAppBoot";
import { fill, strings } from "../i18n";
import { groupNumber } from "../i18n/format";
import { BOOT_LIGHT_COLORS } from "./bootSky";
import { theme } from "./theme";

/**
 * How far start-up has got, under the app's name on the boot screen.
 *
 * **Why there is one again.** The screen carried a bar and a list of start-up
 * steps once, and losing both was right: the steps named work nobody could act
 * on, and on a warm launch the whole thing was a flash. What that reasoning
 * missed is the launch it does not describe. The first one on a device fetches
 * 95 MB of segmentation model before anything can be drawn, and boot will not
 * open the view without it — so for however many minutes an ordinary connection
 * takes, the app was a still word over a moving light, indistinguishable from
 * one that had hung. That is the single likeliest thing to be mistaken for a
 * broken app, by a reviewer and by everybody after them.
 *
 * So: the motion says something is happening, and the bar says how much is
 * left. A bar rather than a percentage, and the difference is not decorative —
 * a number is read, compared and worried at, which is a lot of attention to
 * ask for a thing whose only message is "not yet". A line filling is taken in
 * without being looked at. The megabytes do appear, but only underneath, and
 * only on a launch slow enough to have earned an explanation.
 *
 * **It is shown on every launch**, which is what makes it a part of the app's
 * opening rather than an apology that turns up when something is wrong. On a
 * warm launch it simply sweeps and is gone.
 */

/**
 * How quickly the drawn bar closes the distance to where the work actually is,
 * as a proportion of the remaining gap per second.
 *
 * Eased rather than set, because the steps behind it settle in jumps — the
 * catalogue is worth a seventh of the bar and lands all at once — and a bar
 * that teleports reads as a bar that is making its numbers up. Fast enough to
 * be following the work rather than lagging behind it: a jump is crossed in
 * about half a second.
 */
const EASE_PER_SECOND = 6;

/** How long the line underneath takes to arrive, once it has something to say. */
const CAPTION_FADE_MS = 450;

/** Megabytes as the rest of the project counts them, which is 1024 × 1024. */
const BYTES_PER_MB = 1024 * 1024;

type Props = {
  /** Read at draw time rather than passed by value. See `BootProgressFeed`. */
  progress: BootProgressFeed;
};

/**
 * How full the bar should be, given how far the work has got and how long the
 * screen has been up.
 *
 * The bar is held under the clock as well as under the work, and that is what
 * keeps it honest at both ends.
 *
 * Boot holds this screen for `MIN_BOOT_SCREEN_MS` however fast the work
 * finishes (`useAppBoot`), so a warm launch whose five steps are done in three
 * hundred milliseconds would otherwise fill the bar and then sit full for two
 * more seconds — a finished bar over an app that has not opened, which reads as
 * the thing that is stuck. Capped by the clock, it instead sweeps across in
 * exactly the time the screen is up and completes as the view arrives.
 *
 * On a cold launch the cap is long since passed and the work is the whole of
 * it, which is the other half of the same idea: the bar never claims more than
 * the slower of the two.
 *
 * Both terms only rise, so this does too.
 */
export function bootBarTarget(fraction: number, elapsedMs: number): number {
  return Math.max(0, Math.min(fraction, elapsedMs / MIN_BOOT_SCREEN_MS, 1));
}

/** The line under the bar, or `null` when there is nothing worth saying. */
export function bootActivityText(activity: BootActivity | null): string | null {
  if (!activity) return null;
  const t = strings().boot.activity;

  if (activity.kind === "preparing") return t.preparing;

  const done = groupNumber(Math.floor(activity.receivedBytes / BYTES_PER_MB));
  // Without a `Content-Length` there is no total to quote, and a size with one
  // half missing is worse than the sentence on its own.
  if (activity.totalBytes === null) return t.downloading;

  const total = groupNumber(Math.round(activity.totalBytes / BYTES_PER_MB));
  return `${t.downloading} · ${fill(t.size, { done, total })}`;
}

export const BootProgressBar: React.FC<Props> = ({ progress }) => {
  /**
   * The drawn state, advanced once per display frame.
   *
   * Kept in a ref as well as in state because the next frame is computed from
   * the last one: reading it back out of `frame` would tie the arithmetic to
   * React's own scheduling, and a dropped render would be a skipped step of the
   * easing rather than a frame not drawn.
   */
  const drawnRef = useRef({ fill: 0, elapsedMs: 0 });
  const [frame, setFrame] = useState(drawnRef.current);

  useEffect(() => {
    let previousNow: number | null = null;
    let handle = requestAnimationFrame(function tick(now: number) {
      const drawn = drawnRef.current;
      const seconds = previousNow === null ? 0 : (now - previousNow) / 1000;
      previousNow = now;
      const elapsedMs = drawn.elapsedMs + seconds * 1000;
      const target = bootBarTarget(progress.fraction, elapsedMs);
      const eased = drawn.fill + (target - drawn.fill) * (1 - Math.exp(-EASE_PER_SECOND * seconds));

      // Both terms of the target only rise, so this is monotonic already; the
      // floor is here because floating-point easing towards a value it has
      // effectively reached can still step back by a fraction of a pixel.
      const next = { fill: Math.max(drawn.fill, eased), elapsedMs };
      drawnRef.current = next;
      setFrame(next);
      handle = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(handle);
    // `progress` is one object for the life of the boot (`BootProgressFeed`),
    // so this starts once and is read from inside the loop.
  }, [progress]);

  const caption = bootActivityText(progress.activity);
  /**
   * Nothing is said until a launch has outlasted the minimum the screen is
   * held for, because until then there is no wait to explain — every launch
   * takes that long, and a line about a download on one that is about to open
   * would be noise on the app's own opening beat.
   */
  const captionOpacity = Math.min(
    1,
    Math.max(0, (frame.elapsedMs - MIN_BOOT_SCREEN_MS) / CAPTION_FADE_MS)
  );

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${frame.fill * 100}%` }]} />
      </View>

      {caption && captionOpacity > 0 ? (
        <View style={[styles.caption, { opacity: captionOpacity }]}>
          <Text style={styles.captionLine}>{caption}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  /**
   * Hung off the middle of the screen rather than stacked under the name.
   *
   * The name is centred against the sky the light crosses, and every pass in
   * `BOOT_PASSES` is composed around that; a sibling in the flow would have
   * pushed it up by half of whatever this is tall, and moved the one fixed
   * point of the composition to make room for a line two pixels high.
   */
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    marginTop: 52,
    alignItems: "center"
  },
  /**
   * Short, and nowhere near the width of the screen.
   *
   * A bar the width of a phone is a download manager. This one is set to about
   * the width of the name above it, so the two read as one mark — and a short
   * bar also moves visibly for every megabyte, where the same progress spread
   * across the screen is a creep.
   */
  track: {
    width: 132,
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.11)"
  },
  /**
   * The champagne of the light crossing above it (`BOOT_LIGHT_COLORS`), not the
   * app's accent blue.
   *
   * Two reasons, and the second is the real one. The blue belongs to controls
   * that do something when pressed (`theme.color.accent`) and nothing on this
   * screen does. And the only other thing lit on a black sky here is that
   * satellite: sharing its colour makes the bar part of the same picture rather
   * than a piece of interface laid over it.
   */
  fill: {
    height: "100%",
    borderRadius: 1,
    backgroundColor: BOOT_LIGHT_COLORS.color,
    // The same bloom the light has, at a fraction of it: enough that the bar
    // sits in the night rather than on it.
    shadowColor: BOOT_LIGHT_COLORS.bloom,
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }
  },
  caption: {
    marginTop: 18,
    alignItems: "center",
    paddingHorizontal: 24
  },
  captionLine: {
    color: theme.color.textDim,
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: "center"
  }
});

export default BootProgressBar;
