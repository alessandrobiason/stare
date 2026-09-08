import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { axesFromAttitude } from "../camera/attitude";
import { FrameLens, FramePoint, projectWithAxes } from "../camera/projection";
import { pointOnFrame, trailOnFrame } from "../components/markerGeometry";
import { MARKER_VISIBILITY, MINIMUM_SATELLITE_ELEVATION_DEG } from "../constants";
import { rangeKm } from "../coordinates/transform";
import { OrientationFilter } from "../fusion/orientationFilter";
import { SatelliteCatalog } from "../satellite/catalog";
import { SatelliteCategory } from "../satellite/categories";
import { breakdownSignature, FleetBreakdown, tallyFleets } from "../satellite/fleets";
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
  /**
   * Markers placed on the frame, the ones kept for a trail that still crosses
   * it after their own mark has left included — this is what was drawn, which
   * is a shade more than the figure the visible count publishes.
   */
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
 * How often the count of drawn markers, and the breakdown behind it, are
 * published, in milliseconds.
 *
 * The loop knows the count every frame, but publishing it is a state update in
 * the scene above this one — so a single marker fading past the mask cost a
 * render of the whole view to move a number in the corner by one, sixty times a
 * second at worst. Four times a second is quicker than anyone reads it.
 *
 * The tally is worked out here rather than every frame for the same reason and
 * one more: it walks the drawn markers, and doing that at display rate would be
 * a second pass over the frame for a panel that is usually closed.
 */
const VISIBLE_COUNT_INTERVAL_MS = 250;

/**
 * How far past the frame's edges a satellite is still followed, as a share of
 * the frame's own half-width and half-height.
 *
 * What a marker costs to put on screen is not only where it is: it is a
 * decision about whether the sky it sits in is clear, and then a crossfade into
 * it (`MarkerVisibilityFilter`). Both take time, and until this they were both
 * started at the frame's edge — so the sky a turn arrived on came up empty and
 * filled in behind it. Followed a frame's width out on every side, a satellite
 * has settled into the opacity it belongs at before the turn reaches it. One is
 * a band of about 19 degrees on this camera — the projection is tangential, so
 * doubling the half-width is not doubling the angle — which is a third of a
 * second at 60 deg/s, or the whole of `fadeSeconds` at 50.
 *
 * A band rather than the whole sky, which was the first thing tried and was
 * worse. A satellite off the frame is answered for by `SkyMemory` — the live
 * mask reaches nowhere near it — and every frame it spends out there is another
 * frame of the same remembered answer going into its low pass. Left out there
 * long enough it settles hard on what the memory last saw, and the band the
 * filter arbitrates with then costs it two live passes to change its mind: over
 * the recording's one long stretch of a phone pointed away from the sky, the
 * markers came back a good deal slower with the whole sky warmed than with none
 * of it. A band is bounded by how long it takes to pan across one, which is
 * under a second, so nothing has time to settle on a memory that far from what
 * the camera is looking at.
 */
const MARKER_WARMING_MARGIN = 1;

