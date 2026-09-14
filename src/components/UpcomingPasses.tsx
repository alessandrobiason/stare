import React, { MutableRefObject, useEffect, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { passDirection, passSeeing, timeUntil } from "../i18n/format";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { OrbitEpoch } from "../types";
import { Icon } from "./Icon";
import { glass, lift, theme } from "./theme";
import { useTourTarget } from "./tourTargets";

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
  /** Where it sits: laid over the card's own, by the stack that arranges it. */
  style?: StyleProp<ViewStyle>;
};

/**
 * What is coming, as the card at the bottom of the sky.
 *
 * The only panel in the app in the future tense. The count in the header says
 * what is on the frame and the filter says what may be drawn — both of them
 * facts about this instant — and the question neither answers is the one asked
 * before the phone goes up at all: is anything worth waiting for.
 *
 * The app has always known. The landmarks carry their next three hours of sky
 * with them (`orbitPath.ts`), drawn as the arc each will trace — but an arc is
 * only an answer to somebody already pointing the phone at the piece of sky it
 * crosses, and for most of those three hours that is nobody: the plan covers
 * the whole sky and the camera holds sixty degrees of it. So the same plan is
 * read out here, where it can be seen without hunting for it.
 *
 * **Shut, it is the next pass** — the object, how long there is, where to stand
 * and whether it can be seen — which is the whole answer for most of the times
 * anyone looks at it. It stands in the one place on this screen that is a card
 * rather than a control, directly above the tab bar, and it is the same card
 * the satellite details open into: the bottom of the sky view says one thing at
 * a time, and it is always the thing most worth reading.
 *
 * **Open, it is the rest of the plan**: each pass with where to stand for it,
 * how high it gets, and whether it can be seen when it comes.
 *
 * **Nothing at all when there is nothing coming.** The tier filtered off, or a
 * sky where none of the landmarks clear the roofline for three hours — which at
 * high latitudes is most of them, most of the time — and the card is not drawn.
 * A permanent card saying "nothing" is a piece of the picture spent on the
 * absence of news.
 *
 * A row is a target, like the names written along the paths (`namesUnder`): it
 * opens the same details the object's own mark would, which for a pass that has
 * not begun is the card saying how far below the horizon it still is.
 */
export const UpcomingPasses: React.FC<Props> = React.memo(({
  passes,
  epochRef,
  onSelect,
  style
}) => {
  // Nothing in this component's props changes when the console's picker changes
  // the language, and every word in the panel does. See `useLocale`.
  useLocale();
  const [expanded, setExpanded] = useState(false);
  const nowMs = useEpochSeconds(epochRef);
  const viewRef = useTourTarget("passes");

  return (
    <PassesPanel
      passes={passes}
      nowMs={nowMs}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      onSelect={onSelect}
      style={style}
      viewRef={viewRef}
    />
  );
});

UpcomingPasses.displayName = "UpcomingPasses";

type PanelProps = {
  passes: readonly UpcomingPass[];
  /** The clock the countdowns are read against, in epoch milliseconds. */
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (name: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Where the tour finds the card on screen. See `useTourTarget`. */
  viewRef?: React.Ref<View>;
};

/**
 * The card as it is drawn, with nothing of its own to remember or to tick.
 *
 * Apart from `UpcomingPasses` so it can be rendered against a fixed clock.
 */
export const PassesPanel: React.FC<PanelProps> = ({
  passes,
  nowMs,
  expanded,
  onToggle,
  onSelect,
  style,
  viewRef
}) => {
  const t = strings().scene.passes;
  const next = passes[0];
  if (!next) return null;

  return (
    <View ref={viewRef} style={[styles.card, style]}>
      {/* The grip. It is not a drag handle — nothing here is dragged — it is
          the mark every sheet on this platform wears to say it opens, and it
          is what makes a tap on the card an obvious thing to try. */}
      <View style={styles.gripRow}>
        <View style={styles.grip} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.open}
        aria-expanded={expanded}
        style={styles.head}
        onPress={onToggle}
      >
        <View style={styles.badge}>
          <Icon name="sky" size={20} color={theme.color.accent} />
        </View>

        <View style={styles.headText}>
          {expanded ? (
            <Text style={styles.title}>{t.title}</Text>
          ) : (
            <>
              <View style={styles.nameRow}>
                {/* Capped and clipped rather than wrapped: shut, this line is
                    one row and `Einstein Probe` is the longest name the tier
                    has. */}
                <Text numberOfLines={1} style={styles.name}>
                  {next.name}
                </Text>
                <Text style={styles.when}>{timeUntil(next.startsAtMs - nowMs)}</Text>
              </View>
              {/* Two lines rather than one: this is a bearing, a height and a
                  verdict, and in the longer languages that runs past the width
                  of the card. Clipped, what goes first is the verdict, which
                  is the half that decides whether the countdown is worth
                  acting on. */}
              <Text numberOfLines={2} style={styles.meta}>
                {passDirection(next)} ·{" "}
                <Text style={seeingStyle(next)}>{passSeeing(next.nakedEye)}</Text>
              </Text>
            </>
          )}
        </View>

        <Icon
          name="chevron"
          size={16}
          direction={expanded ? "down" : "up"}
          color={theme.color.textFaint}
        />
      </Pressable>

      {expanded && (
        // A list, and said to be one: what is under the card is several passes
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
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.rowName}>
                    {pass.name}
                  </Text>
                  <Text style={styles.when}>{timeUntil(pass.startsAtMs - nowMs)}</Text>
                </View>
                {/* Where to stand and what it is worth, then whether it can be
                    seen at all — in that order, because the first two are facts
                    about the sky and the third is the one that decides whether
                    either is worth acting on. */}
                <Text style={styles.meta}>
                  {passDirection(pass)} ·{" "}
                  <Text style={seeingStyle(pass)}>{passSeeing(pass.nakedEye)}</Text>
                </Text>
              </View>
              <Icon name="chevron" size={14} color={theme.color.textFaint} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

/**
 * The verdict's own weight: the app's accent for a pass somebody could go and
 * see, the same faint grey as the rest of the line for one they could not.
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
 * costs the same and is what keeps the one fact the shut card carries true.
 */
function useEpochSeconds(epochRef: MutableRefObject<OrbitEpoch>): number {
  const [nowMs, setNowMs] = useState(() => epochRef.current.time.getTime());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(epochRef.current.time.getTime()), 1000);
    return () => clearInterval(timer);
  }, [epochRef]);

  return nowMs;
}

const BADGE_SIZE = 38;

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.sheet,
    paddingBottom: 6,
    ...glass(theme.color.panel, 26),
    ...lift
  },
  gripRow: {
    alignItems: "center",
    paddingTop: 7
  },
  grip: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.divider
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
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
  headText: {
    flex: 1,
    gap: 2
  },
  title: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  name: {
    flex: 1,
    color: theme.color.textBright,
    fontSize: 15,
    fontWeight: "600"
  },
  when: {
    color: theme.color.text,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  meta: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 6
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: theme.color.divider
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowName: {
    flex: 1,
    color: theme.color.text,
    fontSize: 13,
    fontWeight: "600"
  },
  seeingVisible: {
    color: theme.color.accent
  }
});

export default UpcomingPasses;
