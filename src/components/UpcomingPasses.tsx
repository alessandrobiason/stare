import React, { MutableRefObject, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { passDirection, passSeeing, timeUntil } from "../i18n/format";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { OrbitEpoch } from "../types";
import { panelStyles, theme } from "./theme";

type Props = {
  /**
   * The landmarks' next passes, soonest first, as `upcomingPasses` describes
   * them. Empty while the landmark tier is filtered off, and on a sky where
   * nothing rises for the next three hours.
   */
  passes: readonly UpcomingPass[];
  /**
   * The clock the passes are written against: the phone's, or the replay's.
   *
   * A ref rather than a time, because the countdown ticks on this panel's own
   * timer and nothing else on screen changes when it does. Reading the epoch is
   * also the only way the harness's clock reaches this panel — a pass planned
   * against a recording an hour old counts down against that recording, not
   * against the wall.
   */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** Open the card for one of them, as tapping its mark on the sky would. */
  onSelect: (name: string) => void;
};

/**
 * What is coming over, and how long there is to get outside.
 *
 * The third panel around the sky, and the only one in the future tense. The
 * count in the opposite corner says what is on the frame and the filter says
 * what may be drawn — both of them facts about this instant — and the question
 * neither answers is the one asked before the phone goes up at all: is anything
 * worth waiting for.
 *
 * The app has always known. The landmarks carry their next three hours of sky
 * with them (`orbitPath.ts`), drawn as the arc each will trace — but an arc is
 * only an answer to somebody already pointing the phone at the piece of sky it
 * crosses, and for most of those three hours that is nobody: the plan covers
 * the whole sky and the camera holds sixty degrees of it. So the same plan is
 * read out here as a list, where it can be seen without hunting for it.
 *
 * **Shut, it is the next pass**, not a title — `ISS · 14 min`, which is the
 * whole answer for most of the times anyone looks at it. That is the difference
 * between this pill and the two above it: their closed states are labels
 * because a filter has nothing to report until it is opened, and this one has
 * one fact worth more than its own name. Open, it is the rest of the plan: each
 * pass with where to stand for it, how high it gets, and whether it can be seen
 * when it comes.
 *
 * **Nothing at all when there is nothing coming.** The tier filtered off, or a
 * sky where none of the landmarks clear the roofline for three hours — which at
 * high latitudes is most of them, most of the time — and the panel is not
 * drawn. A permanent pill saying "nothing" is a word over the picture in
 * exchange for the absence of news, and the intro says the panel comes and
 * goes for that reason.
 *
 * A row is a target, like the names written along the paths (`namesUnder`): it
 * opens the same card the object's own mark would, which for a pass that has
 * not begun is the card saying how far below the horizon it still is.
 */
export const UpcomingPasses: React.FC<Props> = React.memo(({ passes, epochRef, onSelect }) => {
  // Nothing in this component's props changes when the console's picker changes
  // the language, and every word in the panel does. See `useLocale`.
  useLocale();
  const t = strings().scene.passes;
  const [expanded, setExpanded] = useState(false);
  const nowMs = useEpochSeconds(epochRef);

  const next = passes[0];
  if (!next) return null;

  return (
    <View style={[panelStyles.panel, styles.position]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.open}
        aria-expanded={expanded}
        style={[styles.header, expanded && styles.headerOpen]}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        onPress={() => setExpanded((open) => !open)}
      >
        {expanded ? (
          <Text style={[panelStyles.title, styles.headerTitle]}>{t.title}</Text>
        ) : (
          <>
            {/* Capped and clipped rather than wrapped: shut, this pill is one
                line and `Einstein Probe` is the longest name the tier has. */}
            <Text numberOfLines={1} style={styles.name}>
              {next.name}
            </Text>
            <Text style={styles.when}>{timeUntil(next.startsAtMs - nowMs)}</Text>
          </>
        )}
        <Text style={styles.chevron}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {expanded && (
        // A list, and said to be one: what is under the pill is several passes
        // rather than one panel's worth of prose, and the rows are the targets.
        <View accessibilityRole="list" style={styles.list}>
          {passes.map((pass) => (
            <Pressable
              // The catalogue number, not the name: a station and the ferry
              // docked to it share a piece of sky and a minute, and two passes
              // of the same object are two rows.
              key={`${pass.noradId}-${pass.startsAtMs}`}
              accessibilityRole="button"
              accessibilityLabel={pass.name}
              style={styles.row}
              onPress={() => onSelect(pass.name)}
            >
              <View style={styles.rowHead}>
                <Text numberOfLines={1} style={styles.rowName}>
                  {pass.name}
                </Text>
                <Text style={styles.when}>{timeUntil(pass.startsAtMs - nowMs)}</Text>
              </View>
              {/* Where to stand and what it is worth, then whether it can be
                  seen at all — in that order, because the first two are facts
                  about the sky and the third is the one that decides whether
                  either is worth acting on. */}
              <Text style={styles.rowMeta}>
                {passDirection(pass)} · <Text style={seeingStyle(pass)}>{passSeeing(pass.nakedEye)}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

UpcomingPasses.displayName = "UpcomingPasses";

/**
 * The verdict's own weight: bright for a pass somebody could go and see, the
 * same faint grey as the rest of the line for one they could not.
 *
 * Not the marks' half-strength channel, which says one particular thing — the
 * object is in the Earth's shadow (`filter.shadowKey`) — and would be saying it
 * of three verdicts here that are not that. This is emphasis on the one row in
 * the list worth acting on, which is a different claim and reads as one.
 */
function seeingStyle(pass: UpcomingPass) {
  return pass.nakedEye === "visible" ? styles.seeingVisible : undefined;
}

/**
 * The epoch clock, sampled once a second.
 *
 * A countdown has to move or it is a stale number, and it moves once a minute —
 * but the second it changes on is not the wall's minute boundary, since every
 * pass rounds from its own rise. So it is read every second and published every
 * second, which is one render of this panel and of nothing else: the rows are a
 * handful of `Text`, and the frame loop underneath reads refs and is untouched
 * by a render up here.
 *
 * From the epoch rather than `Date.now()`, because that is the clock the plan
 * itself was made against — a recording being replayed has its own, and a seek
 * moves it by hours. The interval keeps running while the panel is shut, which
 * costs the same and is what keeps the one fact the shut pill carries true.
 */
function useEpochSeconds(epochRef: MutableRefObject<OrbitEpoch>): number {
  const [nowMs, setNowMs] = useState(() => epochRef.current.time.getTime());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(epochRef.current.time.getTime()), 1000);
    return () => clearInterval(timer);
  }, [epochRef]);

  return nowMs;
}

const styles = StyleSheet.create({
  position: {
    // The row above the bottom edge, not the edge itself: that row is spoken
    // for in both scenes — the console toggle on the right, the compass notice
    // across the left, the harness's transport in its place. `bottom: 58` is
    // the line the satellite card opens from, and this is the same left corner
    // of it. The card covers this whole band, which is why the overlay does not
    // draw the panel while one is open, and the compass notice grows upwards
    // into it, which is why it does not draw it while that is up either.
    bottom: 58,
    left: 12,
    // The padding is the header's, so the whole pill is the tap target rather
    // than a line of text with dead margin around it — as the two above it.
    padding: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  headerOpen: {
    paddingBottom: 2
  },
  headerTitle: {
    // The title row is the panel's heading when it is open, and `panelStyles`
    // spaces it for a block underneath; the list below supplies that spacing.
    marginBottom: 0
  },
  name: {
    // Long enough for the longest name the landmark tier carries, and no
    // longer: this sits over the sky.
    maxWidth: 110,
    color: theme.color.textBright,
    fontSize: 11,
    fontWeight: "700"
  },
  when: {
    color: theme.color.text,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  chevron: {
    color: theme.color.textFaint,
    fontSize: 9,
    fontWeight: "700"
  },
  list: {
    paddingHorizontal: 10,
    paddingBottom: 10
  },
  row: {
    // The width the count panel's fleet rows keep, and for the same reason:
    // two panels of different widths over one photograph read as two designs.
    width: 170,
    paddingTop: 7,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: theme.color.divider
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center"
  },
  rowName: {
    flex: 1,
    marginRight: 8,
    color: theme.color.textBright,
    fontSize: 11,
    fontWeight: "700"
  },
  rowMeta: {
    marginTop: 2,
    color: theme.color.textFaint,
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 13
  },
  seeingVisible: {
    color: theme.color.accent
  }
});

export default UpcomingPasses;
