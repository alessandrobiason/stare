import React, { MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { FrameLens } from "../camera/projection";
import { SKY_MASK_CHASE_FRACTION } from "../constants";
import { cachedCatalog } from "../data/tleCache";
import {
  catalogSection,
  celestialSection,
  DebugSection,
  DebugSource,
  maskSection,
  skySection,
  viewSection
} from "../debug/sections";
import { SkySummary, useAnimatedMarkers } from "../hooks/useAnimatedMarkers";
import { useCelestialAlignment } from "../hooks/useCelestialAlignment";
import { useLatestRef } from "../hooks/useLatestRef";
import { useSkyPalette } from "../hooks/useSkyPalette";
import { useSkySegmentation } from "../hooks/useSkySegmentation";
import { AttitudeSource, useSmoothedOrientation } from "../hooks/useSmoothedOrientation";
import { OrbitEpoch } from "../types";
import { SatelliteCatalog } from "../satellite/catalog";
import { SatelliteCategory } from "../satellite/categories";
import { aimToleranceDeg, AnchoredSkyMask } from "../vision/anchoredMask";
import { SkyFrameGrabber } from "../vision/skySegmenter";
import { skyCoverage } from "../vision/skyMask";
import { CategoryLegend } from "./CategoryLegend";
import { strings } from "../i18n";
import { DebugPanel } from "./DebugPanel";
import { DebugToggle } from "./DebugToggle";
import {
  frameBoxFor,
  FrameFit,
  FrameSize,
  FrameViewport,
  viewportOf,
  WHOLE_FRAME
} from "./markerGeometry";
import { namesUnder } from "./markerHitTest";
import { pressPoint } from "./pressPoint";
import { SafeAreaLayer } from "./SafeAreaLayer";
import { SatelliteCard } from "./SatelliteCard";
import { SatelliteMarkers } from "./SatelliteMarkers";
import { SkyMaskOverlay } from "./SkyMaskOverlay";
import { theme } from "./theme";
import { UpcomingPasses } from "./UpcomingPasses";

/**
 * The picture the markers are drawn over, and everything that follows from it.
 *
 * The app has one of these — the phone's camera, built in `DeviceScene`. The
 * replay harness supplies another, a `<video>` of a recording, which is the
 * whole of what it takes to run this view without a phone: same markers, same
 * mask, same debug pages, different pixels.
 */
export type SceneFrame = {
  /** What the picture is, in the debug overlay's words. */
  label: string;
  /** The frame the projection is placed in, in pixels. */
  sizePx: { widthPx: number; heightPx: number };
  /**
   * How that frame is laid over the screen: `cover` fills it and lets the
   * frame's edges past it, `contain` fits the whole frame inside.
   *
   * The phone covers — it is a camera, and a camera that stops short of the
   * edge of the screen is a picture of a camera. The harness fits, because its
   * window is a laptop's and the whole recorded frame is the thing being looked
   * at there. Required rather than defaulted, so a new scene has to say which
   * of the two it is. See `frameBoxFor`.
   */
  fit: FrameFit;
  fieldOfView: { horizontalDeg: number; verticalDeg: number };
  /** Half-extents of that field of view, which the markers are projected with. */
  lens: FrameLens;
  /** Where the sky segmenter reads its pixels. */
  grabber: SkyFrameGrabber;
  /**
   * Puts the picture back together after it has stopped being readable, for a
   * source that can be: returns whether a rebuild was actually started.
   *
   * The phone's camera has one — a capture session is a thing that can be
   * thrown away and built again, which is the only cure for a photo output that
   * has stopped delivering stills. A recording does not: a `<video>` that
   * cannot be read is not a component away from being able to be, and there is
   * nothing here to do about it but say so.
   */
  rebuild?: () => boolean;
  /**
   * Draws the picture, filling the box behind the markers.
   *
   * `onDiscontinuity` is for a source that can jump — a seek in a video. It
   * drops the mask prior and the attitude estimate, both of which assume the
   * frame before this one was the frame before this one.
   */
  render: (controls: { onDiscontinuity: () => void }) => React.ReactNode;
};

type Props = {
  /** The picture the markers are drawn over. */
  frame: SceneFrame;
  /** Parsed TLE records; the marker loop tracks them itself. */
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /**
   * Where attitude readings come from, before smoothing: the phone's sensors,
   * or a recording's streams. A subscription rather than a value, so a reading
   * costs a filter update and no render — see `AttitudeSource`. Stable across
   * renders, or the view resubscribes to the sensors as it goes.
   */
  attitude: AttitudeSource;
  enabledCategories: Set<SatelliteCategory>;
  onToggleCategory: (category: SatelliteCategory) => void;
  /** Whether Starlink is drawn, which is its own switch. See `isStarlink`. */
  starlink: boolean;
  onToggleStarlink: () => void;
  onEnableAll: () => void;
  /**
   * Told what is drawn, what it is, and whether any of it can be seen from
   * here: see `SceneStatus` and `SkySummary`.
   */
  onSkyChange: (summary: SkySummary) => void;
  /** Told what the sky mask is doing, so a scene can show it. */
  onMaskStatusChange?: (status: string) => void;
  /**
   * Told when the heading stops being the compass's and becomes the sky's, and
   * when it lapses back.
   *
   * Reported up rather than acted on here because the thing that changes is a
   * phone's — the line asking for a compass calibration (`CompassNotice`), which
   * a recording has no equivalent of. See `useCelestialAlignment.fixStanding`.
   */
  onSkyFixChange?: (standing: boolean) => void;
  /** Whether the debug overlays are drawn on top of the normal view. */
  debug: boolean;
  onToggleDebug: () => void;
  /** Whether boot reported anything degraded; tints the console toggle. */
  warned?: boolean;
  /**
   * Whether the sky mask hides the markers behind terrain, and how to change
   * it. Off — the debug menu's switch — every satellite above the elevation
   * mask is drawn, buildings and trees included, and the mask stops being
   * drawn over the picture because it is no longer what the view is showing.
   */
  skyMaskFiltering: boolean;
  onToggleSkyMaskFiltering: () => void;
  /**
   * Whether the sun and the moon are used to check the compass, and how to
   * change it. On, the heading is corrected against whichever of them is in the
   * frame; off, it is whatever the magnetometer says. See
   * `useCelestialAlignment`.
   */
  celestialAlignment: boolean;
  onToggleCelestialAlignment: () => void;
  /**
   * Whether the scene is showing the compass notice under this view.
   *
   * The notice is the scene's — only the phone knows what its own compass is
   * worth (`compassNoticeShowing`) — and it stands in the bottom-left corner
   * and grows upwards as its sentence wraps, into the row the upcoming-passes
   * panel keeps. So that panel gives way to it, which is the right way round
   * twice over: a warning about the sky being aimed wrong outranks a list of
   * what is crossing it, and what the list would be offering while the notice
   * is up is a set of bearings the notice has just said are tens of degrees
   * out. Defaults to `false` for a scene with no compass to warn about.
   */
  compassWarning?: boolean;
  /**
   * The scene's own debug pages, shown before the ones the view adds. Each
   * scene has a different answer to "where is this attitude coming from", and
   * that answer is most of what the overlay is for.
   */
  sceneDebugSections?: () => DebugSection[];
};

/**
 * The AR view: a camera frame with the satellite markers and control panels
 * composited over it, plus the debug overlays when they are switched on.
 *
 * Everything specific to where the picture comes from is in the `frame` it is
 * handed — its shape, its lens, how to draw it, how to read its pixels and how
 * it is laid over the screen — so this holds no branches for one source or
 * another. Two view modes: normal draws the markers, debug adds the sky mask
 * over the picture and a panel of the figures behind it.
 *
 * The picture is the whole screen and the panels are laid over it, rather than
 * the picture being one part of a screen and the panels the others. On the
 * phone it covers: the frame keeps the camera's shape, is scaled until it fills
 * the screen and is clipped where it runs past it (`frameBoxFor`), so the sky
 * is edge to edge and no part of the layout is spent on black. That the frame
 * is bigger than the window is invisible to everything that draws — markers,
 * mask and taps are all placed against the box, as they always were — and
 * visible only to the count, which asks `viewport` what is on screen.
 *
 * It costs the overlay the pixels it hides: the marker canvas spans the box
 * rather than the screen, so it is about twice the area of the display and the
 * cropped third of it is drawn and thrown away. That is the price of the crop
 * and it is paid by the same single draw the whole overlay has always been
 * (`SatelliteMarkers`) — a larger surface, not more work per frame — so it is
 * fill rate rather than the shape count that decides the frame budget.
 *
 * The picture is also the one control the normal view has: a tap on it asks
 * what is under the finger (`namesUnder`) and opens a card about it
 * (`SatelliteCard`), and a tap that lands on empty sky puts the card away
 * again.
 */
export const SkyOverlay: React.FC<Props> = ({
  frame,
  catalog,
  epochRef,
  attitude,
  enabledCategories,
  onToggleCategory,
  starlink,
  onToggleStarlink,
  onEnableAll,
  onSkyChange,
  onMaskStatusChange,
  onSkyFixChange,
  debug,
  onToggleDebug,
  warned = false,
  skyMaskFiltering,
  onToggleSkyMaskFiltering,
  celestialAlignment,
  onToggleCelestialAlignment,
  compassWarning = false,
  sceneDebugSections
}) => {
  const [fatal, setFatal] = useState<Error | null>(null);
  const [available, setAvailable] = useState<FrameSize | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => setAvailable(nativeEvent.layout),
    []
  );
  const aspectRatio = frame.sizePx.widthPx / frame.sizePx.heightPx;
  const fit = frame.fit;
  const frameStyle = useMemo(
    () => frameBoxFor(available, aspectRatio, fit),
    [available, aspectRatio, fit]
  );
  /**
   * How much of that box the screen is showing.
   *
   * The whole of it while the picture is fitted, and the middle of it while it
   * covers — a 4:3 camera filling a tall phone runs a third of its width off
   * the sides. Everything drawn goes on being placed against the box, which is
   * what keeps the markers on the picture; this is only for the count, which is
   * a statement about the sky someone can see rather than about the frame.
   */
  const viewport = useMemo<FrameViewport>(
    () => (available && frameStyle ? viewportOf(frameStyle, available) : WHOLE_FRAME),
    [available, frameStyle]
  );

  const smoothed = useSmoothedOrientation(attitude);
  // Which of the two palettes the sky is drawn in, from where and when the
  // markers are being placed. Sampled on its own slow timer: see `palette.ts`.
  const palette = useSkyPalette(epochRef);
  const grabberRef = useLatestRef<SkyFrameGrabber | null>(frame.grabber);

  // Checks the heading against the sun or the moon, on the frames the sky
  // segmentation is capturing anyway. Declared before the segmentation because
  // that is what hands it those frames — the second question about a picture
  // that has already been paid for. See `useCelestialAlignment`.
  const celestial = useCelestialAlignment({
    epochRef,
    lens: frame.lens,
    orientationFilterRef: smoothed.filterRef,
    enabled: celestialAlignment
  });

  // Destructured, because the object's identity changes whenever a fix starts or
  // lapses and this is handed to the frame source, which redraws for it.
  const { reset: resetCelestial } = celestial;

  const segmentation = useSkySegmentation(
    grabberRef,
    frame.lens,
    smoothed.filterRef,
    // What the segmentation filter warps its previous mask by.
    smoothed.readingRef,
    setFatal,
    frame.rebuild,
    celestial.onFrame
  );

  const {
    markers,
    tracker,
    skyMemory,
    markerStatsRef,
    frameRateRef,
    latestFrameRef,
    reset: resetMarkers,
    upcoming
  } = useAnimatedMarkers({
    catalog,
    lens: frame.lens,
    epochRef,
    orientationFilterRef: smoothed.filterRef,
    mask: segmentation.mask,
    maskFiltering: skyMaskFiltering,
    enabledCategories,
    starlink,
    viewport,
    onSkyChange
  });

  // What the tapped satellite is, resolved on the card's own slow timer against
  // the epoch of whatever frame is on screen when it asks.
  const describeRef = useLatestRef((name: string) => {
    const { time, observer } = epochRef.current;
    return tracker.describe(name, time, observer);
  });

  /**
   * What a tap on the picture means: the satellites under the finger — marks,
   * and the names written along the landmarks' paths — or nothing at all.
   *
   * The frame is read from a ref rather than subscribed to, so this view still
   * renders only when something it draws changes rather than sixty times a
   * second (`latestFrameRef`). An empty answer is a real one — tapping the sky
   * between the markers is how a card is dismissed, which is the gesture
   * anything drawn over a photograph has to honour.
   */
  const onTapSky = (event: GestureResponderEvent) => {
    // Where the press landed is a platform question, and `pressPoint` is the
    // whole of it: React Native measures it, the web has to be measured.
    const point = pressPoint(event);
    if (!frameStyle || !point) return;

    const names = namesUnder(latestFrameRef.current, frameStyle, point);
    setSelection(names.length === 0 ? null : { names, selected: names[0] });
  };

  // Rebuilt on every render and read only through the ref, because the panel
  // samples it on its own slow timer rather than drawing from this render.
  const debugSource: DebugSource = () => [
    ...(sceneDebugSections?.() ?? []),
    maskSection({
      mask: segmentation.mask,
      error: segmentation.error,
      stats: segmentation.statsRef.current,
      filtering: { on: skyMaskFiltering, onToggle: onToggleSkyMaskFiltering },
      // Where the camera is aimed now, so the panel can say how far the mask
      // is from it: the one figure that says whether a pass is overdue.
      viewAttitude: smoothed.filterRef.current.sample(performance.now() / 1000),
      chaseAtDeg: aimToleranceDeg(frame.lens, SKY_MASK_CHASE_FRACTION),
      nowMs: performance.now()
    }),
    celestialSection({
      stats: celestial.statsRef.current,
      checking: { on: celestialAlignment, onToggle: onToggleCelestialAlignment },
      nowSeconds: performance.now() / 1000
    }),
    skySection({
      tracker: tracker.stats(),
      markers: markerStatsRef.current,
      // Walks the grid, which is why it is asked for here — on the panel's own
      // slow timer — rather than kept up to date by the frame loop.
      memory: skyMemory.stats(performance.now() / 1000),
      epoch: epochRef.current
    }),
    // The cache's timestamps are wall-clock (they outlive the process), unlike
    // everything else on this page, which is measured against `performance.now()`.
    catalogSection({ cache: cachedCatalog(), nowMs: Date.now() }),
    viewSection({
      source: frame.label,
      box: frameStyle,
      frame: frame.sizePx,
      fieldOfView: frame.fieldOfView,
      attitude: smoothed.filterRef.current.sample(performance.now() / 1000),
      frameRate: frameRateRef.current
    })
  ];
  const debugSourceRef = useLatestRef(debugSource);

  const maskStatus = describeMask(segmentation.mask, segmentation.error);
  const onMaskStatusChangeRef = useLatestRef(onMaskStatusChange);
  useEffect(() => {
    onMaskStatusChangeRef.current?.(maskStatus);
  }, [maskStatus, onMaskStatusChangeRef]);

  const onSkyFixChangeRef = useLatestRef(onSkyFixChange);
  useEffect(() => {
    onSkyFixChangeRef.current?.(celestial.fixStanding);
  }, [celestial.fixStanding, onSkyFixChangeRef]);

  const onDiscontinuity = useCallback(() => {
    // Frames are no longer contiguous, so the mask prior is worthless — and so
    // is an attitude estimate built from the frames before the jump, or what
    // each marker had settled on about the sky it was crossing.
    segmentation.reset();
    smoothed.reset();
    resetCelestial();
    resetMarkers();
  }, [resetCelestial, resetMarkers, segmentation, smoothed]);

  // Thrown during render so `FatalErrorBoundary` can catch it: an async failure
  // in the segmentation loop has no call stack React can see, and the view must
  // not be left drawing markers against a mask that has stopped arriving.
  if (fatal) throw fatal;

  return (
    <View style={styles.sky} onLayout={onLayout}>
      <View style={[styles.frame, frameStyle]}>
        {frame.render({ onDiscontinuity })}

        {/* Not while it is switched off: the mask drawn over the picture is
            the reason a marker is missing, and with nothing being hidden it
            would be a red grid explaining markers that are all still there. */}
        {debug && skyMaskFiltering && segmentation.mask && (
          <SkyMaskOverlay
            mask={segmentation.mask}
            orientationFilterRef={smoothed.filterRef}
            lens={frame.lens}
            frame={frameStyle}
          />
        )}

        {/* A subscription rather than a value: the loop publishes at display
            rate, and this view has nothing to redraw when it does. */}
        <SatelliteMarkers
          markers={markers}
          frame={frameStyle}
          palette={palette}
          selectedName={selection?.selected ?? null}
        />

        {/* The picture itself is the control: over the markers, which are drawn
            into a canvas that takes no touches, and under every panel, which
            are laid over this box rather than inside it. Not while the debug
            overlays are up — there the picture is the mask's, and a card would
            be reading out satellites over a page of figures about them. */}
        {!debug && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings().scene.markers}
            accessibilityHint="Tap a marker to see what it is"
            style={StyleSheet.absoluteFill}
            onPress={onTapSky}
          />
        )}
      </View>

      {/* The panels, inset off the notch and the home indicator while the
          picture underneath them is not. Each one still places itself in a
          corner of its parent; the layer is what makes that corner the safe
          one. See `SafeAreaLayer`. */}
      <SafeAreaLayer>
        <CategoryLegend
          enabledCategories={enabledCategories}
          onToggleCategory={onToggleCategory}
          starlink={starlink}
          onToggleStarlink={onToggleStarlink}
          onEnableAll={onEnableAll}
          palette={palette}
        />

        {/* What is coming, bottom left — level with the console toggle in the
            opposite corner. Not while a card is open: the card is the width of
            the screen and opens from just above this row, and it is the answer
            to the row that was tapped anyway. Not while the compass notice is
            up, which takes this exact corner and says the bearings this panel
            is about to give are tens of degrees out. Not under the debug
            overlays either, for the reason the card is not: the picture there
            is the mask's. */}
        {!debug && !selection && !compassWarning && (
          <UpcomingPasses
            passes={upcoming}
            epochRef={epochRef}
            // The same selection a tap on the object's own mark makes, so the
            // card that opens is the card the sky would have opened. One name
            // rather than a cluster: a row is one object by construction.
            onSelect={(name) => setSelection({ names: [name], selected: name })}
          />
        )}

        {!debug && selection && (
          <SatelliteCard
            names={selection.names}
            selected={selection.selected}
            onSelect={(name) => setSelection({ names: selection.names, selected: name })}
            onClose={() => setSelection(null)}
            describeRef={describeRef}
            palette={palette}
          />
        )}

        {debug && <DebugPanel sourceRef={debugSourceRef} onClose={onToggleDebug} />}
        <DebugToggle on={debug} onToggle={onToggleDebug} warned={warned} />
      </SafeAreaLayer>
    </View>
  );
};

