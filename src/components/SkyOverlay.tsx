import React, { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { FrameLens } from "../camera/projection";
import { MINIMUM_SATELLITE_ELEVATION_DEG, SKY_MASK_CHASE_FRACTION } from "../constants";
import { cachedCatalog } from "../data/tleCache";
import {
  catalogSection,
  celestialSection,
  DebugSection,
  DebugSource,
  maskSection,
  modelSection,
  skySection,
  viewSection
} from "../debug/sections";
import { SkySummary, useAnimatedMarkers } from "../hooks/useAnimatedMarkers";
import { useCelestialAlignment } from "../hooks/useCelestialAlignment";
import { useGroundTrack } from "../hooks/useGroundTrack";
import { useLatestRef } from "../hooks/useLatestRef";
import { useSelectedPasses } from "../hooks/useSelectedPasses";
import { useSkyPalette } from "../hooks/useSkyPalette";
import { SegmentedFrameSample, useSkySegmentation } from "../hooks/useSkySegmentation";
import { SceneTab } from "../hooks/useSceneControls";
import { AttitudeSource, useSmoothedOrientation } from "../hooks/useSmoothedOrientation";
import { OrbitEpoch } from "../types";
import { SatelliteCatalog } from "../satellite/catalog";
import { SatelliteCategory, SatelliteSubcategory } from "../satellite/categories";
import { aimToleranceDeg, AnchoredSkyMask } from "../vision/anchoredMask";
import { BackdropBrightness, brightnessGridSliced } from "../vision/backdropBrightness";
import { SkyFrameGrabber, skyModelDiagnostics } from "../vision/skySegmenter";
import { skyCoverage } from "../vision/skyMask";
import { CategoryLegend } from "./CategoryLegend";
import { CatalogScreen } from "./CatalogScreen";
import { strings } from "../i18n";
import { lookDirection } from "../i18n/format";
import { toDegrees } from "../math/angles";
import { startSlicing } from "../timeSlice";
import { DebugPanel } from "./DebugPanel";
import { FindInSky, SkyAim } from "./FindInSky";
import { GuideTour } from "./GuideTour";
import { HorizonCompass } from "./HorizonCompass";
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
import { TourTargetsProvider } from "./tourTargets";
import { SafeAreaLayer } from "./SafeAreaLayer";
import { SatelliteCard } from "./SatelliteCard";
import { markerDrawStats, SatelliteMarkers } from "./SatelliteMarkers";
import { SettingsScreen } from "./SettingsScreen";
import { SkyHeader } from "./SkyHeader";
import { SkyMaskOverlay } from "./SkyMaskOverlay";
import { TabBar } from "./TabBar";
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
   *
   * `frozen` is the freeze button: hold the picture on the frame it is showing
   * (a paused preview, a paused video) until it is false again.
   */
  render: (controls: { onDiscontinuity: () => void; frozen: boolean }) => React.ReactNode;
};

/**
 * Nothing counted yet: what the header shows before the first frame.
 *
 * Daylight rather than dark, because the panel says something different in each
 * and the empty sky before boot has finished should not be claiming the sun is
 * down. The first frame replaces it a sixtieth of a second later.
 */
