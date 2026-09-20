import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle
} from "react-native";
import { GroundTrackPlan } from "../hooks/useGroundTrack";
import { fill, strings } from "../i18n";
import {
  kilometres,
  lookDirection,
  orbitPeriod,
  seeing,
  sightingLine,
  speed,
  year
} from "../i18n/format";
import { briefingFor } from "../satellite/briefing";
import { CATEGORY_COLORS } from "../satellite/categories";
import {
  cachedLandmarkPhoto,
  landmarkPhotoFile,
  loadLandmarkPhoto,
  LandmarkPhoto
} from "../satellite/landmarkPhotos";
import { UpcomingPass } from "../satellite/upcomingPasses";
import { SatelliteDetail } from "../types";
import { GroundTrackMap } from "./GroundTrackMap";
import { Icon } from "./Icon";
import { cssColor } from "./palette";
import { glass, lift, theme } from "./theme";

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
  /**
   * The next pass this object makes that can be seen with the naked eye, within
   * the next day, or `null` for none.
   *
   * Its own line, under the seeing line: that one is about now, and whether the
   * object is worth going outside for later is a different question with a
   * different answer most of the time. See `sightingLine`.
   */
  sighting?: UpcomingPass | null;
  /**
   * The orbit this object draws on the ground, for the map at the foot of the
   * card, or `null` while there is none to draw.
   *
   * Planned outside the card (`useGroundTrack`) rather than read off
   * `describeRef` like the figures are, for the reason the sighting above is:
   * it is a few hundred propagations that land some time after the tap, and a
   * card that re-read it on its own sampling timer would be running them twice
   * a second for a picture that changes twice an hour.
   */
  groundTrack?: GroundTrackPlan | null;
  /** Where it sits: laid over the card's own, by the stack that arranges it. */
  style?: StyleProp<ViewStyle>;
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
 * How far down, in points, the card has to be dragged before letting go puts
 * it away. Short of it, it slides back up to where it was.
 *
 * Further than the passes card's (`UpcomingPasses`), which only opens or
 * shuts: this one is gone once it goes, and the tap that brought it back is a
 * tap on a moving mark.
 */
const DISMISS_THRESHOLD = 56;
/**
 * A quick flick down puts it away whatever distance it covered: the release
 * velocity, in points per millisecond, past which it does. The passes card's.
 */
const FLING_VELOCITY = 0.5;
/**
 * How far a finger has to move before the header takes the touch as a drag,
 * in points — the passes card's, and for its reason: past it a press on the
 * close button or a chip is a drag of the card rather than a tap on either.
 */
