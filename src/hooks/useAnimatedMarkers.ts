import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FrameLens,
  FramePoint,
  projectBeyondFrame,
  projectToFrame
} from "../camera/projection";
import { MARKER_VISIBILITY, MINIMUM_SATELLITE_ELEVATION_DEG } from "../constants";
import { rangeKm } from "../coordinates/transform";
import { OrientationFilter } from "../fusion/orientationFilter";
import { SatelliteCatalog } from "../satellite/catalog";
import { SatelliteCategory } from "../satellite/categories";
import { OrbitEpoch } from "../types";
import { SkyTracker } from "../satellite/skyTracker";
import { AnchoredSkyMask, skyProbe } from "../vision/anchoredMask";
import { MarkerVisibilityFilter } from "../vision/markerVisibility";
import { SkyMemory } from "../vision/skyMemory";
import { useLatestRef } from "./useLatestRef";

export type SatelliteMarker = {
  name: string;
  category: SatelliteCategory;
  /** Holds station over the equator: drawn as a ring, and never given a trail. */
  parked: boolean;
  point: FramePoint;
  /** Distance to the observer, in kilometres. Sets the marker's size. */
  rangeKm: number;
  /**
   * Where the object will be at the end of the trail window, in frame
   * coordinates — outside the frame if that is where it is heading. `null`
   * when the projection cannot place it, which is the same thing as no trail.
   */
  next: FramePoint | null;
  /**
   * How opaque to draw it, in `(0, 1]`. Terrain is not a switch: the mask makes
   * up its mind about an edge once a second, so a marker crossing one fades
   * between the two answers instead of blinking. See `MarkerVisibilityFilter`.
   */
  opacity: number;
};

/**
 * One drawn frame: where every marker goes, and the camera roll they are drawn
 * against. The roll travels with them because it comes from the same filter at
 * the same instant — published separately, it would cost a second state update
 * per frame and leave labels tilted for an attitude the markers never used.
 */
export type MarkerFrame = {
  markers: SatelliteMarker[];
  rollDeg: number;
};

const EMPTY_FRAME: MarkerFrame = { markers: [], rollDeg: 0 };

/**
 * How a drawn frame reaches the overlay: a subscription, not a value.
 *
 * The loop runs at display rate, and whatever it publishes is re-rendered at
 * display rate too. As state on the view that owns the loop, that was the
 * camera picture, the legend, the debug panel and the markers rebuilt sixty
 * times a second to move a dot. Handed on as a subscription instead, the only
 * thing that renders per frame is the one component that draws — the same
 * reason the attitude readings arrive this way (`AttitudeSource`).
 */
export type MarkerSource = (listener: (frame: MarkerFrame) => void) => () => void;

/** Painter's order: far before near, and landmarks over everything. */
function drawOrder(marker: SatelliteMarker): number {
  return marker.category === "LANDMARK" ? Number.POSITIVE_INFINITY : -marker.rangeKm;
}

/** What the last drawn frame did with the satellites it was handed. */
export type MarkerStats = {
  /** Markers placed on the frame. */
  drawn: number;
  /**
   * Above the elevation mask and in front of the camera, but behind terrain —
   * or faded far enough towards it not to be worth drawing.
   */
  occluded: number;
  /**
   * Placed markers, drawn or not, whose direction nothing has any answer for:
   * neither the live mask nor the sky already looked at has been aimed there.
   * Zero when the mask is keeping up, and the figure to look at when a pan
   * empties the frame.
   */
  unmapped: number;
  /**
   * Placed markers answered for by `SkyMemory` rather than by the live mask —
   * sky the phone has turned back onto, or panned past a moment ago. What this
   * counts is markers that would have been undrawable until the next pass.
   */
  remembered: number;
};

/**
 * What the loop reports besides the frame itself.
 *
 * Refs and the tracker rather than state: the debug overlay reads them on its
 * own slow timer, and publishing them would add a render per animation frame
 * for figures nothing else draws from.
 */
