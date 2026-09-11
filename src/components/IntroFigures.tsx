import React, { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { MarkerFrame, MarkerSource } from "../hooks/useAnimatedMarkers";
import {
  FIGURE_MARK_SCALE,
  MARK_TILE,
  MarkSample,
  markSampleFrame,
  PATH_FIGURE_HEIGHT,
  pathFigure,
  SAMPLE_NOW_MS,
  SAMPLE_PASSES
} from "../onboarding/introFigures";
import type { IntroSwatch } from "../onboarding/introPages";
import { cssColor, NIGHT_PALETTE } from "./palette";
import { SatelliteMarkers } from "./SatelliteMarkers";
import { theme } from "./theme";
import { PassesPanel } from "./UpcomingPasses";

/**
 * The intro's pictures: pieces of night sky with the overlay's own marks on them.
 *
 * What is in each picture is decided in `introFigures.ts`, and drawn by the
 * components the sky itself is drawn by — `SatelliteMarkers` for the marks, the
 * lines and the names, `PassesPanel` for the panel. This file only gives them a
 * piece of sky to sit on and numbers what the page goes on to explain.
 *
 * The night palette, always. The intro is read wherever the phone happens to
 * be, and a key drawn in the daylight set would be near-black marks on a card
 * that is already near-black; the evening is also when the marks mean most.
 *
 * The pictures are hidden from screen readers: each is beside the words that
 * say what it shows, and a list of shapes read out as buttons and numbers is
 * noise on top of them.
 */

/** The sky behind every picture: the boot sky's own glow, which is what a night is here. */
const FIGURE_SKY = "#12263f";
/** The roofs the landmark's line comes up from behind: the night's darkest thing. */
const ROOF_COLOR = "#03070d";
const CALLOUT_SIZE = 16;

/** A frame that never changes, as the subscription the renderer takes one through. */
function stillSource(frame: MarkerFrame): MarkerSource {
  return (listener) => {
    listener(frame);
    return () => undefined;
  };
}

const noop = () => undefined;

/** One kind of mark on a tile of sky, the width of a badge. */
export const MarkTile: React.FC<{ sample: MarkSample }> = ({ sample }) => {
  const markers = useMemo(() => stillSource(markSampleFrame(sample)), [sample]);
  return (
    <View style={[styles.sky, styles.tile]} aria-hidden>
      <SatelliteMarkers
        markers={markers}
        frame={MARK_TILE}
        palette={NIGHT_PALETTE}
        scale={FIGURE_MARK_SCALE}
      />
    </View>
  );
};

/**
 * The five colours, each on a chip of sky with the filter's name for it.
 *
 * Swatches rather than marks, as the filter draws them: this is the key to the
 * colour alone, and the shapes are the rows above it.
 */
export const ColorKey: React.FC<{ swatches: readonly IntroSwatch[] }> = ({ swatches }) => (
  <View style={styles.swatches}>
    {swatches.map((swatch) => (
      <View key={swatch.category} style={styles.swatch}>
        <View
          style={[
            styles.swatchDot,
            {
              backgroundColor: NIGHT_PALETTE.categories[swatch.category],
              borderColor: cssColor(NIGHT_PALETTE.outline)
            }
          ]}
        />
        <Text style={styles.swatchName}>{swatch.name}</Text>
      </View>
    ))}
  </View>
);

/** A number on a picture, and the same number beside what it means. */
export const Callout: React.FC<{ number: number; style?: StyleProp<ViewStyle> }> = ({
  number,
  style
}) => (
  <View style={[styles.callout, style]}>
    <Text style={styles.calloutNumber}>{number}</Text>
  </View>
);

/** What a picture's numbers mean, in the order they are numbered. */
export const CalloutList: React.FC<{ callouts: readonly string[] }> = ({ callouts }) => (
  <View>
    {callouts.map((text, index) => (
      <View key={index} style={styles.calloutRow}>
        <Callout number={index + 1} />
        <Text style={styles.calloutText}>{text}</Text>
      </View>
    ))}
  </View>
);

/**
 * A landmark's line coming up from behind the roofs, with its arrowheads and
 * the name and time written on it.
 *
 * As wide as the card, so it is measured before it is drawn: the line is laid
 * out against the width it has, as the sky's lines are against the frame.
 */
export const PathPicture: React.FC = () => {
  const [width, setWidth] = useState<number | null>(null);
  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  }, []);
  const box = useMemo(() => (width ? { width, height: PATH_FIGURE_HEIGHT } : null), [width]);
  const figure = useMemo(() => (box ? pathFigure(box) : null), [box]);
  const markers = useMemo(() => (figure ? stillSource(figure.frame) : null), [figure]);

  return (
    <View style={[styles.sky, styles.path]} onLayout={measure} aria-hidden>
      {box && figure && markers ? (
        <>
          {/* Under the line, as the camera's roofs are under the sky's: a path
              is drawn across the roof its object is about to come out from
              behind. */}
          {figure.roofs.map((roof, index) => (
            <View
              key={index}
              style={[styles.roof, { left: roof.left, width: roof.width, height: roof.height }]}
            />
          ))}
          <SatelliteMarkers
            markers={markers}
            frame={box}
            palette={NIGHT_PALETTE}
            scale={FIGURE_MARK_SCALE}
          />
          {figure.callouts.map((at, index) => (
            <Callout
              key={index}
              number={index + 1}
              style={[
                styles.calloutOnPicture,
                { left: at.x - CALLOUT_SIZE / 2, top: at.y - CALLOUT_SIZE / 2 }
              ]}
            />
          ))}
        </>
      ) : null}
    </View>
  );
};

