import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LABEL_BOX_PX, LabelPlacement } from "./markerScene";
import { cssColor, MarkerPalette } from "./palette";

type Props = {
  labels: LabelPlacement[];
  /** Camera roll, so a name stays level with the horizon. */
  rollDeg: number;
  /** Night or daylight: a name flips with the marks it belongs to. */
  palette: MarkerPalette;
};

/**
 * The landmark names, and the only part of the overlay that is still views.
 *
 * Everything else is drawn into one canvas, and text could be too — but a
 * canvas needs a typeface handed to it, which is a system font lookup on the
 * phone and a downloaded font file in the browser, for two backends that would
 * then disagree about metrics. Views cost nothing here: a label is spent only
 * on the couple of dozen landmarks, and only on the ones that do not collide,
 * so this is a dozen views against the five hundred the marks used to be.
 *
 * Each is memoized against sub-pixel movement, and placed by a transform
 * rather than by `left` and `top` — moving a name is not a reason to lay the
 * overlay out again.
 */
export const MarkerLabels: React.FC<Props> = ({ labels, rollDeg, palette }) => {
  // A photograph is not a background you can pick a text colour against, so the
  // name carries the marks' own outline as a shadow and flips with them.
  const shadowColor = cssColor(palette.outline);
  return (
    <>
      {labels.map((label) => (
        <Label
          key={label.key}
          name={label.name}
          x={label.x}
          y={label.y}
          offsetY={label.offsetY}
          alpha={label.alpha}
          rollDeg={rollDeg}
          color={palette.label}
          shadowColor={shadowColor}
        />
      ))}
    </>
  );
};

type LabelProps = {
  name: string;
  x: number;
  y: number;
  offsetY: number;
  alpha: number;
  rollDeg: number;
  color: string;
  shadowColor: string;
};

const Label = React.memo(function Label({
  name,
  x,
  y,
  offsetY,
  alpha,
  rollDeg,
  color,
  shadowColor
}: LabelProps) {
  return (
    <View
      style={[
        styles.box,
        {
          opacity: alpha,
          transform: [{ translateX: x }, { translateY: y }, { rotate: `${-rollDeg}deg` }]
        }
      ]}
    >
      <Text
        // Two, for a name written on a path: the object, and the clock time it
        // is at that point of the line, which is a line each (`markerScene`). A
        // marker's own name is one word and takes one of them — unless it is
        // long enough not to fit the box, and `Einstein Probe` is, in which
        // case wrapping it says more than cutting it did.
        numberOfLines={2}
        style={[
          styles.label,
          { top: LABEL_BOX_PX / 2 + offsetY, color, textShadowColor: shadowColor }
        ]}
      >
        {name}
      </Text>
    </View>
  );
}, unmoved);

/**
 * Whether two frames of one label are close enough to skip the redraw.
 *
 * Not an equality test: the sky moves, and a comparison that only caught
 * identical frames would pass for none of them. Drift cannot accumulate —
 * React compares against the props it last *rendered*, not the last it was
 * handed — so a name creeping a tenth of a pixel a frame is redrawn as soon as
 * the total reaches the threshold.
 */
function unmoved(previous: LabelProps, next: LabelProps): boolean {
  return (
    previous.name === next.name &&
    previous.color === next.color &&
    previous.shadowColor === next.shadowColor &&
    within(previous.x, next.x, POSITION_EPSILON_PX) &&
    within(previous.y, next.y, POSITION_EPSILON_PX) &&
    within(previous.offsetY, next.offsetY, POSITION_EPSILON_PX) &&
    within(previous.alpha, next.alpha, OPACITY_EPSILON) &&
    within(previous.rollDeg, next.rollDeg, ANGLE_EPSILON_DEG)
  );
}

const within = (previous: number, next: number, tolerance: number): boolean =>
  Math.abs(previous - next) < tolerance;

/** Movement below this, in layout pixels, is not worth a redraw. */
const POSITION_EPSILON_PX = 0.25;
/** The same, for a rotation: a quarter degree turns a name by well under a pixel. */
const ANGLE_EPSILON_DEG = 0.25;
/** The same, for a fade: a hundredth of the way through one. */
const OPACITY_EPSILON = 0.01;

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    pointerEvents: "none",
    // Sized rather than a zero-size anchor because a label is a `Text`, and
    // react-native-web caps one at `max-width: 100%` of its parent — inside a
    // box with no width that resolves to zero and the name is clipped away.
    width: LABEL_BOX_PX,
    height: LABEL_BOX_PX,
    // Placed by a transform from the frame's top-left, and centred on the
    // marker by these margins — so the roll above turns the box about it.
    left: 0,
    top: 0,
    marginLeft: -LABEL_BOX_PX / 2,
    marginTop: -LABEL_BOX_PX / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    // Colour and shadow come from the palette, which the day decides.
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 }
  }
});
