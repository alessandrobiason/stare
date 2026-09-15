import React, { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { OrientationFilter } from "../fusion/orientationFilter";
import { useLocale } from "../hooks/useLocale";
import { fill, strings } from "../i18n";
import { wrapDegrees360 } from "../math/angles";
import { theme } from "./theme";

type Props = {
  /**
   * The attitude the view is aimed with, sampled here on its own animation
   * frame. The same filter the markers are projected from, read and never
   * written: this indicator says where the camera is pointing, it does not
   * decide it.
   */
  orientationFilterRef: MutableRefObject<OrientationFilter>;
  /**
   * Half the field of view the screen is actually showing, in degrees, so the
   * strip is the same ruler the picture is. A cardinal point sitting a third of
   * the way across the strip is a third of the way across the frame.
   */
  halfFovDeg: number;
  /**
   * Hold the strip where it is: the sky above it is frozen, and a strip still
   * following the phone would be saying which way a picture that is no longer
   * on the screen is pointing.
   */
  frozen?: boolean;
};

/**
 * How far apart the points are, in degrees: the eight-point compass, which is
 * the one the rest of the app gives bearings in (`compassPoint`).
 */
const POINT_STEP_DEG = 45;

/**
 * Copies of the ring laid end to end, so a heading near north has something to
 * show on both sides of the marker.
 *
 * The track is one long row of labels placed at their own bearings and slid
 * under a fixed marker — which is the whole reason this moves without a React
 * render — and a single copy of it would run out at north. Three copies is one
 * either side of the one in use, which is more than any field of view can
 * reach past.
 */
const COPIES = [-1, 0, 1];

/**
 * The narrowest the strip's own scale is allowed to get, in degrees either
 * side of the middle.
 *
 * The ruler would otherwise be the camera's: a phone crops a 4:3 frame onto a
 * tall screen and is left showing about twenty degrees across, and twenty
 * degrees of an eight-point compass is a strip with one letter on it —
 * occasionally none. A letter nobody can see is no help in deciding which way
 * to turn, which is the whole question this answers. So the scale opens out
 * until there is always a point in view and usually the next one along, and
 * the strip stops being a second projection of the frame and becomes what it
 * is: a ruler saying which way the camera is pointing.
 */
const MINIMUM_HALF_SPAN_DEG = 62;

/** Height of the strip, and the two rows inside it. */
const LABEL_ROW = 16;
const RULE_ROW = 10;

/**
 * Where the camera is pointing, as a rule under the picture.
 *
 * A horizon strip rather than a compass rose, and the reasons are the same
 * ones that put every other panel in this app on a diet. A rose is a disc:
 * eighty points across at its smallest legible size, sitting over the piece of
 * sky someone is trying to look at, and answering a question — *which way is
 * north* — that this app has never been asked. What is actually wanted is
 * narrower: **is the thing I am looking for to the left or to the right of
 * what I am looking at**, and the answer to that is a ruler, not a dial.
 *
 * So the cardinal points are laid out along the bottom of the frame at the
 * bearings they actually sit at, scaled by the field of view the screen is
 * showing, and the fixed diamond in the middle is where the camera points. A
 * satellite the card says is at `SE 143°` is found by turning until `SE`
 * reaches the diamond. The strip is a couple of dozen points tall and half of
 * it is a hairline, which is about a tenth of what the card above it spends.
 *
 * **It is an indicator and nothing else.** The heading comes from the same
 * filter the markers are projected with, sampled on this component's own
 * animation frame and never written back to — there is no calibration here, no
 * declination, no second opinion about north. If the sky is drawn thirty
 * degrees out then so is this, which is the honest behaviour: the strip and the
 * marks have to be wrong together or the screen is telling two stories.
 *
 * **And it moves without re-rendering.** The labels are placed once, at
 * `bearing × pixels-per-degree`, and the whole track is slid by an `Animated`
 * transform driven from an animation frame — so a turn of the phone costs one
 * style write rather than a React render of a dozen views, sixty times a
 * second. The only thing that renders is the emphasis, which changes when the
 * nearest point changes: eight times per revolution rather than sixty times a
 * second — and memoized, so the view above rendering for a sky mask does not
 * diff the strip either.
 */
export const HorizonCompass: React.FC<Props> = React.memo(({
  orientationFilterRef,
  halfFovDeg,
  frozen = false
}) => {
  // Every label in the strip is a translated letter, and nothing else here
  // changes when the console's picker changes the language. See `useLocale`.
  useLocale();
  const t = strings();
  const [width, setWidth] = useState(0);
  /** Which point the camera is nearest, for the one label that is emphasised. */
  const [nearest, setNearest] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;

  /**
   * How far a degree is along the strip.
   *
   * Linear in the bearing rather than in the tangent the projection uses, and
   * never tighter than `MINIMUM_HALF_SPAN_DEG`. Linear is the one that reads as
   * a ruler: evenly spaced points, moving at an even rate as the phone turns.
   * This is a label for the frame, not a second projection of it.
   */
  const halfSpanDeg = Math.max(halfFovDeg, MINIMUM_HALF_SPAN_DEG);
  const pixelsPerDegree = width > 0 ? width / 2 / halfSpanDeg : 0;

  useEffect(() => {
    // Left on the last heading it slid to, which is the frame the markers were
    // frozen on: both are read from the same filter on the same frame.
    if (pixelsPerDegree <= 0 || frozen) return;
    let frame = 0;
    /** The last emphasis published, so a still phone costs no renders at all. */
    let shown = -1;

    const tick = () => {
      const { headingDeg } = orientationFilterRef.current.sample(performance.now() / 1000);
      slide.setValue(-headingDeg * pixelsPerDegree);

      const point = nearestPoint(headingDeg);
      if (point !== shown) {
        shown = point;
        setNearest(point);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [frozen, orientationFilterRef, pixelsPerDegree, slide]);

  /**
   * Every label in the strip, at its own bearing, three rings of them.
   *
   * Rebuilt only when the scale changes — a resize, or a different field of
   * view — rather than on the frames the strip is moving on.
   */
  const marks = useMemo(
    () => compassMarks(t.compass, pixelsPerDegree),
    [pixelsPerDegree, t.compass]
  );

  return (
    <View
      style={styles.strip}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      // One reading rather than eight labels read out one after another: what
      // this says is which way the phone is pointing.
      accessibilityRole="text"
      accessibilityLabel={fill(t.scene.compass.facing, { point: t.compass[nearest] })}
    >
      <View style={styles.window}>
        <Animated.View style={[styles.track, { transform: [{ translateX: slide }] }]}>
          {marks.map((mark) => (
            <View key={mark.key} style={[styles.mark, { left: mark.x }]}>
              <Text
                style={[styles.label, mark.index === nearest && styles.labelNear]}
                numberOfLines={1}
              >
                {mark.label}
              </Text>
              <View style={[styles.tick, mark.index === nearest && styles.tickNear]} />
            </View>
          ))}
        </Animated.View>
      </View>

      {/* The rule the points are read against, faded out at both ends rather
          than stopped: a hairline that ends in mid-air reads as a panel edge,
          and this is not a panel. Five segments is enough of a gradient at a
          tenth of an opacity, and costs no image and no library. */}
      <View style={styles.rule}>
        {RULE_FADE.map((opacity, index) => (
          <View key={index} style={[styles.ruleSegment, { opacity }]} />
        ))}
      </View>

      {/* Where the camera is pointing. A diamond on the line, small enough that
          it reads as a mark on a ruler rather than as a control. */}
      <View style={styles.heading}>
        <View style={styles.diamond} />
      </View>
    </View>
  );
});

HorizonCompass.displayName = "HorizonCompass";

/** The eight points the compass table carries, from north, clockwise. */
const COMPASS_POINTS = 8;

/** The rule's opacity across its own width: a fade to nothing at both ends. */
const RULE_FADE = [0.08, 0.22, 0.34, 0.22, 0.08];

const styles = StyleSheet.create({
  strip: {
    height: LABEL_ROW + RULE_ROW,
    justifyContent: "flex-start",
    // The strip is over the picture, and the picture is the control: a tap
    // anywhere along it selects whatever mark is behind it. In the style
    // rather than as the prop, which both React Native and the web have moved
    // on from and the latter warns about.
    pointerEvents: "none"
  },
  window: {
    height: LABEL_ROW,
    // The track is several screens wide; this is what keeps it to the strip.
    overflow: "hidden"
  },
  track: {
    position: "absolute",
    left: "50%",
    top: 0,
    height: LABEL_ROW
  },
  mark: {
    position: "absolute",
    top: 0,
    // Centred on its own bearing: the label is the mark, not the box.
    width: 40,
    marginLeft: -20,
    alignItems: "center"
  },
  label: {
    color: theme.color.text,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    opacity: 0.65,
    // A camera picture is not a background you can pick a text colour against
    // — the strip sits over a lit horizon as often as over a dark sky — so the
    // letters carry their own, as the title does.
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5
  },
  labelNear: {
    // The one emphasis in the strip, and it is weight rather than colour: the
    // accent is spent on controls, and a lit letter here would read as one.
    color: theme.color.textBright,
    opacity: 1
  },
  tick: {
    marginTop: 2,
    width: 1,
    height: 3,
    backgroundColor: theme.color.textBright,
    opacity: 0.45
  },
  tickNear: {
    opacity: 0.9
  },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    height: StyleSheet.hairlineWidth * 2,
    marginTop: 3
  },
  ruleSegment: {
    flex: 1,
    height: "100%",
    backgroundColor: theme.color.textBright
  },
  heading: {
    position: "absolute",
    left: 0,
    right: 0,
    // On the rule, which is `LABEL_ROW` down plus the rule's own margin.
    top: LABEL_ROW,
    alignItems: "center"
  },
  diamond: {
    width: 6,
    height: 6,
    marginTop: -0.5,
    backgroundColor: theme.color.textBright,
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000000",
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }
  }
});

export default HorizonCompass;

/** One label on the strip: what it says, and how far along it sits. */
export type CompassMark = { key: string; index: number; label: string; x: number };

/**
 * Every label the strip carries, at its own place on the track.
 *
 * `x` is measured from the track's origin, which the strip pins to the middle
 * of the screen and then slides by the heading — so a point at `x` is under
 * the marker exactly when the camera is pointing at it. Three rings of labels
 * rather than one, so a heading either side of north has points on both sides
 * of the marker rather than a gap where the track ran out.
 */
export function compassMarks(
  labels: readonly string[],
  pixelsPerDegree: number
): CompassMark[] {
  if (!(pixelsPerDegree > 0)) return [];
  return COPIES.flatMap((copy) =>
    labels.map((label, index) => ({
      key: `${copy}:${index}`,
      index,
      label,
      x: (index * POINT_STEP_DEG + copy * 360) * pixelsPerDegree
    }))
  );
}

/**
 * Which of the eight points a heading is nearest, as an index into the compass
 * table: the one label the strip draws at full strength.
 *
 * Rounded rather than floored, so the emphasis changes halfway between two
 * points — at 22.5° off north the phone is as near north-east as north, and
 * the letter under the marker is the one that should be lit.
 */
export function nearestPoint(headingDeg: number): number {
  const step = Math.round(wrapDegrees360(headingDeg) / POINT_STEP_DEG);
  return step % COMPASS_POINTS;
}