const DRAG_SLOP = 6;
/** How long the card takes to slide back into place, or out of sight, in milliseconds. */
const SLIDE_MS = 220;

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
 * **And a photograph, for the objects there is one of.** Words cannot settle
 * what a thing looks like, and for the stations, the observatories and the
 * vehicles visiting them the picture is the answer to the question that was
 * actually asked. It sits above the text, because it is understood before the
 * text is read. It is fetched rather than bundled, so it arrives a moment after
 * the card does and is absent entirely for a phone with no signal — which is why
 * it is drawn as a strip that appears rather than a gap that fills, and why
 * every failure in `landmarkPhotos.ts` ends as a card with no picture on it.
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
  sighting = null,
  groundTrack = null,
  style
}) => {
  const t = strings();
  /**
   * The most of the screen this card may take, which is a little under half.
   *
   * It is laid out in the stack at the bottom of the sky view, so everything
   * above it — the compass strip, the notice — is pushed up by whatever height
   * it takes: a landmark's card is a photograph, a paragraph, a verdict and
   * five figures, and left to grow it would put the compass across the middle
   * of the picture and the picture itself behind writing. Past this it scrolls
   * instead, which keeps the camera the larger half of the screen on every
   * phone rather than on the one this was laid out against.
   */
  const maxHeight = useWindowDimensions().height * 0.46;
  const [detail, setDetail] = useState<SatelliteDetail | null>(() =>
    describeRef.current(selected)
  );

  // Resolved on each render rather than memoised: it is a walk down a list of
  // name patterns, against a card that re-renders twice a second.
  const briefing = detail ? briefingFor(detail) : null;
  // The same walk, ending in a table lookup, and a string rather than an object
  // so the photograph below is not remounted twice a second.
  const photoFile = detail ? landmarkPhotoFile(detail) : null;

  useEffect(() => {
    setDetail(describeRef.current(selected));
    const handle = setInterval(
      () => setDetail(describeRef.current(selected)),
      SAMPLE_INTERVAL_MS
    );
    return () => clearInterval(handle);
  }, [describeRef, selected]);

  const drag = useSwipeToDismiss(onClose);

  return (
    <Animated.View
      style={[styles.sheet, { maxHeight }, style, drag.style]}
      accessibilityLabel={t.card.details}
      onLayout={drag.onLayout}
    >
      {/* The top of the card is its handle, as the passes card's is: the same
          grip, because they are the same card — the bottom of the sky view
          says one thing at a time — and the same gesture on it. A drag down
          anywhere across the grip, the names and the heading follows the
          finger and, let go far enough or fast enough, puts the card away
          the way the close button does. The body below keeps its own scroll. */}
      <View {...drag.panHandlers}>
        <View style={styles.gripRow}>
          <View style={styles.grip} />
        </View>

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
          {/* The mark that was tapped, as the thing the name hangs off: a point,
              or the ring the sky draws for an object parked over the equator, in
              the colour the sky and the filter's list both draw its purpose in —
              so the card is tied to the dot that was tapped rather than merely
              being about it. */}
          <View
            style={[
              styles.badge,
              detail && {
                borderColor: cssColor({ color: CATEGORY_COLORS[detail.category], alpha: 0.35 })
              }
            ]}
          >
            {detail && (
              <View
                style={[
                  styles.badgeMark,
                  detail.parked
                    ? [styles.badgeRing, { borderColor: CATEGORY_COLORS[detail.category] }]
                    : {
                        backgroundColor: CATEGORY_COLORS[detail.category],
                        borderColor: cssColor({
                          color: CATEGORY_COLORS[detail.category],
                          alpha: 0.3
                        })
                      }
                ]}
              />
            )}
          </View>

          <View style={styles.heading}>
            <Text numberOfLines={1} style={styles.name}>
              {selected}
            </Text>
            {detail && (
              <Text numberOfLines={1} style={styles.purposeLabel}>
                {purposeLabel(detail)}
              </Text>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.card.close}
            style={styles.close}
            onPress={onClose}
          >
            <Icon name="close" size={14} color={theme.color.textDim} />
          </Pressable>
        </View>
      </View>

      {/* Under the name, and scrolling: the picture and the paragraph are the
          tall half of this card, and a card that grows past its share of the
          screen is a card over the sky it is describing. */}
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Keyed by the file, so switching between two satellites under one
            finger starts the picture over rather than showing the Soyuz's for
            the frame before the ISS's effect has run. */}
        {photoFile && <Photograph key={photoFile} file={photoFile} of={selected} />}

        {briefing && (
          <View style={styles.briefing}>
            <Text style={styles.briefingText}>{briefing.text}</Text>
            {briefing.url && <OfficialSite url={briefing.url} />}
          </View>
        )}

        {/* Ruled off above rather than below: what follows belongs with the
            figures, which are the other things true of this object at this
            instant, and what it is being separated from is the paragraph
            about what the object is — which is true whatever the sky is
            doing. */}
        <View style={styles.rule} />

        {/* Between what the thing is and where it is, because that is the order
            somebody who has just tapped a mark asks in: what is that, can I see
            it, where do I look — about now, like every figure under it.

            Nothing at all by day. That the sun rules out the whole sky is true
            of every object on it at once, and a line saying so on every card
            tells nobody anything they did not know by looking up. */}
        {detail && showsSeeing(detail) && (
          <Text style={styles.seeing}>{seeing(detail)}</Text>
        )}

        {/* And whether it is worth going out for later: the next pass that can
            be seen without help, in the accent a sighting has in the passes
            panel. */}
        {detail && sighting && (
          <Text style={[styles.sighting, !showsSeeing(detail) && styles.lineFirst]}>
            {sightingLine(sighting)}
          </Text>
        )}

        {detail ? (
          <View style={styles.facts}>
            <Fact label={t.card.facts.distance} value={kilometres(detail.rangeKm)} />
            <Fact label={t.card.facts.altitude} value={kilometres(detail.altitudeKm)} />
            <Fact label={t.card.facts.speed} value={speed(detail.speedKmPerSecond)} />
            <Fact label={t.card.facts.look} value={lookDirection(detail)} />
            <Fact label={t.card.facts.orbit} value={orbitPeriod(detail.orbitPeriodMinutes)} />
            {/* Last, and only where the elements carry one: it is the one row
                here that is not a reading off this second, so it belongs under
                the ones that are rather than among them. A dash in its place
                would be a row spent saying the catalogue is missing a field. */}
            {detail.launchYear !== null && (
              <Fact label={t.card.facts.launched} value={year(detail.launchYear)} />
            )}
          </View>
        ) : (
          // The catalog is reloaded every couple of hours and objects leave it
          // — an honest gap, rather than a card of dashes that looks like a
          // fault.
          <Text style={styles.missing}>{t.card.missing}</Text>
        )}

        {/* Last, and the only thing on the card that is not about this instant
            or about this place: what the object *does*. It is the tallest block
            here, which is why it is at the bottom — the card opens on the
            picture of the thing and the paragraph about it, as it always has,
            and the map is what a scroll gets you.

            Directly under the figures rather than under the paragraph, because
            it belongs with them: the row above it says an orbit takes an hour
            and a half, and this is that hour and a half drawn. Absent entirely
            where the elements will not yield an orbit, rather than drawn as an
            empty world — see `useGroundTrack`. */}
        {detail && groundTrack?.track && (
          <>
            <View style={styles.rule} />
            <GroundTrackMap
              plan={groundTrack}
              name={selected}
              color={CATEGORY_COLORS[detail.category]}
            />
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
};

/**
 * The card's own slide: dragged down by its header, and either put away or
 * sprung back when the finger lets go.
 *
 * The passes card's gesture (`PassesPanel`), with one end instead of two. It is
 * claimed in the capture phase and only for a move that is mostly vertical,
 * so a tap on the close button or on a chip still lands on it, and a sideways
 * swipe along the chips still scrolls them. The card follows the finger down,
 * and a little way against it going up — a sheet that will not move at all
 * reads as a sheet that is stuck.
 *
 * Put away by sliding out past its own foot and only then closing, rather than
 * closing on release: the card is taken off the screen by its owner
 * (`onClose`), and doing that mid-drag drops it from under the finger.
 */
function useSwipeToDismiss(onClose: () => void) {
  const offset = useRef(new Animated.Value(0)).current;
  const heightRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        Math.abs(gesture.dy) > DRAG_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => offset.stopAnimation(),
      onPanResponderMove: (_evt, gesture) => {
        offset.setValue(gesture.dy >= 0 ? gesture.dy : gesture.dy / 4);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.vy > FLING_VELOCITY || gesture.dy > DISMISS_THRESHOLD) {
          Animated.timing(offset, {
            // Past its own height, so it is off the bottom of the stack
            // rather than resting on the tab bar when it is taken away.
            toValue: Math.max(heightRef.current, DISMISS_THRESHOLD) + 24,
            duration: SLIDE_MS,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: false
          }).start(({ finished }) => {
            if (finished) onCloseRef.current();
          });
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: () => springBack()
    })
  ).current;

  function springBack() {
    Animated.timing(offset, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }

  return {
    panHandlers: panResponder.panHandlers,
    onLayout: ({ nativeEvent }: LayoutChangeEvent) => {
      heightRef.current = nativeEvent.layout.height;
    },
    style: {
      transform: [{ translateY: offset }],
      // Fading as it goes, so the last of it leaving is not a hard edge
      // sliding under the tab bar.
      opacity: offset.interpolate({
        inputRange: [0, 240],
        outputRange: [1, 0.35],
        extrapolate: "clamp"
      })
    }
  };
}

/**
 * The picture of the thing, with the credit that comes with using it.
 *
 * Drawn only once there is something to draw. The alternatives were a spinner
 * and a placeholder block, and both spend a strip of a card that is sitting over
 * a live camera view announcing that a picture is on its way — which is worth
 * less than the sky it covers, and reads as a fault on the phones where the
 * picture never arrives at all. Appearing a beat later is the smaller surprise.
 *
 * `onError` is not belt-and-braces. The picture is fetched over whatever
 * connection a phone held up at the sky has, from a file somebody else can
 * replace, and a decode can simply fail — any of which takes the strip back off
 * the card rather than leaving a broken frame on it.
 */
const Photograph: React.FC<{ file: string; of: string }> = ({ file, of }) => {
  // What is already known, so a reopened card draws its picture on the first
  // frame instead of fading the same one in again.
  const [photo, setPhoto] = useState<LandmarkPhoto | null>(
    () => cachedLandmarkPhoto(file) ?? null
  );
  const [broken, setBroken] = useState(false);

  // Mounted per file — the card keys it by file name — so there is no state here
  // to carry from one object to the next, and this only ever runs once.
  useEffect(() => {
    let live = true;
    void loadLandmarkPhoto(file).then((found) => {
      // The card outlives the request only some of the time: a tap through a
      // cluster switches file, and a tap on the sky closes the card outright.
      if (live) setPhoto(found);
    });
    return () => {
      live = false;
    };
  }, [file]);

  if (!photo || broken) return null;

  return (
    <View style={styles.photo}>
      <Image
        // The label says what the picture is of rather than describing it: this
        // is a photograph of a named object, and the name is the description.
        accessibilityRole="image"
        accessibilityLabel={fill(strings().card.photo, { name: of })}
        source={{ uri: photo.imageUrl }}
        style={styles.photoImage}
        resizeMode="cover"
        onError={() => setBroken(true)}
      />
      {/* Over the picture rather than under it, because the card is bounded by
          the sky above it: a caption bar costs the bottom of one photograph,
          where a row of its own costs a line of the description. */}
      <Pressable
        accessibilityRole="link"
        style={styles.credit}
        onPress={() => {
          void Linking.openURL(photo.pageUrl).catch(() => undefined);
        }}
      >
        {/* No label of its own: what it says is what it opens, and a spoken
            label that differed from the visible one would be a second name for
            the same control. Two thirds of these pictures are NASA's and in the
            public domain; the rest are CC BY, CC BY-SA or CC0 and are being
            credited because they ask to be. */}
        <Text numberOfLines={1} style={styles.creditLabel}>
          {photo.credit} ↗
        </Text>
      </Pressable>
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

/**
 * Whether the card says whether this object can be seen now.
 *
 * Every verdict but one: by day the answer is the same for everything overhead,
 * and the sun in the sky has already given it. See the seeing line.
 */
function showsSeeing(detail: SatelliteDetail): boolean {
  return detail.nakedEye !== "daylight";
}

const BADGE_SIZE = 38;
const BADGE_MARK = 12;

/**
 * The line under the name: what the object is for, as the filter names it.
 *
 * The category and the part of it, where it is split — `INTERNET · STARLINK` —
 * and the note that it holds station for one that does. One line, clipped
 * rather than wrapped, and the three together do not fit it in most languages;
 * so a parked object gives up the category for the note, since the part names
 * the service on its own (`TV AND DATA`) and the badge beside it is already in
 * the category's colour.
 */
function purposeLabel(detail: SatelliteDetail): string {
  const t = strings();
  const category = t.filter.categories[detail.category];
  const part = detail.subcategory ? t.filter.subcategories[detail.subcategory] : null;
  const parked = detail.parked ? t.card.holdsStation : null;
  const words = part && parked ? [part, parked] : [category, part ?? parked];
  return words.filter((word) => word !== null).join(" · ");
}

const styles = StyleSheet.create({
  sheet: {
    // Laid out by the stack at the bottom of the sky view rather than pinned
    // to it: the compass above it moves up when this card grows, which is what
    // keeps a card with a photograph on it from covering the strip.
    borderRadius: theme.radius.sheet,
    overflow: "hidden",
    ...glass(theme.color.panelDeep, 26),
    ...lift
  },
  gripRow: {
    alignItems: "center",
    paddingTop: 7
  },
  body: {
    flexGrow: 0
  },
  grip: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.divider
  },
  strip: {
    flexGrow: 0,
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider
  },
  stripContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6
  },
  chip: {
    // A thumb-sized target, like every other control on the sky.
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  chipOn: {
    borderColor: theme.color.accentBorder,
    backgroundColor: theme.color.accentSoft
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
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 8,
    paddingTop: 8
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  badgeMark: {
    width: BADGE_MARK,
    height: BADGE_MARK,
    borderRadius: BADGE_MARK / 2,
    // In a band of its own colour thinned out: the glow the sky draws it in.
    borderWidth: 2.5
  },
  badgeRing: {
    backgroundColor: "transparent",
    borderWidth: 2.5
  },
  heading: {
    flex: 1,
    gap: 2
  },
  name: {
    color: theme.color.textBright,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  purposeLabel: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7
  },
  close: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  photo: {
    marginTop: 10,
    // A strip rather than a whole picture. The card is anchored to the bottom of
    // a live camera view, and every point it grows is a point of sky it covers;
    // this is about as short as a spacecraft against black stays recognisable,
    // and about as much of a portrait picture as can be cropped away safely.
    height: 148,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    // What is behind the picture while its bytes arrive. Not the same thing as a
    // placeholder for the lookup: by the time this box exists the URL is known,
    // so it is a moment of dark panel rather than a promise of a picture.
    backgroundColor: theme.color.control
  },
  photoImage: {
    width: "100%",
    height: "100%"
  },
  credit: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // A thumb-sized target, like every other control on the sky.
    minHeight: 30,
    paddingHorizontal: 12,
    justifyContent: "center",
    // Dark enough to read white text over the bright side of any photograph.
    backgroundColor: theme.color.panelDeep
  },
  creditLabel: {
    color: theme.color.textDim,
    fontSize: 10,
    letterSpacing: 0.3
  },
  briefing: {
    paddingHorizontal: 14,
    paddingTop: 10
  },
  briefingText: {
    color: theme.color.text,
    fontSize: 12.5,
    // Prose rather than a figure, so it is set to be read: looser lines than
    // the label-and-number rows under it.
    lineHeight: 18
  },
  site: {
    // A thumb-sized target, like every other control on the sky.
    minHeight: 30,
    justifyContent: "center"
  },
  siteLabel: {
    color: theme.color.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  rule: {
    marginHorizontal: 14,
    marginTop: 10,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.color.divider
  },
  seeing: {
    marginHorizontal: 14,
    marginTop: 9,
    color: theme.color.textBright,
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18
  },
  sighting: {
    marginHorizontal: 14,
    marginTop: 4,
    color: theme.color.accent,
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18
  },
  /** The sighting line with no seeing line above it, spaced off the rule instead. */
  lineFirst: {
    marginTop: 9
  },
  facts: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3
  },
  factLabel: {
    // Shrinks before the figure does: the label is a word someone already
    // knows by the second row, and the number is what the row is for.
    flexShrink: 1,
    color: theme.color.textFaint,
    fontSize: 11,
    letterSpacing: 0.3
  },
  factValue: {
    flexShrink: 1,
    color: theme.color.text,
    fontSize: 12.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  missing: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    color: theme.color.textDim,
    fontSize: 12
  }
});

export default SatelliteCard;
