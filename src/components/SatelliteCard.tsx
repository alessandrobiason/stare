import React, { MutableRefObject, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fill, strings } from "../i18n";
import { kilometres, lookDirection, orbitPeriod, speed } from "../i18n/format";
import { briefingFor } from "../satellite/briefing";
import { SatelliteDetail } from "../types";
import { cssColor, MarkerPalette } from "./palette";
import { theme } from "./theme";

type Props = {
  /**
   * Every satellite the tap covered, nearest to it first. One name is the
   * ordinary case; a cluster is why this is a list. See `markersUnder`.
   */
  names: string[];
  /** Which of them is being described, and ringed on the frame. */
  selected: string;
  onSelect: (name: string) => void;
  onClose: () => void;
  /**
   * Reads the newest figures for a name, on this card's own slow timer.
   *
   * A ref, so the card keeps sampling across a re-render without resubscribing,
   * and so the lookup can close over the current epoch without the card knowing
   * what an epoch is. Returns `null` for a name the catalog no longer carries.
   */
  describeRef: MutableRefObject<(name: string) => SatelliteDetail | null>;
  /** The colours the sky is drawn in, so the swatch is the mark on the frame. */
  palette: MarkerPalette;
};

/**
 * How often the figures are re-read.
 *
 * The same reasoning as the debug panel's, and the same answer: everything here
 * moves continuously, and nobody reads a card sixty times a second. Twice a
 * second is faster than the eye and costs one propagation of one satellite.
 */
const SAMPLE_INTERVAL_MS = 500;

/**
 * What a tapped satellite is, at the bottom of the screen.
 *
 * The overlay's four channels answer "what is it for" and "how far away", and
 * for a couple of dozen landmarks "what is it called". This is the rest of the
 * answer for the one object someone asked about: what it is and who flies it,
 * where to read more about it, its purpose, how far away and how high it is,
 * how fast it is going, where to look for it, and how long it takes to come
 * round again.
 *
 * **The description comes first, above the figures.** Someone who has just
 * tapped a light in the sky is asking what it is, not how many kilometres away
 * it is; the numbers only mean something once the object has a name and a job.
 * The text is written per object for the landmarks and per fleet for everything
 * else, and it carries the operator's own page where there is one — see
 * `briefingFor`.
 *
 * **A tap over a cluster.** The sky puts markers on top of each other, so a tap
 * frequently means several satellites at once. The alternatives were a pair of
 * arrows through them or a list to drill into, and both hide the thing being
 * chosen between: an arrow says "next" without saying next *what*, and a list
 * costs a tap on every satellite to answer for the one case where two
 * overlapped. So the names are laid out as a strip of chips — every candidate
 * visible at once, one tap to switch, the selected one lit — and the sky rings
 * whichever is selected (`SelectionRing`), which is what ties a name back to
 * the mark it belongs to. With a single satellite under the finger there is
 * nothing to choose between and the strip is not drawn at all.
 *
 * The figures keep updating while the card is open, because they are all
 * moving: a low pass halves its range and crosses forty degrees of sky in the
 * time it takes to read about it. They are read on a slow timer rather than
 * from the frame loop — see `SkyTracker.describe`.
 */
