import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
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
      onExpandedChange={setExpanded}
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
  onExpandedChange: (expanded: boolean) => void;
  onSelect: (name: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Where the tour finds the card on screen. See `useTourTarget`. */
  viewRef?: React.Ref<View>;
};

/**
 * How far, in points, a drag has to travel before it counts as an open or a
 * close rather than a stray touch. Short of it, the list goes back to where it
 * was when the finger landed.
 */
const DRAG_THRESHOLD = 18;
/**
 * A quick flick counts whatever distance it covered: the release velocity, in
 * points per millisecond, past which it does.
 */
const FLING_VELOCITY = 0.5;
/**
 * How far a finger has to move before the card takes the touch as a drag, in
 * points. Past it a press on a row is a drag of the card rather than a tap on
 * the row, so it is kept to a few points more than a thumb wobbles.
 */
const DRAG_SLOP = 6;
/**
 * How long the list takes to slide the whole of its height, in milliseconds.
 * A partial slide — from wherever a drag let go — takes its share of this.
 */
const SLIDE_MS = 260;
/**
 * What one row is guessed to be, in points, until the list has been measured.
 * Only ever read on the first frames of the first drag: the list is laid out
 * the moment it is mounted and its own height replaces this.
 */
const ROW_ESTIMATE = 52;

/**
 * The card as it is drawn: the plan, and how far open it is.
 *
 * Apart from `UpcomingPasses` so it can be rendered against a fixed clock. What
 * it keeps of its own is the slide — how far open the list is at this instant,
 * which a finger moves directly and nothing outside the card needs to know.
 *
 * **The whole card is the handle.** It used to be the grip alone, a strip a
 * couple of dozen points tall that a thumb aiming at the card mostly missed;
 * now a vertical drag anywhere on it opens or shuts the list, a tap on its top
 * does the same, and the rows keep their own taps. The list follows the finger
 * while it is down and slides the rest of the way when it lets go, which is how
 * a sheet on this platform is worked — it no longer appears in one frame.
 */
export const PassesPanel: React.FC<PanelProps> = ({
  passes,
  nowMs,
  expanded,
  onExpandedChange,
  onSelect,
  style,
  viewRef
}) => {
  const t = strings().scene.passes;

  // Nought shut and one open. Driven by the finger while it is down and by a
  // timing once it lets go; a layout property, so not the native driver.
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  /** Where the slide is heading, so a render with `expanded` knows whether it is news. */
  const targetRef = useRef(expanded ? 1 : 0);
  /** Where it was when the finger landed, and where it is now. */
  const dragFromRef = useRef(0);
  const currentRef = useRef(expanded ? 1 : 0);
  // Mounted while the list is open or on its way: shut and still, the rows are
  // not in the tree at all, so the card does not lay out a list nobody sees.
  const [listShown, setListShown] = useState(expanded);
  const [listHeight, setListHeight] = useState<number | null>(null);

  const rowCount = passes.length;
  // Everything the responder and the timing read, through one ref: both are
  // built once, and would otherwise hold the first render's copy.
  const liveRef = useRef({ onExpandedChange, listHeight, rowCount });
  liveRef.current = { onExpandedChange, listHeight, rowCount };

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      currentRef.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const slideTo = useRef((target: 0 | 1) => {
    targetRef.current = target;
    setListShown(true);
    // Said at once rather than when the slide lands, so the card's top reads
    // as what the card is becoming while it gets there.
    liveRef.current.onExpandedChange(target === 1);
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: target,
      duration: Math.max(90, SLIDE_MS * Math.abs(target - currentRef.current)),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start(({ finished }) => {
      // Unmounted only once the slide has actually reached shut: a drag that
      // caught it on the way down keeps the rows it is holding.
      if (finished && targetRef.current === 0) setListShown(false);
    });
  }).current;

  // A change to `expanded` that did not come from this card — the owner
  // shutting it — slides like any other.
  useEffect(() => {
    const target = expanded ? 1 : 0;
    if (targetRef.current !== target) slideTo(target);
  }, [expanded, slideTo]);

  const panResponder = useRef(
    PanResponder.create({
      // Claimed in the capture phase, before a row underneath has decided the
      // touch was a tap on it — and only for a move that is mostly vertical,
      // so a tap anywhere still reaches whatever it landed on.
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        Math.abs(gesture.dy) > DRAG_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        progress.stopAnimation();
        dragFromRef.current = currentRef.current;
        setListShown(true);
      },
      onPanResponderMove: (_evt, gesture) => {
        const { listHeight: measured, rowCount: rows } = liveRef.current;
        const span = Math.max(1, measured ?? rows * ROW_ESTIMATE);
        progress.setValue(clamp01(dragFromRef.current - gesture.dy / span));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const from = dragFromRef.current >= 0.5 ? 1 : 0;
        if (gesture.vy < -FLING_VELOCITY || gesture.dy < -DRAG_THRESHOLD) slideTo(1);
        else if (gesture.vy > FLING_VELOCITY || gesture.dy > DRAG_THRESHOLD) slideTo(0);
        else slideTo(from);
      },
      onPanResponderTerminate: () => slideTo(dragFromRef.current >= 0.5 ? 1 : 0)
    })
  ).current;

  const next = passes[0];
  if (!next) return null;

  const toggle = () => slideTo(targetRef.current === 1 ? 0 : 1);

  return (
    <View ref={viewRef} style={[styles.card, style]} {...panResponder.panHandlers}>
      {/* The grip and the line under it, as one target: a tap anywhere on the
          top of the card opens it or shuts it, and a drag anywhere on the card
          does the same while following the finger. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.open}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={toggle}
      >
        <View style={styles.gripRow}>
          <View style={styles.grip} />
        </View>

        <View style={styles.head}>
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
        </View>
      </Pressable>

      {listShown && (
        // Clipped to however far open the slide is. The list inside is laid out
        // at its own full height whatever this box is, which is what lets it be
        // measured before it has been opened at all.
        <Animated.View
          style={[
            styles.listClip,
            {
              height: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, listHeight ?? rowCount * ROW_ESTIMATE]
              })
            }
          ]}
        >
          {/* A list, and said to be one: what is under the card is several
              passes rather than one panel's worth of prose, and the rows are
              the targets. */}
          <View
            accessibilityRole="list"
            style={styles.list}
            onLayout={({ nativeEvent }) => setListHeight(nativeEvent.layout.height)}
          >
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
                  {/* Where to stand and what it is worth, then whether it can
                      be seen at all — in that order, because the first two are
                      facts about the sky and the third is the one that decides
                      whether either is worth acting on. */}
                  <Text style={styles.meta}>
                    {passDirection(pass)} ·{" "}
                    <Text style={seeingStyle(pass)}>{passSeeing(pass.nakedEye)}</Text>
                  </Text>
                </View>
                <Icon name="chevron" size={14} color={theme.color.textFaint} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
    paddingVertical: 10
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
  listClip: {
    overflow: "hidden"
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