export type AnimatedMarkers = {
  /** Subscribe to the drawn frames. Stable, so subscribing costs one effect. */
  markers: MarkerSource;
  /** The tracker driving it, for the debug overlay's propagation readout. */
  tracker: SkyTracker;
  /** The sky already looked at, for the debug overlay's coverage readout. */
  skyMemory: SkyMemory;
  markerStatsRef: MutableRefObject<MarkerStats>;
  /** Smoothed display rate, in frames per second. */
  frameRateRef: MutableRefObject<number>;
  /**
   * The newest drawn frame, for asking where the markers are without being
   * told sixty times a second.
   *
   * What a tap needs (`markersUnder`): a question asked once, about the frame
   * that was on screen when the finger landed. Subscribed to instead, the view
   * holding the tap handler would render at display rate — which is the whole
   * of what `MarkerSource` exists to avoid.
   */
  latestFrameRef: MutableRefObject<MarkerFrame>;
  /**
   * Call on a seek: the sky jumps, so what each marker had settled on about
   * the piece of frame it was crossing no longer describes anything, and
   * neither does the sky the passes before the jump had mapped.
   */
  reset: () => void;
};

/** Weight of the newest interval in the frame-rate estimate. */
const FRAME_RATE_SMOOTHING = 0.1;

/**
 * How often the count of drawn markers is published, in milliseconds.
 *
 * The loop knows it every frame, but publishing it is a state update in the
 * scene above this one — so a single marker fading past the mask cost a render
 * of the whole view to move a number in the corner by one, sixty times a
 * second at worst. Four times a second is quicker than anyone reads it.
 */
const VISIBLE_COUNT_INTERVAL_MS = 250;

type AnimatedMarkerOptions = {
  catalog: SatelliteCatalog;
  /** The frame being drawn onto: the phone's camera, or the harness's video. */
  lens: FrameLens;
  /** Time and observer as of the newest frame. */
  epochRef: MutableRefObject<OrbitEpoch>;
  orientationFilterRef: MutableRefObject<OrientationFilter>;
  /** The newest mask, with the attitude it was taken at. */
  mask: AnchoredSkyMask | null;
  enabledCategories: Set<SatelliteCategory>;
  /**
   * Told how many markers are drawn: on a change, and no more often than
   * `VISIBLE_COUNT_INTERVAL_MS`.
   */
  onVisibleCountChange: (count: number) => void;
};

/**
 * Places satellite markers on the frame, once per display frame.
 *
 * Everything the projection depends on runs at its own rate — the epoch per
 * camera frame, attitude at the sensor rate, orbits on `SkyTracker`'s rolling
 * sweep — and none of them is the display. So each is asked where it is *now*
 * rather than sampled on a tick and interpolated: the tracker carries each
 * satellite forward on its velocity, the filter coasts on its rate estimate,
 * and the epoch is read from a ref.
 *
 * That is what removed the stepping. Easing between propagation samples instead
 * tied a marker's motion to how long the last propagation took, and stalled
 * whenever a window closed before its successor arrived — at ~100 ms of SGP4
 * per sample, most of them.
 *
 * Living outside React keeps a 60 Hz redraw out of the reconciler: mask,
 * categories and epoch are read through refs, so changing one cannot tear the
 * loop down. `requestAnimationFrame` is the frame clock on both platforms, so
 * only the lens and the epoch's source differ between them.
 */
