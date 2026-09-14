import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { MarkerFrame, MarkerSource } from "../hooks/useAnimatedMarkers";
import { FIGURE_MARK_SCALE, MARK_TILE, MarkSample, markSampleFrame } from "../onboarding/markSamples";
import { NIGHT_PALETTE } from "./palette";
import { SatelliteMarkers } from "./SatelliteMarkers";

/**
 * One kind of mark on a small tile of night sky, drawn by the component the sky
 * itself is drawn by. What is on the tile is decided in `markSamples.ts`.
 *
 * The night palette, always: the tour is read wherever the phone happens to be,
 * and a key drawn in the daylight set would be near-black marks on a dark card.
 *
 * Hidden from screen readers: it sits beside the words that say what it shows.
 */

/** The sky behind a tile: the boot sky's own glow, which is what a night is here. */
const FIGURE_SKY = "#12263f";

/** A frame that never changes, as the subscription the renderer takes one through. */
function stillSource(frame: MarkerFrame): MarkerSource {
  return (listener) => {
    listener(frame);
    return () => undefined;
  };
}

export const MarkTile: React.FC<{ sample: MarkSample }> = ({ sample }) => {
  const markers = useMemo(() => stillSource(markSampleFrame(sample)), [sample]);
  return (
    <View style={styles.tile} aria-hidden>
      <SatelliteMarkers
        markers={markers}
        frame={MARK_TILE}
        palette={NIGHT_PALETTE}
        scale={FIGURE_MARK_SCALE}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    width: MARK_TILE.width,
    height: MARK_TILE.height,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: FIGURE_SKY,
    // A picture, not a control: nothing in it answers a tap.
    pointerEvents: "none"
  }
});
