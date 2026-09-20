import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { GroundTrackPlan } from "../hooks/useGroundTrack";
import { useOrbitPhase } from "../hooks/useOrbitPhase";
import { fill, strings } from "../i18n";
import { clockTime } from "../i18n/format";
import { loopSecondsFor } from "../satellite/groundTrack";
import { GroundTrackCanvas } from "./GroundTrackCanvas";
import { groundTrackBackdrop, groundTrackMoment, MAP_INK, mapBoxFor } from "./groundTrackScene";
import { theme } from "./theme";

type Props = {
  /** The orbit and the fix it was planned with. See `useGroundTrack`. */
  plan: GroundTrackPlan;
  /** The object it belongs to, for the label a screen reader reads. */
  name: string;
  /** Its category's colour, which is what the sky drew the mark in. */
  color: string;
};

/**
 * What the satellite *does*, as a map at the foot of its card.
 *
 * Everything above this on the card is about here and now — how far away it is,
 * which way to look, whether it can be seen. That is the whole answer to
 * "where is it" and none of the answer to the question a person asks straight
 * afterwards, which is what a thing in the sky is *for*. And the honest answer
 * to that is a shape rather than a figure: the path the object traces on the
 * ground, and the patch of the world it can see from where it is on that path.
 *
 * Three shapes are worth recognising and the map draws all three without
 * saying a word about any of them (`groundTrack.ts`): a low orbit's track runs
 * right round the world in an hour and a half; a geostationary satellite's dot
 * sits still on the equator, which is exactly why a dish can be bolted to a
 * wall; and a tilted orbit that takes a day draws a figure of eight over the
 * same piece of the world, which is what the Japanese navigation satellites are
 * up there to do.
 *
 * **The circle under the dot is the point of the picture.** It is the ground
 * the satellite is above the horizon from — the foot of the cone it looks down
 * — so it is who the object is talking to at that moment. The station's is a
 * patch the size of a continent and a navigation satellite's is a third of the
 * planet, and with the phone's own position marked inside or outside it, "is
 * that one serving me" stops being an abstract question.
 *
 * **It is flown at the orbit's own speed, compressed.** Which is the one thing
 * here that had to be decided rather than drawn: the catalogue's periods differ
 * by a factor of sixteen, so a single compression makes a geostationary orbit
 * unwatchable and a single loop length quietly flattens the difference.
 * `loopSecondsFor` splits it — a fraction of the ratio, so a slower orbit takes
 * visibly longer to come round — and the clock under the map runs in the
 * orbit's own time, so what has been compressed is on the card rather than
 * hidden in it.
 *
 * The width is measured rather than assumed: this sits in a card whose width is
 * the phone's, and the map's height follows from it at the projection's aspect.
 * Nothing is drawn until that measurement lands, which is one frame.
 */
export const GroundTrackMap: React.FC<Props> = ({ plan, name, color }) => {
  const t = strings();
  const [width, setWidth] = useState(0);
  const { track } = plan;

  const box = useMemo(() => mapBoxFor(width), [width]);
  // The world and the whole orbit, which only change when the card is opened
  // on another object or the box is laid out again.
  const backdrop = useMemo(
    () => (track && width > 0 ? groundTrackBackdrop(track, box, plan.observer) : null),
    [track, box, width, plan.observer]
  );

  // Keyed on the orbit's own period, so a replan underneath does not restart
  // the loop — see `useOrbitPhase`.
  const phase = useOrbitPhase(track && backdrop ? loopSecondsFor(track.periodMinutes) : null);
  const moment = track && backdrop ? groundTrackMoment(track, phase, box) : null;

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const measured = Math.floor(nativeEvent.layout.width);
    if (measured !== width) setWidth(measured);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t.card.map.title}</Text>

      {/* The corner radius lives here rather than in either backend: it is the
          one part of the map's shape that is not drawn, and a rounded canvas
          is two more things to keep in step between Skia and the browser. */}
      <View
        style={[styles.frame, { height: box.height }]}
        onLayout={onLayout}
        accessibilityRole="image"
        accessibilityLabel={fill(t.card.map.label, { name })}
      >
        {backdrop && moment && (
          <GroundTrackCanvas backdrop={backdrop} moment={moment} color={color} />
        )}
      </View>

      {/* Memoised, so the row of writing is not reconciled sixty times a second
          for a clock that changes a few times a second. */}
      <MapCaption legend={t.card.map.footprint} at={atLabel(moment?.atMs ?? null)} />
    </View>
  );
};

/** The clock beside the map, or nothing before there is a moment to name. */
function atLabel(atMs: number | null): string {
  if (atMs === null) return "";
  return fill(strings().card.map.at, { time: clockTime(new Date(atMs)) });
}

/**
 * What the picture is, and what moment of the orbit is on it.
 *
 * One row: the circle is the only part of the drawing that needs saying out
 * loud, and the clock is the only figure here that is not already a row of
 * the card above it.
 */
const MapCaption: React.FC<{ legend: string; at: string }> = React.memo(({ legend, at }) => (
  <View style={styles.caption}>
    <Text numberOfLines={1} style={styles.legend}>
      {legend}
    </Text>
    <Text style={styles.at}>{at}</Text>
  </View>
));

MapCaption.displayName = "MapCaption";

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: 14,
    // Off the rule above it, at the spacing every other block on the card has.
    paddingTop: 10,
    paddingBottom: 12
  },
  title: {
    // The purpose line under the name, restated: this is a heading over a
    // block rather than a row of the figures above it.
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginBottom: 7
  },
  frame: {
    borderRadius: theme.radius.control,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    // What is behind the map for the one frame before the width is measured.
    // The sea's own colour, so the box does not flash a different dark.
    backgroundColor: MAP_INK.sea.color
  },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 6
  },
  legend: {
    // Shrinks before the clock does: the clock is a fixed width and the legend
    // is a sentence somebody reads once.
    flexShrink: 1,
    color: theme.color.textFaint,
    fontSize: 10,
    letterSpacing: 0.3
  },
  at: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  }
});

export default GroundTrackMap;