export function useAnimatedMarkers({
  catalog,
  lens,
  epochRef,
  orientationFilterRef,
  mask,
  enabledCategories,
  onVisibleCountChange
}: AnimatedMarkerOptions): AnimatedMarkers {
  const tracker = useMemo(
    () => new SkyTracker(catalog, MINIMUM_SATELLITE_ELEVATION_DEG),
    [catalog]
  );
  // Outlives every mask that feeds it, which is the point: see `SkyMemory`.
  const skyMemory = useMemo(() => new SkyMemory(), []);

  const maskRef = useLatestRef(mask);
  const enabledCategoriesRef = useLatestRef(enabledCategories);
  const onVisibleCountChangeRef = useLatestRef(onVisibleCountChange);
  const previousFrameRef = useRef<number | null>(null);
  const markerStatsRef = useRef<MarkerStats>({
    drawn: 0,
    occluded: 0,
    unmapped: 0,
    remembered: 0
  });
  const visibilityRef = useRef(new MarkerVisibilityFilter());
  const frameRateRef = useRef(0);
  /** Who is drawing the frames, and the newest one, for whoever subscribes late. */
  const listenersRef = useRef(new Set<(frame: MarkerFrame) => void>());
  const latestFrameRef = useRef<MarkerFrame>(EMPTY_FRAME);
  /** The last count handed to `onVisibleCountChange`, and when. */
  const publishedCountRef = useRef(-1);
  const publishedCountAtRef = useRef(0);

  // Each pass, once, off the frame loop: a mask is a second of sky the app
  // would otherwise throw away when the next one lands. Cheap next to the
  // inference that produced it — a projection per grid cell in view — and it is
  // what lets a turn back onto mapped sky draw markers on the frame it happens.
  useEffect(() => {
    if (!mask) return;
    skyMemory.absorb(mask, lens, epochRef.current.observer, performance.now() / 1000);
  }, [epochRef, lens, mask, skyMemory]);

  useEffect(() => {
    let handle = requestAnimationFrame(function animate(now: number) {
      const previous = previousFrameRef.current;
      previousFrameRef.current = now;
      if (previous !== null && now > previous) {
        const rate = 1000 / (now - previous);
        frameRateRef.current =
          frameRateRef.current === 0
            ? rate
            : frameRateRef.current + (rate - frameRateRef.current) * FRAME_RATE_SMOOTHING;
      }

      const { time, observer } = epochRef.current;
      // The sweep is charged to the frame it rides on, so its slice scales with
      // how long that frame took. The first has no interval and sweeps the lot.
      tracker.sweep(time, observer, previous === null ? 0 : (now - previous) / 1000);

      const attitude = orientationFilterRef.current.sample(now / 1000);
      const currentMask = maskRef.current;
      const categories = enabledCategoriesRef.current;
      const visibility = visibilityRef.current;
      const visible: SatelliteMarker[] = [];
      let occluded = 0;
      let unmapped = 0;
      let remembered = 0;

      // No mask, no markers. Drawing them anyway — which is what happens the
      // moment this is written as "hide them only if the mask says to" — claims
      // a clear line of sight to every satellite in the catalogue on the
      // strength of never having looked. An empty frame is the honest answer
      // while the first mask is still coming, and a failing segmenter is a
      // fatal error rather than a quietly emptier sky.
      if (currentMask) {
        // Where the mask is looking, not where the phone is: the satellite's
        // own direction is projected into the frame the mask was taken from,
        // so turning the phone moves the markers and leaves what the mask says
        // about each of them alone. Read at the marker's *screen* position
        // instead, every degree the phone turned between the shutter and this
        // frame is a degree of building the mask has in the wrong place — which
        // is a satellite drawn over a roof for as long as the next pass takes.
        const skyTowards = skyProbe(currentMask, lens);
        // What the passes before this one found, for the sky this one is not
        // aimed at. Resolved once per frame rather than per satellite, like the
        // probe above it.
        const skyRemembered = skyMemory.probe(now / 1000);
        visibility.beginFrame(now / 1000);
        for (const fix of tracker.fixesAt(time, observer)) {
          if (!categories.has(fix.category)) continue;

          const point = projectToFrame(fix.position, attitude, lens);
          if (!point) continue;
          // Hide satellites the segmentation says are behind terrain or
          // buildings — but through the visibility filter, so what decides it
          // is a run of mask passes rather than the newest one on its own. The
          // hidden ones are counted rather than only dropped, because how many
          // the mask is taking is the first thing to look at when it is taking
          // the wrong ones — the debug overlay shows the figure.
          //
          // The live mask answers first and the memory only where it cannot:
          // the two are the same sky, and the more recent look is the better
          // one. What the memory covers is the sky this pass is not aimed at
          // but an earlier one was — the view either side of a pan, and
          // everything behind a phone that has turned back the way it came.
          // Without it every one of those directions waits on the segmenter
          // reaching it again, which is a second or two of empty frame for sky
          // that was mapped moments ago and has not changed since.
          //
          // Sky *nothing* has looked at is still handed on as "no reading"
          // rather than as either answer, for the same reason no mask at all
          // draws nothing: an unlooked-at direction is not a clear line of
          // sight, and it is not evidence of a building either. The filter
          // fades those out and keeps what they had decided, so they come back
          // as they were the moment a pass covers them again.
          const live = skyTowards(fix.position);
          const confidence = live ?? skyRemembered(fix.position);
          if (confidence === null) unmapped += 1;
          else if (live === null) remembered += 1;
          const opacity = visibility.sample(fix.name, confidence);
          if (opacity <= MARKER_VISIBILITY.minimumDrawnOpacity) {
            occluded += 1;
            continue;
          }

          visible.push({
            name: fix.name,
            category: fix.category,
            parked: fix.parked,
            point,
            rangeKm: rangeKm(fix.position),
            opacity,
            // Resolved against the same attitude as the marker itself, so what
            // is left between the two points is the orbit rather than the hand
            // holding the phone. Allowed off-frame: a trail about to leave the
            // view is the one whose direction says the most.
            next: fix.parked ? null : projectBeyondFrame(fix.nextPosition, attitude, lens)
          });
        }
        visibility.endFrame();
      } else {
        // No mask means no frame to compare the next one against: a satellite
        // half faded out when the mask went stale must not resume from there
        // once a fresh one lands minutes later.
        visibility.reset();
      }

      markerStatsRef.current = { drawn: visible.length, occluded, unmapped, remembered };

      // Farthest first, so nearer markers draw over the ones behind them and
      // the overlay reads as having depth. Landmarks go last whatever their
      // range: they are the one tier that must not end up underneath a dot.
      visible.sort((first, second) => drawOrder(first) - drawOrder(second));

      const drawn: MarkerFrame = { markers: visible, rollDeg: attitude.rollDeg };
      latestFrameRef.current = drawn;
      for (const listener of listenersRef.current) listener(drawn);

      if (
        visible.length !== publishedCountRef.current &&
        now - publishedCountAtRef.current >= VISIBLE_COUNT_INTERVAL_MS
      ) {
        publishedCountRef.current = visible.length;
        publishedCountAtRef.current = now;
        onVisibleCountChangeRef.current(visible.length);
      }
      handle = requestAnimationFrame(animate);
    });

    return () => cancelAnimationFrame(handle);
  }, [
    enabledCategoriesRef,
    epochRef,
    lens,
    maskRef,
    onVisibleCountChangeRef,
    orientationFilterRef,
    skyMemory,
    tracker
  ]);

  const reset = useCallback(() => {
    visibilityRef.current.reset();
    skyMemory.reset();
  }, [skyMemory]);

  const markers = useCallback<MarkerSource>((listener) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    // The loop is already running, so hand over what it drew last rather than
    // leaving the overlay empty until the next frame comes round.
    listener(latestFrameRef.current);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { markers, tracker, skyMemory, markerStatsRef, frameRateRef, latestFrameRef, reset };
}

/**
 * The newest drawn frame, as state on the component that draws it.
 *
 * One render per displayed frame, of one component — which is the whole of
 * what React is asked to do at frame rate.
 */
export function useMarkerFrames(source: MarkerSource): MarkerFrame {
  const [frame, setFrame] = useState<MarkerFrame>(EMPTY_FRAME);
  useEffect(() => source(setFrame), [source]);
  return frame;
}