export const SatelliteCard: React.FC<Props> = ({
  names,
  selected,
  onSelect,
  onClose,
  describeRef,
  palette
}) => {
  const t = strings();
  const [detail, setDetail] = useState<SatelliteDetail | null>(() =>
    describeRef.current(selected)
  );

  // Resolved on each render rather than memoised: it is a walk down a list of
  // name patterns, against a card that re-renders twice a second.
  const briefing = detail ? briefingFor(detail) : null;

  useEffect(() => {
    setDetail(describeRef.current(selected));
    const handle = setInterval(
      () => setDetail(describeRef.current(selected)),
      SAMPLE_INTERVAL_MS
    );
    return () => clearInterval(handle);
  }, [describeRef, selected]);

  return (
    <View style={styles.sheet} accessibilityLabel={t.card.details}>
      {names.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
        >
          {names.map((name) => {
            const on = name === selected;
            return (
              <Pressable
                key={name}
                // A tab, which is what this is: one panel of figures, and a
                // strip of names deciding whose. The debug pages are built the
                // same way, and it is the role that carries "selected".
                accessibilityRole="tab"
                // The `aria-` form rather than `accessibilityState`, which is
                // what actually reaches the DOM under react-native-web — the
                // category filter's `aria-expanded` is the same story.
                aria-selected={on}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => onSelect(name)}
              >
                <Text numberOfLines={1} style={[styles.chipLabel, on && styles.chipLabelOn]}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.header}>
        <View style={styles.heading}>
          <Text numberOfLines={1} style={styles.name}>
            {selected}
          </Text>
          {detail && (
            <View style={styles.purpose}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: palette.categories[detail.category],
                    borderColor: cssColor(palette.outline)
                  }
                ]}
              />
              <Text numberOfLines={1} style={styles.purposeLabel}>
                {t.filter.categories[detail.category]}
                {detail.parked ? ` · ${t.card.holdsStation}` : ""}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.card.close}
          style={styles.close}
          onPress={onClose}
        >
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      {briefing && (
        <View style={styles.briefing}>
          <Text style={styles.briefingText}>{briefing.text}</Text>
          {briefing.url && <OfficialSite url={briefing.url} />}
        </View>
      )}

      {detail ? (
        <View style={styles.facts}>
          <Fact label={t.card.facts.distance} value={kilometres(detail.rangeKm)} />
          <Fact label={t.card.facts.altitude} value={kilometres(detail.altitudeKm)} />
          <Fact label={t.card.facts.speed} value={speed(detail.speedKmPerSecond)} />
          <Fact label={t.card.facts.look} value={lookDirection(detail)} />
          <Fact label={t.card.facts.orbit} value={orbitPeriod(detail.orbitPeriodMinutes)} />
        </View>
      ) : (
        // The catalog is reloaded every couple of hours and objects leave it —
        // an honest gap, rather than a card of dashes that looks like a fault.
        <Text style={styles.missing}>{t.card.missing}</Text>
      )}
    </View>
  );
};

/**
 * The operator's own page for this object, as a link out of the app.
 *
 * Labelled with the site it opens rather than with the words "official site",
 * because the domain is the useful half: `nasa.gov` and `starlink.com` say who
 * is being asked, which is the whole reason a link is worth a tap. Failures are
 * swallowed — a device with nothing able to open a URL is not a reason to
 * unhandle a rejection over a camera view.
 */
const OfficialSite: React.FC<{ url: string }> = ({ url }) => (
  <Pressable
    accessibilityRole="link"
    accessibilityLabel={fill(strings().card.openSite, { site: siteOf(url) })}
    style={styles.site}
    onPress={() => {
      void Linking.openURL(url).catch(() => undefined);
    }}
  >
    <Text numberOfLines={1} style={styles.siteLabel}>
      {siteOf(url)} ↗
    </Text>
  </Pressable>
);

/**
 * The host a link goes to, without the scheme or a leading `www.` — what a
 * person would say the site is called.
 */
function siteOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/** One figure and what it is. */
const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.fact}>
    <Text style={styles.factLabel}>{label}</Text>
    <Text numberOfLines={1} style={styles.factValue}>
      {value}
    </Text>
  </View>
);

const SWATCH_SIZE = 10;

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 8,
    right: 8,
    // Clear of the debug toggle, which keeps its corner whatever else is open.
    bottom: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.panel,
    overflow: "hidden"
  },
  strip: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider
  },
  stripContent: {
    padding: 6,
    gap: 6
  },
  chip: {
    // A thumb-sized target, like every other control on the sky.
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: theme.color.control
  },
  chipOn: {
    backgroundColor: theme.color.controlActive
  },
  chipLabel: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  chipLabelOn: {
    color: theme.color.textBright
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 10,
    paddingTop: 8,
    gap: 8
  },
  heading: {
    flex: 1
  },
  name: {
    color: theme.color.textBright,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  purpose: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center"
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    marginRight: 7,
    // Rimmed like the marks on the sky are; the colour comes from the palette.
    borderWidth: 1.5
  },
  purposeLabel: {
    flex: 1,
    color: theme.color.textFaint,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6
  },
  close: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  closeLabel: {
    color: theme.color.textDim,
    fontSize: 13,
    fontWeight: "700"
  },
  briefing: {
    paddingHorizontal: 10,
    paddingTop: 7
  },
  briefingText: {
    color: theme.color.text,
    fontSize: 11.5,
    // Prose rather than a figure, so it is set to be read: looser lines than
    // the label-and-number rows under it.
    lineHeight: 16
  },
  site: {
    // A thumb-sized target, like every other control on the sky.
    minHeight: 30,
    justifyContent: "center"
  },
  siteLabel: {
    color: theme.color.textBright,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  facts: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 9
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2
  },
  factLabel: {
    // Shrinks before the figure does: the label is a word someone already
    // knows by the second row, and the number is what the row is for.
    flexShrink: 1,
    color: theme.color.textFaint,
    fontSize: 10,
    letterSpacing: 0.3
  },
  factValue: {
    flexShrink: 1,
    color: theme.color.text,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  missing: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 10,
    color: theme.color.textDim,
    fontSize: 11
  }
});

export default SatelliteCard;