const NO_SKY: SkySummary = {
  count: 0,
  fleets: { rows: [], other: 0 },
  sunlit: 0,
  darkness: "daylight"
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
  /** Which subcategories are drawn, each its own switch. See `SUBCATEGORIES_OF`. */
  enabledSubcategories: Set<SatelliteSubcategory>;
  onToggleSubcategory: (subcategory: SatelliteSubcategory) => void;
  onEnableAll: () => void;
  /** Which tab is showing, and how to change it. See `TabBar`. */
  tab: SceneTab;
  onSelectTab: (tab: SceneTab) => void;
  /**
   * Whether the filter panel is down from its button in the header, and how to
   * put it up or away. Held by the scene rather than by the panel, because the
   * control that opens it is in the header and leaving the sky closes it.
   */
  filterOpen: boolean;
  onToggleFilter: () => void;
  /**
   * Whether the view is frozen, and how to freeze or thaw it: the picture, the
   * marks and the compass held where they were, and the marks still tappable,
   * so a sky overhead can be read with the phone lowered. See
   * `SceneControls.frozen`.
   */
  frozen: boolean;
  onToggleFrozen: () => void;
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
  /** Opens the console from the settings tab, which is where it is listed. */
  onOpenConsole: () => void;
  /**
   * Whether the tour is running over the view (`GuideTour`), how to start it
   * again from the Help row in the settings tab, and how it ends.
   */
  guide: boolean;
  onOpenGuide: () => void;
  onCloseGuide: () => void;
  /** Whether boot reported anything degraded; dots the settings tab. */
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
   * The scene's own strip at the top of the bottom stack, if it has one.
   *
   * A node rather than a flag, because what goes there is different for each
   * scene and neither is this view's business: the phone puts its compass
   * notice there (`CompassNotice`, and only a phone knows what its own compass
   * is worth), the replay harness its transport. Handed in rather than drawn
   * by the scene over the top of this view, so that it is laid out *with* the
   * compass strip and the card instead of on top of them — everything in that
   * stack moves down when it appears, and nothing of the app is ever under a
   * control that is not the app's.
   */
  notice?: React.ReactNode;
  /**
   * The scene's own debug pages, shown before the ones the view adds. Each
   * scene has a different answer to "where is this attitude coming from", and
   * that answer is most of what the overlay is for.
   */
  sceneDebugSections?: () => DebugSection[];
};

/**
 * The AR view: a camera frame with the satellite markers and the app's controls
 * composited over it, plus the debug overlays when they are switched on.
 *
 * Everything specific to where the picture comes from is in the `frame` it is
 * handed — its shape, its lens, how to draw it, how to read its pixels and how
 * it is laid over the screen — so this holds no branches for one source or
 * another. Two view modes: normal draws the markers, debug adds the sky mask
 * over the picture and a panel of the figures behind it.
 *
 * **The controls are a thin layer of glass over the picture, and there are
 * five of them.** The app's name over a live count of what is overhead, top
 * left, which opens into what those marks are; two round buttons, top right,
 * which freeze the view and open the filter; a rule of cardinal points along the foot of the
 * frame (`HorizonCompass`); one card above the tab bar — the satellite
 * somebody tapped, or the next pass if nobody has; and the bar itself, which is
 * the way out of the sky and into the two tabs that are not it. Everything else
 * the view used to keep on the picture — a word saying FILTER, a `?`, the word
 * CONSOLE — is behind the settings tab or behind an icon, because every word
 * over a camera view is a word over the thing somebody is trying to look at.
 *
 * The bottom four of those are laid out as one column rather than pinned to
 * corners (`styles.bottom`), which is what lets them move for each other: the
 * compass rises when a card grows a photograph, and a compass warning appearing
 * pushes the stack down rather than landing on top of it.
 *
 * The picture is the whole screen and the controls are laid over it, rather
 * than the picture being one part of a screen and the controls the others. On the
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
 * again — or, with the filter panel down from its button, puts that away
 * instead, which is what a tap outside an open menu means everywhere else on
 * this platform.
 */