type AnimatedMarkerOptions = {
  catalog: SatelliteCatalog;
  /** The frame being drawn onto: the phone's camera, or the harness's video. */
  lens: FrameLens;
  /** Time and observer as of the newest frame. */
  epochRef: MutableRefObject<OrbitEpoch>;
  orientationFilterRef: MutableRefObject<OrientationFilter>;
  /** The newest mask, with the attitude it was taken at. */
  mask: AnchoredSkyMask | null;
  /**
   * Whether the mask is allowed to hide anything — the debug menu's switch.
   *
   * Off, every satellite above the elevation mask is drawn wherever it is, over
   * trees and walls included. That is not a view of the sky, it is a view of
   * the catalogue: what it is for is telling a mask that is hiding the wrong
   * markers apart from a sky that has nothing in it.
   */
  maskFiltering: boolean;
  enabledCategories: Set<SatelliteCategory>;
  /**
   * Told how many markers are drawn and what they are: on a change, and no
   * more often than `VISIBLE_COUNT_INTERVAL_MS`.
   */
  onVisibleCountChange: (count: number, breakdown: FleetBreakdown) => void;
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
  maskFiltering,
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
  const maskFilteringRef = useLatestRef(maskFiltering);
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
  /** What was last handed to `onVisibleCountChange`, and when. */
  const publishedRef = useRef<string | null>(null);
  const publishedAtRef = useRef(0);

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
      const filtering = maskFilteringRef.current;
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
      //
      // Unless the mask has been switched off in the debug menu — the one case
      // where having no answer about the sky is a decision someone made rather
      // than one the app is still waiting on.
      if (currentMask || !filtering) {
        // Where the mask is looking, not where the phone is: the satellite's
        // own direction is projected into the frame the mask was taken from,
        // so turning the phone moves the markers and leaves what the mask says
        // about each of them alone. Read at the marker's *screen* position
        // instead, every degree the phone turned between the shutter and this
        // frame is a degree of building the mask has in the wrong place — which
        // is a satellite drawn over a roof for as long as the next pass takes.
        //
        // Both are left unasked while the mask is switched off, which is what
        // makes the switch a switch: the segmenter goes on taking passes and
        // the memory goes on absorbing them, and neither is consulted about a
        // marker until it is turned back on.
        const skyTowards = currentMask && filtering ? skyProbe(currentMask, lens) : null;
        // What the passes before this one found, for the sky this one is not
        // aimed at. Resolved once per frame rather than per satellite, like the
        // probe above it.
        const skyRemembered = filtering ? skyMemory.probe(now / 1000) : null;
        // Six trigonometric calls, and one attitude for the whole frame. Built
        // per satellite — which is what `projectToFrame` does — they were most
        // of what the projection cost, at several hundred satellites a frame.
        const axes = axesFromAttitude(attitude);
        visibility.beginFrame(now / 1000);
        for (const fix of tracker.fixesAt(time, observer)) {
          if (!categories.has(fix.category)) continue;

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
          //
          // With the mask switched off, every direction is answered as open
          // sky rather than skipping the filter outright: the markers it was
          // hiding then fade in the way any other marker does, and switching
          // it back on fades them out again instead of cutting them.
          //
          // Asked of the satellites just outside the frame as well as the ones
          // on it, so that a turn arrives on markers that have already made
          // their minds up and faded in rather than on ones starting from
          // nothing at the edge — see `MARKER_WARMING_MARGIN`. An off-frame
          // direction is answered by the same two probes as any other, so this
          // is not a way around having looked: sky nothing has mapped stays
          // unanswered, and undrawn, wherever the phone is pointed.
          const point = projectWithAxes(fix.position, axes, lens);
          if (!point) continue;
          // Percent from the centre on the wider of the two axes: 50 is the
          // frame's own edge, and anything past the margin is far enough away
          // that no turn is about to bring it in.
          const offCentre = Math.max(Math.abs(point.left - 50), Math.abs(point.top - 50));
          if (offCentre > 50 * (1 + MARKER_WARMING_MARGIN)) continue;

          // Where the object is heading, resolved against the same attitude as
          // the marker itself, so what is left between the two points is the
          // orbit rather than the hand holding the phone. Taken before the
          // frame test rather than after it, because it is what that test asks
          // about: the trail is drawn backwards from the mark, and a mark that
          // has left the frame can still have most of its trail on it.
          const next = fix.parked ? null : projectWithAxes(fix.nextPosition, axes, lens);

          let confidence: number | null = 1;
          let fromMemory = false;
          if (skyTowards && skyRemembered) {
            const live = skyTowards(fix.position);
            confidence = live ?? skyRemembered(fix.position);
            fromMemory = live === null && confidence !== null;
          }
          const opacity = visibility.sample(fix.name, confidence);

          // Past here the marker is being drawn rather than kept warm, so the
          // ones in the margin drop out and the figures count the frame.
          //
          // A mark off the frame stays only for its trail: dropped the instant
          // its head crossed the edge, the tail behind it went with it, which
          // over a border a turning phone sweeps a marker across every few
          // frames reads as trails being cut off rather than travelling out of
          // view. Kept while the trail is still on the frame, the shape leaves
          // the way it came in — tip last — and the canvas clips the rest.
          //
          // The warming margin above is not in the way of that: it is a whole
          // frame width, which no trail this window is long enough to cross.
          const onFrame = pointOnFrame(point);
          if (!onFrame && !(next && trailOnFrame(point, next))) continue;
          if (confidence === null) unmapped += 1;
          else if (fromMemory) remembered += 1;
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
            // Allowed off-frame: a trail about to leave the view is the one
            // whose direction says the most.
            next
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

      // The clock is checked before the tally, so a sky that is not changing
      // costs one walk of the frame every quarter second rather than one per
      // frame — and the signature is checked after it, so a sky that is not
      // changing costs no render at all.
      if (now - publishedAtRef.current >= VISIBLE_COUNT_INTERVAL_MS) {
        publishedAtRef.current = now;
        // The marks on the frame, not everything drawn onto it: a satellite
        // kept for its trail alone is out of the view, and the count opens onto
        // a list of names — one naming an object nobody can see a mark for is
        // worse than a count that lets go of it at the edge.
        const onFrame = visible.filter((marker) => pointOnFrame(marker.point));
        const breakdown = tallyFleets(onFrame);
        const published = `${onFrame.length}|${breakdownSignature(breakdown)}`;
        if (published !== publishedRef.current) {
          publishedRef.current = published;
          onVisibleCountChangeRef.current(onFrame.length, breakdown);
        }
      }
      handle = requestAnimationFrame(animate);
    });

    return () => cancelAnimationFrame(handle);
  }, [
    enabledCategoriesRef,
    epochRef,
    lens,
    maskFilteringRef,
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
