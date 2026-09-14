import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { glass, lift, theme } from "./theme";

/**
 * The glyphs the control layer is drawn with, built out of views.
 *
 * There is no icon set in this app and no vector library to reach for: adding
 * one is native code, another device build and a megabyte of paths for the
 * half-dozen shapes below. So each is composed from the primitives React
 * Native already draws on both backends — a bordered box, a radius, a
 * rotation, a scale — which costs nothing at run time, renders identically on
 * the phone and in the browser harness, and takes its colour and its size from
 * the props like a font would.
 *
 * They are deliberately plain: a ring for the sky, a list for the catalog,
 * sliders for the settings, stacked planes for the filter. The screen this
 * layer sits on is a photograph, and an icon with any detail in it reads as
 * clutter at the twenty-odd points these are drawn at.
 */
export type IconName =
  /** The sky tab: something in orbit, which is the whole of what this app is. */
  | "sky"
  /** The catalog tab: a list of objects. */
  | "catalog"
  /** The settings tab: the controls about the app rather than about the sky. */
  | "settings"
  /** The filter: the layers of the sky that may be drawn. */
  | "layers"
  /** Onwards into a card, and — turned — the thing that opens a panel. */
  | "chevron"
  /** The way out of a sheet. */
  | "close";

type Props = {
  name: IconName;
  /** The box the glyph is drawn in, in layout points. 20 is a tab bar's. */
  size?: number;
  color?: string;
  /** Which way a chevron points. Ignored by every other glyph. */
  direction?: "right" | "left" | "up" | "down";
};

const ROTATION: Record<NonNullable<Props["direction"]>, string> = {
  right: "45deg",
  left: "-135deg",
  up: "-45deg",
  down: "135deg"
};

export const Icon: React.FC<Props> = ({
  name,
  size = 20,
  color = theme.color.text,
  direction = "right"
}) => {
  const box: ViewStyle = { width: size, height: size };
  const stroke = Math.max(1.25, size * 0.085);

  switch (name) {
    /**
     * A satellite on its orbit: a ring seen edge on, with the body itself out
     * on the near side of it.
     *
     * The body is on the ring rather than at the middle of it, which is the
     * whole difference between this and an eye — and it is also the truer
     * picture, since what the app draws is the thing going round rather than
     * the Earth it goes round.
     */
    case "sky":
      return (
        <View style={[box, styles.centre]}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke * 0.85,
              borderColor: color,
              opacity: 0.85,
              transform: [{ scaleY: 0.38 }, { rotate: "-26deg" }]
            }}
          />
          <View style={[styles.overlay, styles.centre]}>
            <View
              style={{
                width: size * 0.26,
                height: size * 0.26,
                borderRadius: size * 0.13,
                backgroundColor: color,
                // Out on the ring, up and to the right: where the flattened,
                // tipped ellipse actually passes.
                transform: [{ translateX: size * 0.38 }, { translateY: -size * 0.2 }]
              }}
            />
          </View>
        </View>
      );

    /**
     * Three rows, each a marker and the line it names: a catalog.
     *
     * Bolder and further apart than the stroke elsewhere in this file — three
     * hairlines this close together read as one smudge at a tab bar's size, on
     * an actual screen rather than a vector preview.
     */
    case "catalog":
      return (
        <View style={[box, styles.rows]}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={[styles.row, { gap: stroke * 1.4 }]}>
              <View
                style={{
                  width: stroke * 2,
                  height: stroke * 2,
                  borderRadius: stroke,
                  backgroundColor: color
                }}
              />
              <View
                style={{
                  flex: 1,
                  height: stroke * 1.3,
                  borderRadius: stroke,
                  backgroundColor: color
                }}
              />
            </View>
          ))}
        </View>
      );

    /**
     * Two sliders, at different settings. A cogwheel is the other convention
     * and it is the one that falls apart at this size: eight teeth drawn out
     * of eight views is a smudge, where two rails and two knobs stay legible.
     */
    case "settings":
      return (
        <View style={[box, styles.sliders]}>
          {[0.36, 0.68].map((knob) => (
            <View key={knob} style={styles.slider}>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: stroke * 1.3,
                  borderRadius: stroke,
                  backgroundColor: color,
                  opacity: 0.65
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: `${knob * 100}%`,
                  marginLeft: -size * 0.14,
                  width: size * 0.28,
                  height: size * 0.28,
                  borderRadius: size * 0.14,
                  backgroundColor: color
                }}
              />
            </View>
          ))}
        </View>
      );

    /**
     * Three planes stacked in perspective: the layers of sky the filter is
     * switching on and off. The top one is filled, because that is the one
     * being pointed at.
     */
    case "layers":
      return (
        <View style={[box, styles.centre]}>
          {[-1, 0, 1].map((level) => (
            <View
              key={level}
              style={{
                position: "absolute",
                width: size * 0.66,
                height: size * 0.66,
                borderWidth: stroke * 0.9,
                borderColor: color,
                backgroundColor: level === -1 ? color : "transparent",
                opacity: level === -1 ? 1 : 0.75,
                borderRadius: size * 0.08,
                transform: [
                  { translateY: level * size * 0.24 },
                  { scaleY: 0.52 },
                  { rotate: "45deg" }
                ]
              }}
            />
          ))}
        </View>
      );

    /** The corner of a box, turned: the arrow every list row ends in. */
    case "chevron":
      return (
        <View style={[box, styles.centre]}>
          <View
            style={{
              width: size * 0.42,
              height: size * 0.42,
              borderRightWidth: stroke,
              borderTopWidth: stroke,
              borderColor: color,
              transform: [{ rotate: ROTATION[direction] }]
            }}
          />
        </View>
      );

    /** Two bars crossed. */
    case "close":
      return (
        <View style={[box, styles.centre]}>
          {["45deg", "-45deg"].map((angle) => (
            <View
              key={angle}
              style={{
                position: "absolute",
                width: size * 0.7,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
                transform: [{ rotate: angle }]
              }}
            />
          ))}
        </View>
      );
  }
};

