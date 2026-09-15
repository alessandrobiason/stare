import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../hooks/useLocale";
import { fill, strings } from "../i18n";
import {
  availableSteps,
  BUBBLE_MARGIN,
  BUBBLE_MAX_WIDTH,
  placeBubble,
  Rect,
  Size,
  stepAfter,
  stepAt,
  TourStep,
  tourSteps,
  TourTarget
} from "../onboarding/tourSteps";
import { MarkTile } from "./MarkTile";
import { theme } from "./theme";
import { TourTargets, useTourTargets } from "./tourTargets";

type Props = {
  /** Finished or skipped. Either way the tour is over. */
  onDone: () => void;
};

/** Every control a step can point at, measured together. */
const TARGETS: readonly TourTarget[] = ["count", "filter", "freeze", "passes", "settings"];

/**
 * How often the controls are measured again while the tour is up.
 *
 * Often enough to follow the layout when it moves — a card arriving pushes the
 * compass up, the count grows a digit — and cheap: five measurements.
 */
const MEASURE_EVERY_MS = 300;

/** The dim over everything the current step is not about. */
const DIM = "rgba(2, 6, 14, 0.72)";
/** Lighter for the marks step, which is about the sky behind it. */
const DIM_LIGHT = "rgba(2, 6, 14, 0.45)";
const ARROW_SIZE = 12;
const useNativeDriver = Platform.OS !== "web";

/**
 * The tour of the sky view: one step at a time, each lighting up the control it
 * is about and saying the one thing about it that is not obvious from looking.
 *
 * Laid over the running view rather than in place of it, so what it explains is
 * really there — the real count, the real card — and closing it leaves a sky
 * that never stopped. The rest of the view is dimmed and takes no touches while
 * it is up; a tap anywhere moves on, as does the button, and Skip ends it.
 *
 * Which steps and what they say are in `tourSteps.ts`; this measures where the
 * controls are and lays the hole, the bubble and its arrow out around them.
 */