/** One line saying what the sky mask is doing, for the scenes' status panels. */
function describeMask(anchored: AnchoredSkyMask | null, error: string | null): string {
  if (anchored) {
    const { mask } = anchored;
    return `Sky mask ${mask.columns}x${mask.rows} · ${Math.round(skyCoverage(mask) * 100)}% sky`;
  }
  return error ? `Sky mask failing: ${error}` : "Waiting for the first sky mask…";
}

/**
 * What a tap picked out: the satellites under the finger, and which of them is
 * being read about.
 *
 * The names rather than the markers themselves, because the markers are a frame
 * of an animation and this outlives it — the satellite goes on moving, and the
 * card asks the tracker where it is now (`SkyTracker.describe`) rather than
 * holding on to where it was when it was tapped.
 */
type Selection = { names: string[]; selected: string };

const styles = StyleSheet.create({
  sky: {
    flex: 1,
    // What crops a covering picture: the box keeps the camera's shape and runs
    // off the screen, and this is the window it runs off. Centred, so what is
    // cut is split between the two edges rather than taken off one of them.
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    // Only ever seen behind a fitted picture — under `cover` the frame covers
    // this whole view. See `frameBoxFor`.
    backgroundColor: theme.color.background
  },
  frame: {
    // Nothing to size against until the first layout arrives, and the picture
    // is still loading then, so an empty box is all this would show anyway.
    width: 0,
    height: 0,
    overflow: "hidden"
  }
});

export default SkyOverlay;