type ButtonProps = {
  icon: IconName;
  /** What it is, spoken: these carry no words of their own. */
  label: string;
  onPress: () => void;
  /** Lit, for a control whose panel is currently open. */
  on?: boolean;
  /** The button's diameter. The header's are 40; nothing should be larger. */
  size?: number;
  style?: ViewStyle;
};

/**
 * One round control on the glass: an icon, a hairline and nothing else.
 *
 * The shape the whole layer is built from — 40 points across, which is a
 * thumb, and no wider whatever is inside it. Lit rather than filled when its
 * panel is open: the accent edges it and tints the glass, so an open filter is
 * read at a glance without the button becoming a block of colour over the sky.
 */
export const IconButton: React.FC<ButtonProps> = ({
  icon,
  label,
  onPress,
  on = false,
  size = 40,
  style
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    aria-expanded={on}
    style={[
      styles.button,
      { width: size, height: size, borderRadius: size / 2 },
      on && styles.buttonOn,
      style
    ]}
    onPress={onPress}
  >
    <Icon
      name={icon}
      size={size * 0.5}
      color={on ? theme.color.accent : theme.color.text}
    />
  </Pressable>
);

const styles = StyleSheet.create({
  centre: {
    alignItems: "center",
    justifyContent: "center"
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  rows: {
    justifyContent: "space-between",
    paddingVertical: "6%"
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  sliders: {
    justifyContent: "space-around",
    paddingVertical: "10%"
  },
  slider: {
    height: "30%",
    justifyContent: "center"
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    ...glass(theme.color.panel, 22),
    ...lift
  },
  buttonOn: {
    borderColor: theme.color.accentBorder,
    backgroundColor: theme.color.accentSoft
  }
});

export default Icon;
