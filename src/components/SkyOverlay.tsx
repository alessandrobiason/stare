import React, { MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { FrameLens } from "../camera/projection";
import { cachedCatalog } from "../data/tleCache";
import {
  catalogSection,
  DebugSection,
  DebugSource,
  maskSection,
  skySection,
  viewSection
} from "../debug/sections";
import { useAnimatedMarkers } from "../hooks/useAnimatedMarkers";
import { useLatestRef } from "../hooks/useLatestRef";
import { useSkyPalette } from "../hooks/useSkyPalette";
import { useSkySegmentation } from "../hooks/useSkySegmentation";
import { AttitudeSource, useSmoothedOrientation } from "../hooks/useSmoothedOrientation";
import { OrbitEpoch } from "../types";
import { SatelliteCatalog } from "../satellite/catalog";
import { SatelliteCategory } from "../satellite/categories";
import { AnchoredSkyMask } from "../vision/anchoredMask";
import { SkyFrameGrabber } from "../vision/skySegmenter";
import { skyCoverage } from "../vision/skyMask";
import { CategoryLegend } from "./CategoryLegend";
import { DebugPanel } from "./DebugPanel";
import { DebugToggle } from "./DebugToggle";
import { SatelliteMarkers } from "./SatelliteMarkers";
import { SkyMaskOverlay } from "./SkyMaskOverlay";
import { theme } from "./theme";

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
   * Draws the picture, filling the fitted box behind the markers.
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
  onEnableAll: () => void;
  onVisibleSatelliteCountChange: (count: number) => void;
  /** Told what the sky mask is doing, so a scene can show it. */
  onMaskStatusChange?: (status: string) => void;
  /** Whether the debug overlays are drawn on top of the normal view. */
  debug: boolean;
  onToggleDebug: () => void;
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
 * handed — its shape, its lens, how to draw it and how to read its pixels — so
 * this holds no branches for one source or another. Two view modes: normal
 * draws the markers, debug adds the sky mask over the picture and a panel of
 * the figures behind it.
 */
export const SkyOverlay: React.FC<Props> = ({
  frame,
  catalog,
  epochRef,
  attitude,
  enabledCategories,
  onToggleCategory,
  onEnableAll,
  onVisibleSatelliteCountChange,
  onMaskStatusChange,
  debug,
  onToggleDebug,
  sceneDebugSections
}) => {
  const [fatal, setFatal] = useState<Error | null>(null);
  const [available, setAvailable] = useState<Size | null>(null);
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => setAvailable(nativeEvent.layout),
    []
  );
  const aspectRatio = frame.sizePx.widthPx / frame.sizePx.heightPx;
  const frameStyle = useMemo(
    () => frameStyleFor(available, aspectRatio),
    [available, aspectRatio]
  );

  const smoothed = useSmoothedOrientation(attitude);
  // Which of the two palettes the sky is drawn in, from where and when the
  // markers are being placed. Sampled on its own slow timer: see `palette.ts`.
  const palette = useSkyPalette(epochRef);
  const grabberRef = useLatestRef<SkyFrameGrabber | null>(frame.grabber);

  const segmentation = useSkySegmentation(
    grabberRef,
    frame.lens,
    smoothed.filterRef,
    // What the segmentation filter warps its previous mask by.
    smoothed.readingRef,
    setFatal,
    frame.rebuild
  );

  const {
    markers,
    tracker,
    markerStatsRef,
    frameRateRef,
    reset: resetMarkers
  } = useAnimatedMarkers({
    catalog,
    lens: frame.lens,
    epochRef,
    orientationFilterRef: smoothed.filterRef,
    mask: segmentation.mask,
    enabledCategories,
    onVisibleCountChange: onVisibleSatelliteCountChange
  });

  // Rebuilt on every render and read only through the ref, because the panel
  // samples it on its own slow timer rather than drawing from this render.
  const debugSource: DebugSource = () => [
    ...(sceneDebugSections?.() ?? []),
    maskSection({
      mask: segmentation.mask,
      error: segmentation.error,
      stats: segmentation.statsRef.current,
      // Where the camera is aimed now, so the panel can say how far the mask
      // is from it: the one figure that says whether a pass is overdue.
      viewAttitude: smoothed.filterRef.current.sample(performance.now() / 1000),
      nowMs: performance.now()
    }),
    skySection({
      tracker: tracker.stats(),
      markers: markerStatsRef.current,
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

  const onDiscontinuity = useCallback(() => {
    // Frames are no longer contiguous, so the mask prior is worthless — and so
    // is an attitude estimate built from the frames before the jump, or what
    // each marker had settled on about the sky it was crossing.
    segmentation.reset();
    smoothed.reset();
    resetMarkers();
  }, [resetMarkers, segmentation, smoothed]);

  // Thrown during render so `FatalErrorBoundary` can catch it: an async failure
  // in the segmentation loop has no call stack React can see, and the view must
  // not be left drawing markers against a mask that has stopped arriving.
  if (fatal) throw fatal;

  return (
    <View style={styles.sky} onLayout={onLayout}>
      <View style={[styles.frame, frameStyle]}>
        {frame.render({ onDiscontinuity })}

        {debug && segmentation.mask && (
          <SkyMaskOverlay
            mask={segmentation.mask}
            orientationFilterRef={smoothed.filterRef}
            lens={frame.lens}
            frame={frameStyle}
          />
        )}

        {/* A subscription rather than a value: the loop publishes at display
            rate, and this view has nothing to redraw when it does. */}
        <SatelliteMarkers markers={markers} frame={frameStyle} palette={palette} />
      </View>

      <CategoryLegend
        enabledCategories={enabledCategories}
        onToggleCategory={onToggleCategory}
        onEnableAll={onEnableAll}
        palette={palette}
      />

      {debug && <DebugPanel sourceRef={debugSourceRef} onClose={onToggleDebug} />}
      <DebugToggle on={debug} onToggle={onToggleDebug} />
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

type Size = { width: number; height: number };

/**
 * The largest box of the camera's shape that fits in `available`.
 *
 * Markers and mask are placed in percentages of the frame, so they land where
 * the projection put them only if that frame covers the field of view they were
 * projected against. Filling the screen instead — cropping the sides off a 4:3
 * camera on a tall phone — repoints those percentages at a different piece of
 * sky at a different scale, and the markers drift as the camera moves. So the
 * picture is fitted, and everything shares the fitted box.
 */
function frameStyleFor(available: Size | null, aspectRatio: number): Size | null {
  if (!available || available.width <= 0 || available.height <= 0) return null;
  const width = Math.min(available.width, available.height * aspectRatio);
  return { width, height: width / aspectRatio };
}

const styles = StyleSheet.create({
  sky: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.background
  },
  frame: {
    // Nothing to fit to until the first layout arrives, and the picture is
    // still loading then, so an empty box is all this would show anyway.
    width: 0,
    height: 0,
    overflow: "hidden"
  }
});

export default SkyOverlay;