export const SkyOverlay: React.FC<Props> = ({
  frame,
  catalog,
  epochRef,
  attitude,
  enabledCategories,
  onToggleCategory,
  enabledSubcategories,
  onToggleSubcategory,
  onEnableAll,
  tab,
  onSelectTab,
  filterOpen,
  onToggleFilter,
  frozen,
  onToggleFrozen,
  onMaskStatusChange,
  onSkyFixChange,
  debug,
  onToggleDebug,
  onOpenConsole,
  guide,
  onOpenGuide,
  onCloseGuide,
  warned = false,
  skyMaskFiltering,
  onToggleSkyMaskFiltering,
  celestialAlignment,
  onToggleCelestialAlignment,
  notice = null,
  sceneDebugSections
}) => {
  const [fatal, setFatal] = useState<Error | null>(null);
  /**
   * What the last frame put on screen, for the line under the title.
   *
   * Held here rather than by the scene, which is where it used to live: the
   * only thing that reads it is the header a few nodes below this, and a
   * summary routed out to the scene and back made every one of those updates a
   * render of the scene, the camera view and this overlay to move a number.
   * The loop publishes only on a real change (`SkySummary`).
   */
  const [sky, setSky] = useState<SkySummary>(NO_SKY);
  const [available, setAvailable] = useState<FrameSize | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  /**
   * Where to point the phone for a satellite picked out of the passes panel,
   * while the sign saying so is up. See `FindInSky`.
   */
  const [aim, setAim] = useState<SkyAim | null>(null);
  /** One up per press, so picking the same object twice shows the sign twice. */
  const aimCount = useRef(0);
  /**
   * How much of the safe area the tab bar takes, which is where the catalog
   * and settings sheets stop. Measured rather than assumed: the bar's height
   * is its labels', and those follow the reader's text size.
   */
  const [tabBarHeight, setTabBarHeight] = useState(TAB_BAR_ESTIMATE);
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
  /**
   * Half the field of view the screen is actually showing, across.
   *
   * The lens covers the whole frame, and under `cover` the screen is showing
   * the middle fraction of it — so this is the lens's own half-angle narrowed
   * by whatever the viewport kept. The compass strip is laid out against it,
   * which is what makes a cardinal point sitting a third of the way across the
   * strip a third of the way across the picture.
   */
  const halfFovDeg = useMemo(
    () =>
      toDegrees(
        Math.atan(frame.lens.horizontalScale * ((viewport.right - viewport.left) / 100))
      ),
    [frame.lens.horizontalScale, viewport.left, viewport.right]
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
  const { reset: resetCelestial, onFrame: onCelestialFrame } = celestial;

  // How bright the picture is behind the marks, off the same frames: a mark
  // over the moon or a street lamp gets its dark edge back at night, where
  // light with no edge would vanish into it. A ref, because only the marker
  // loop reads it and it lands once a second. See `backdropBrightness.ts`.
  const backdropRef = useRef<BackdropBrightness | null>(null);
  //
  // Both walk every pixel of the frame, so both go a slice at a time: run in one
  // go, the two of them straight after a mask were the longest freeze a pass
  // put on the view. See `timeSlice.ts`.
  const onSegmentedFrame = useCallback(
    async (sample: SegmentedFrameSample) => {
      const grid = await brightnessGridSliced(sample.pixels, sample.size, startSlicing());
      backdropRef.current = {
        grid,
        attitude: sample.attitude,
        capturedAtSeconds: sample.capturedAtSeconds
      };
      await onCelestialFrame(sample);
    },
    [onCelestialFrame]
  );

  const segmentation = useSkySegmentation(
    grabberRef,
    frame.lens,
    smoothed.filterRef,
    // What the segmentation filter warps its previous mask by.
    smoothed.readingRef,
    setFatal,
    frame.rebuild,
    onSegmentedFrame,
    // Nothing new to segment in a picture that is not moving, and the mask it
    // froze with is the one that describes it.
    frozen
  );

  const {
    markers,
    tracker,
    skyMemory,
    markerStatsRef,
    frameRateRef,
    frameStallsRef,
    latestFrameRef,
    drawnEpochRef,
    reset: resetMarkers,
    upcoming
  } = useAnimatedMarkers({
    catalog,
    lens: frame.lens,
    epochRef,
    orientationFilterRef: smoothed.filterRef,
    mask: segmentation.mask,
    backdropRef,
    maskFiltering: skyMaskFiltering,
    enabledCategories,
    enabledSubcategories,
    viewport,
    onSkyChange: setSky,
    frozen,
    selectedName: selection?.selected ?? null
  });

  // The tapped satellite's day ahead, for its card: the next pass that can be
  // seen at all. Against the epoch on screen, like everything else the card
  // says.
  const selectedPasses = useSelectedPasses({
    tracker,
    epochRef: drawnEpochRef,
    name: selection?.selected ?? null
  });

  // And the orbit it draws on the ground, for the map at the foot of the same
  // card. Not about this place the way the passes above are — an orbit is the
  // same orbit wherever it is watched from — but planned against the same
  // epoch, because the fix it carries is what puts the observer on the map.
  const groundTrack = useGroundTrack({
    tracker,
    epochRef: drawnEpochRef,
    name: selection?.selected ?? null
  });

  /**
   * A row of the catalog, picked: the same selection again, and the sky back.
   *
   * The catalog is a way of finding an object rather than a place to read about
   * one, so what a row does is hand the screen back to the view the app is,
   * with that object selected — its card open, and its own pass drawn across
   * the picture by the selection itself (`useFocusedPath`). For something that
   * has not risen yet, that arc is the whole answer the tab exists to give.
   */
  const selectFromCatalog = useCallback(
    (name: string) => {
      setSelection({ names: [name], selected: name });
      onSelectTab("sky");
    },
    [onSelectTab]
  );

  // What the tapped satellite is, resolved on the card's own slow timer against
  // the epoch of whatever frame is on screen when it asks — which on a frozen
  // sky is the moment it froze, so the card describes the mark that was tapped
  // rather than wherever the object has got to since.
  const describeRef = useLatestRef((name: string) => {
    const { time, observer } = drawnEpochRef.current;
    return tracker.describe(name, time, observer);
  });

  /**
   * A row of the passes panel, picked: the same selection a tap on the object's
   * own mark makes, so the card that opens is the card the sky would have
   * opened. One name rather than a cluster: a row is one object by
   * construction.
   *
   * And the sign over the middle of the picture, which is the half a tap on a
   * mark does not need: somebody who tapped the sky is already looking at it,
   * and somebody who pressed a row in a list is looking at a list. See
   * `FindInSky`. The bearing is read here, at the moment of the press, because
   * that is when it is true.
   *
   * Stable, so the panel does not render every time a sky mask lands on this
   * view; `describeRef` is a ref and never changes identity.
   */
  const selectPass = useCallback(
    (name: string) => {
      setSelection({ names: [name], selected: name });
      const detail = describeRef.current(name);
      // Nothing to point at for a name the catalog has dropped since the plan
      // was made — the card about to open says so, which is the whole answer.
      setAim(
        detail
          ? {
              id: aimCount.current++,
              direction: lookDirection(detail),
              risen: detail.elevationDeg >= MINIMUM_SATELLITE_ELEVATION_DEG
            }
          : null
      );
    },
    [describeRef]
  );

  /**
   * What a tap on the picture means: the satellites under the finger — marks,
   * and the names written along the paths across the sky — or nothing at all.
   *
   * The frame is read from a ref rather than subscribed to, so this view still
   * renders only when something it draws changes rather than sixty times a
   * second (`latestFrameRef`). An empty answer is a real one — tapping the sky
   * between the markers is how a card is dismissed, which is the gesture
   * anything drawn over a photograph has to honour.
   */
  const onTapSky = (event: GestureResponderEvent) => {
    // A panel hanging from the header is dismissed by a tap on the sky and
    // nothing else happens, which is what a tap outside an open menu means
    // everywhere else on this platform.
    if (filterOpen) {
      onToggleFilter();
      return;
    }
    // Where the press landed is a platform question, and `pressPoint` is the
    // whole of it: React Native measures it, the web has to be measured.
    const point = pressPoint(event);
    if (!frameStyle || !point) return;

    const names = namesUnder(latestFrameRef.current, frameStyle, point);
    setSelection(names.length === 0 ? null : { names, selected: names[0] });
    // Whoever tapped the picture is looking at the picture, and the sign is
    // advice about an object they may just have stopped asking about.
    setAim(null);
  };

  // Rebuilt on every render and read only through the ref, because the panel
  // samples it on its own slow timer rather than drawing from this render.
  const debugSource: DebugSource = () => {
    // Asked of the grabber each time the panel samples, like everything else on
    // these pages: the choice between video frames and stills can change under
    // it, from a run of failures or from the check against a still.
    const reading = frame.grabber.reading?.() ?? null;
    const setPreferVideo = frame.grabber.setPreferVideo;
    return [
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
        nowMs: performance.now(),
        reading,
        videoFrames:
          reading && setPreferVideo
            ? { on: reading.preferVideo, onToggle: () => setPreferVideo(!reading.preferVideo) }
            : null
      }),
      // The model's session came up once at boot, so this is a plain read rather
      // than something sampled off a ref: it never changes underneath the panel's
      // own timer the way a per-frame stat does. See `skyModelDiagnostics`.
      modelSection(skyModelDiagnostics()),
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
        frameRate: frameRateRef.current,
        stalls: frameStallsRef.current,
        draw: markerDrawStats()
      })
    ];
  };
  const debugSourceRef = useLatestRef(debugSource);

  const maskStatus = describeMask(segmentation.mask, segmentation.error);
  const onMaskStatusChangeRef = useLatestRef(onMaskStatusChange);
  useEffect(() => {
    onMaskStatusChangeRef.current?.(maskStatus);
  }, [maskStatus, onMaskStatusChangeRef]);

  // A sign about where to point the phone is worthless once the phone is
  // pointed at something else: a tab over the sky, or the debug overlays taking
  // the picture. Dropped rather than merely hidden, so coming back does not
  // replay a bearing that is minutes old.
  useEffect(() => {
    if (tab !== "sky" || debug) setAim(null);
  }, [debug, tab]);

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
    backdropRef.current = null;
    resetMarkers();
  }, [resetCelestial, resetMarkers, segmentation, smoothed]);

  // Thrown during render so `FatalErrorBoundary` can catch it: an async failure
  // in the segmentation loop has no call stack React can see, and the view must
  // not be left drawing markers against a mask that has stopped arriving.
  if (fatal) throw fatal;

  return (
    // The provider is where the controls the tour points at leave their views
    // for it to measure. See `useTourTarget`.
    <TourTargetsProvider>
      <View style={styles.sky} onLayout={onLayout}>
        <View style={[styles.frame, frameStyle]}>
          {frame.render({ onDiscontinuity, frozen })}

          {/* Not while it is switched off: the mask drawn over the picture is
              the reason a marker is missing, and with nothing being hidden it
              would be a red grid explaining markers that are all still there.
              Nor while the view is frozen: the grid is placed by the live aim,
              and would go on sliding over a picture that does not. */}
          {debug && skyMaskFiltering && segmentation.mask && !frozen && (
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

        {/* The control layer, inset off the notch and the home indicator while
            the picture underneath it is not. A title and one button at the top,
            a stack at the bottom, and nothing at all in the middle: what is in
            the middle is the sky. See `SafeAreaLayer`. */}
        <SafeAreaLayer>
          {tab === "sky" && (
            <>
              <SkyHeader
                sky={sky}
                filterOpen={filterOpen}
                onToggleFilter={onToggleFilter}
                frozen={frozen}
                frozenAt={frozen ? drawnEpochRef.current.time : null}
                onToggleFrozen={onToggleFrozen}
              />

              <CategoryLegend
                open={filterOpen}
                enabledCategories={enabledCategories}
                onToggleCategory={onToggleCategory}
                enabledSubcategories={enabledSubcategories}
                onToggleSubcategory={onToggleSubcategory}
                onEnableAll={onEnableAll}
              />
            </>
          )}

          {/* The other two tabs are sheets over the camera rather than screens
              the app has navigated to: the view underneath keeps running, and
              coming back is one tap onto a sky that never stopped. They stop
              at the tab bar rather than running on under it: the bar is glass,
              and a list scrolling behind it put its rows through the tabs. */}
          {tab !== "sky" && (
            <View style={[styles.sheet, { bottom: tabBarHeight }]}>
              {tab === "catalog" && (
                <CatalogScreen
                  catalog={catalog}
                  epochRef={epochRef}
                  onSelect={selectFromCatalog}
                />
              )}
              {tab === "settings" && (
                <SettingsScreen
                  onOpenGuide={onOpenGuide}
                  onOpenConsole={onOpenConsole}
                  warned={warned}
                />
              )}
            </View>
          )}

          {/* The bottom of the screen, as one column rather than four things each
              pinned to a corner of it. Laying it out means the strip rises when a
              card grows a photograph, and a notice appearing pushes everything
              below it down instead of landing on top of it — which is what the
              old corners did to each other, and why the passes panel used to be
              taken off the screen whenever the compass notice was up. */}
          <View style={styles.bottom}>
            {tab === "sky" && (
              <>
                {notice ? <View style={styles.inset}>{notice}</View> : null}

                {/* Where the camera is pointing, as a rule under the picture.
                    Drawn under the debug overlays too: it is a fact about the
                    view rather than a panel over it. */}
                <HorizonCompass
                  orientationFilterRef={smoothed.filterRef}
                  halfFovDeg={halfFovDeg}
                  frozen={frozen}
                />

                {/* One card at a time, and always the thing most worth reading:
                    the satellite somebody tapped, or — with nothing tapped — the
                    next pass. Neither under the debug overlays, where the picture
                    is the mask's and the sheet is the console's. */}
                {!debug && selection && (
                  <SatelliteCard
                    style={styles.inset}
                    names={selection.names}
                    selected={selection.selected}
                    onSelect={(name) => {
                      setSelection({ names: selection.names, selected: name });
                      setAim(null);
                    }}
                    onClose={() => {
                      setSelection(null);
                      setAim(null);
                    }}
                    describeRef={describeRef}
                    sighting={selectedPasses.sighting}
                    groundTrack={groundTrack}
                  />
                )}

                {!debug && !selection && (
                  <UpcomingPasses
                    style={styles.inset}
                    passes={upcoming}
                    epochRef={epochRef}
                    onSelect={selectPass}
                  />
                )}

                {debug && (
                  <DebugPanel
                    style={styles.inset}
                    sourceRef={debugSourceRef}
                    onClose={onToggleDebug}
                  />
                )}
              </>
            )}

            <TabBar
              tab={tab}
              onSelect={onSelectTab}
              warned={warned}
              onHeightChange={setTabBarHeight}
            />
          </View>
        </SafeAreaLayer>

        {/* Over the picture and over the panels, in the middle of the screen,
            for a few seconds after a pass is picked out of the list: which way
            to point the phone. Not under the debug overlays, where the picture
            belongs to the mask, and not while another tab is over the sky —
            there is nothing to aim at behind a sheet. */}
        {tab === "sky" && !debug && (
          <FindInSky aim={aim} onDone={() => setAim(null)} />
        )}

        {/* Last, so it is over every panel: it lights up the real ones. */}
        {guide && <GuideTour onDone={onCloseGuide} />}
      </View>
    </TourTargetsProvider>
  );
};

/**
 * What the tab bar is taken to measure before it has been laid out, in points:
 * its padding, a glyph and a label. Replaced on the first layout.
 */
const TAB_BAR_ESTIMATE = 66;

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
  },
  /** Where the catalog and settings sheets are laid: the safe area, down to the tab bar. */
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0
  },
  /**
   * The bottom of the screen: a notice, the compass, one card and the tab bar,
   * in that order, stacked upwards from the home indicator.
   *
   * A column rather than four absolute corners, so that the things in it move
   * for each other. `box-none`, so the gaps between them are still sky — a tap
   * between the compass and the card selects a satellite, as it does anywhere
   * else on the picture.
   */
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    // `box-none`, so the gaps between the things in this column are still sky:
    // a tap between the compass and the card selects a satellite, as it does
    // anywhere else on the picture. In the style rather than as the prop,
    // which both React Native and the web have moved on from.
    pointerEvents: "box-none"
  },
  /**
   * The inset the sheets in that stack keep off the sides of the screen.
   *
   * Not on the stack itself, because two of the things in it are edge to edge
   * on purpose: the tab bar, which is a bar, and the compass strip, whose
   * letters run off the sides of the picture the way the picture itself does.
   */
  inset: {
    marginHorizontal: 12
  }
});

export default SkyOverlay;