/**
 * The bottom-left panel twice over a made-up plan: shut, as it sits in the
 * corner, and open, as a tap leaves it.
 */
export const PassesPicture: React.FC = () => (
  <View style={[styles.sky, styles.passes]} aria-hidden>
    <View style={styles.passesRow}>
      <PassesPanel
        passes={SAMPLE_PASSES}
        nowMs={SAMPLE_NOW_MS}
        expanded={false}
        onToggle={noop}
        onSelect={noop}
        style={styles.passesPanel}
      />
      <Callout number={1} style={styles.passesCallout} />
    </View>
    <View style={[styles.passesRow, styles.passesOpen]}>
      <PassesPanel
        passes={SAMPLE_PASSES}
        nowMs={SAMPLE_NOW_MS}
        expanded
        onToggle={noop}
        onSelect={noop}
        style={styles.passesPanel}
      />
      <Callout number={2} style={styles.passesCallout} />
    </View>
  </View>
);

/** How far the panels in the passes picture sit from its edges, in points. */
export const PASSES_PICTURE_PADDING = 10;

const styles = StyleSheet.create({
  sky: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: FIGURE_SKY,
    // A picture, not a control: nothing in it answers a tap.
    pointerEvents: "none"
  },
  tile: {
    width: MARK_TILE.width,
    height: MARK_TILE.height
  },
  path: {
    height: PATH_FIGURE_HEIGHT
  },
  roof: {
    position: "absolute",
    bottom: 0,
    backgroundColor: ROOF_COLOR
  },
  passes: {
    padding: PASSES_PICTURE_PADDING
  },
  passesRow: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  passesOpen: {
    marginTop: PASSES_PICTURE_PADDING
  },
  passesPanel: {
    // Laid out in the picture, rather than pinned to a corner of the screen.
    position: "relative"
  },
  passesCallout: {
    marginLeft: 8,
    marginTop: 5
  },
  swatches: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  swatch: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: FIGURE_SKY
  },
  // The filter's own swatch, a point smaller: see `CategoryLegend`.
  swatchDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    marginRight: 5
  },
  swatchName: {
    color: theme.color.text,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  callout: {
    width: CALLOUT_SIZE,
    height: CALLOUT_SIZE,
    borderRadius: CALLOUT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.accent
  },
  calloutOnPicture: {
    position: "absolute"
  },
  calloutNumber: {
    color: "#04121f",
    fontSize: 10,
    fontWeight: "800"
  },
  calloutRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-start"
  },
  calloutText: {
    flex: 1,
    marginLeft: 8,
    color: theme.color.textDim,
    fontSize: 11.5,
    lineHeight: 16
  }
});