export const GuideTour: React.FC<Props> = ({ onDone }) => {
  useLocale();
  const t = strings().tour;
  const insets = useSafeAreaInsets();
  const targets = useTourTargets();
  const rootRef = useRef<View>(null);
  const [screen, setScreen] = useState<Size | null>(null);
  const [rects, setRects] = useState<Partial<Record<TourTarget, Rect>> | null>(null);
  const [stepId, setStepId] = useState<TourStep["id"]>("marks");
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const all = tourSteps();
  const available = availableSteps(all, (target) => Boolean(rects?.[target]));
  const step = rects ? stepAt(all, available, stepId) : null;
  const visible = screen !== null && step !== null;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScreen((current) =>
      current && current.width === width && current.height === height ? current : { width, height }
    );
  }, []);

  useEffect(() => {
    if (!targets) return;
    let live = true;
    const measure = () => {
      void measureTargets(rootRef.current, targets).then((next) => {
        if (live && next) setRects((current) => (sameRects(current, next) ? current : next));
      });
    };
    measure();
    const timer = setInterval(measure, MEASURE_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [targets]);

  // Measured and nothing left to show: the tour has run out of steps.
  const exhausted = rects !== null && step === null;
  useEffect(() => {
    if (exhausted) onDone();
  }, [exhausted, onDone]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fade, pulse, visible]);

  const next = step ? stepAfter(all, available, step.id) : null;
  const advance = () => {
    if (next) setStepId(next.id);
    else onDone();
  };

  const target = step?.target ? rects?.[step.target] : undefined;
  const placement = screen && target ? placeBubble(target, screen) : null;
  const width = screen ? Math.min(BUBBLE_MAX_WIDTH, screen.width - BUBBLE_MARGIN * 2) : 0;
  const position = step ? available.findIndex((one) => one.id === step.id) + 1 : 0;

  const content = step ? (
    <>
      <View style={styles.head}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.counter}>
          {fill(t.step, { step: position, count: available.length })}
        </Text>
      </View>
      <Text style={styles.body}>{step.body}</Text>

      {step.marks?.map((mark) => (
        <View key={mark.sample} style={styles.mark}>
          <MarkTile sample={mark.sample} />
          <View style={styles.markText}>
            <Text style={styles.markName}>{mark.name}</Text>
            <Text style={styles.markMeaning}>{mark.meaning}</Text>
          </View>
        </View>
      ))}

      <View style={styles.actions}>
        {next ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onDone}>
            <Text style={styles.skip}>{t.skip}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable accessibilityRole="button" style={styles.button} onPress={advance}>
          <Text style={styles.buttonLabel}>{next ? t.next : t.done}</Text>
        </Pressable>
      </View>
    </>
  ) : null;

  return (
    <View
      ref={rootRef}
      style={[styles.root, !visible && styles.passThrough]}
      onLayout={onLayout}
      aria-modal={visible}
    >
      {visible && step && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          {/* The dim, and the hole in it around the control. A tap on either
              moves on, rather than reaching the view underneath. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={next ? t.next : t.done}
            style={[StyleSheet.absoluteFill, styles.clip]}
            onPress={advance}
          >
            {placement && screen ? (
              <>
                <View style={holeStyle(placement.hole, screen)} />
                <Animated.View
                  style={[
                    styles.ring,
                    {
                      left: placement.hole.x,
                      top: placement.hole.y,
                      width: placement.hole.width,
                      height: placement.hole.height,
                      borderRadius: placement.hole.radius,
                      opacity: pulse
                    }
                  ]}
                />
              </>
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.dimLight]} />
            )}
          </Pressable>

          {placement ? (
            <View
              key={step.id}
              style={[
                styles.bubble,
                {
                  left: placement.left,
                  width: placement.width,
                  top: placement.top,
                  bottom: placement.bottom
                }
              ]}
            >
              <View
                style={[
                  styles.arrow,
                  { left: placement.arrow.left - ARROW_SIZE / 2 },
                  placement.arrow.side === "top" ? styles.arrowTop : styles.arrowBottom
                ]}
              />
              {content}
            </View>
          ) : (
            <View
              style={[
                styles.centre,
                { paddingTop: insets.top, paddingBottom: insets.bottom }
              ]}
            >
              <View key={step.id} style={[styles.bubble, styles.bubbleCentred, { width }]}>
                {content}
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
};

/**
 * The dim, as one view with a hole in it: a border far wider than the screen
 * around a box the size of the hole, rounded so that its inner edge has the
 * hole's own corners. One view rather than four strips, which would leave the
 * corners of a rounded hole lit.
 */
function holeStyle(hole: Rect & { radius: number }, screen: Size) {
  // The hole is on the screen, so one screen's length past it covers the rest.
  const reach = Math.max(screen.width, screen.height);
  return {
    position: "absolute" as const,
    left: hole.x - reach,
    top: hole.y - reach,
    width: hole.width + reach * 2,
    height: hole.height + reach * 2,
    borderWidth: reach,
    borderRadius: reach + hole.radius,
    borderColor: DIM
  };
}

type Measured = { x: number; y: number; width: number; height: number };

function inWindow(node: View): Promise<Measured | null> {
  return new Promise((resolve) => {
    if (typeof node.measureInWindow !== "function") {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/** Every control that is on screen, relative to the tour's own box. */
async function measureTargets(
  root: View | null,
  targets: TourTargets
): Promise<Partial<Record<TourTarget, Rect>> | null> {
  if (!root) return null;
  const origin = await inWindow(root);
  if (!origin) return null;
  const rects: Partial<Record<TourTarget, Rect>> = {};
  await Promise.all(
    TARGETS.map(async (id) => {
      const node = targets.node(id);
      const rect = node ? await inWindow(node) : null;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      rects[id] = {
        x: rect.x - origin.x,
        y: rect.y - origin.y,
        width: rect.width,
        height: rect.height
      };
    })
  );
  return rects;
}

function sameRects(
  a: Partial<Record<TourTarget, Rect>> | null,
  b: Partial<Record<TourTarget, Rect>>
): boolean {
  if (!a) return false;
  return TARGETS.every((id) => {
    const one = a[id];
    const two = b[id];
    if (!one || !two) return one === two;
    return (
      Math.abs(one.x - two.x) < 0.5 &&
      Math.abs(one.y - two.y) < 0.5 &&
      Math.abs(one.width - two.width) < 0.5 &&
      Math.abs(one.height - two.height) < 0.5
    );
  });
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill
  },
  // Until it is up, the view underneath is still the view.
  passThrough: {
    pointerEvents: "none"
  },
  clip: {
    overflow: "hidden"
  },
  dimLight: {
    backgroundColor: DIM_LIGHT
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderColor: theme.color.accent
  },
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none"
  },
  bubble: {
    position: "absolute",
    padding: 16,
    // Tighter than a panel's, so the arrow can sit under a control near the
    // edge of the screen without running into the corner.
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.color.dividerStrong,
    backgroundColor: "rgba(9, 18, 34, 0.97)"
  },
  bubbleCentred: {
    position: "relative"
  },
  arrow: {
    position: "absolute",
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    backgroundColor: "rgba(9, 18, 34, 0.97)",
    borderColor: theme.color.dividerStrong,
    transform: [{ rotate: "45deg" }]
  },
  arrowTop: {
    top: -ARROW_SIZE / 2 - 1,
    borderTopWidth: 1,
    borderLeftWidth: 1
  },
  arrowBottom: {
    bottom: -ARROW_SIZE / 2 - 1,
    borderBottomWidth: 1,
    borderRightWidth: 1
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12
  },
  title: {
    flexShrink: 1,
    color: theme.color.textBright,
    fontSize: 16,
    fontWeight: "600"
  },
  counter: {
    color: theme.color.textFaint,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  body: {
    marginTop: 6,
    color: theme.color.textDim,
    fontSize: 13,
    lineHeight: 18
  },
  mark: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  markText: {
    flex: 1
  },
  markName: {
    color: theme.color.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  markMeaning: {
    marginTop: 1,
    color: theme.color.textDim,
    fontSize: 11.5,
    lineHeight: 15
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  skip: {
    color: theme.color.textDim,
    fontSize: 13,
    fontWeight: "500"
  },
  button: {
    minWidth: 84,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: theme.radius.control,
    alignItems: "center",
    backgroundColor: theme.color.accent
  },
  buttonLabel: {
    color: "#04121f",
    fontSize: 13,
    fontWeight: "700"
  }
});

export default GuideTour;
