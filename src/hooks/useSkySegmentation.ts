import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { CameraAttitude } from "../camera/attitude";
import { FrameLens } from "../camera/projection";
import { SKY_MASK_MAX_AGE_SECONDS, SKY_SEGMENTATION_INTERVAL_MS } from "../constants";
import { OrientationFilter } from "../fusion/orientationFilter";
import { AttitudeReading } from "./useSmoothedOrientation";
import { AnchoredSkyMask } from "../vision/anchoredMask";
import { applyHorizonPrior } from "../vision/horizonPrior";
import { startSegmentationLoop } from "../vision/segmentationLoop";
import { SkyMaskTemporalFilter, SkyMaskSensorSample } from "../vision/skyMaskTemporalFilter";
import { segmentSky, SkyFrameGrabber } from "../vision/skySegmenter";

/** How the segmentation loop has been getting on, for the debug overlay. */
export type SkySegmentationStats = {
  /** `performance.now()` when the newest accepted mask landed. */
  updatedAtMs: number | null;
  /** How long the last completed pass took, in milliseconds. */
  lastPassMs: number | null;
  passes: number;
  failures: number;
};

export type SkySegmentation = {
  /**
   * The newest mask and the attitude it was taken at, or `null` when there is
   * not a current one to trust. Aimed rather than bare, because a mask read at
   * the screen position a marker happens to be at now is a mask of where the
   * buildings were when the shutter opened — see `AnchoredSkyMask`.
   */
  mask: AnchoredSkyMask | null;
  error: string | null;
  /**
   * Counters kept in a ref rather than state: they change on every pass and
   * only the debug overlay reads them, on its own timer.
   */
  statsRef: MutableRefObject<SkySegmentationStats>;
  /** Call on a seek: consecutive frames are no longer contiguous. */
  reset: () => void;
};

/**
 * How many passes in a row may fail before the frame source is rebuilt, and
 * then before the view gives up and goes back to the boot screen.
 *
 * More than one because a single pass can lose to a frame that was not ready or
 * a capture the camera declined; a run of them is something that retrying alone
 * will not clear — the model, the runtime, or a camera whose photo output has
 * stopped delivering stills. Only the last of those has a remedy, and it is a
 * rebuild rather than another attempt: see `MAX_SOURCE_REBUILDS`.
 *
 * Eight rather than three because on a phone the middle ground is real and
 * three does not clear it. A still capture is refused for a few seconds at a
 * time by things that pass on their own — the session reconfiguring, a lock
 * screen, a call arriving, the app coming back to the foreground — and at one
 * pass a second, three strikes turns any of them into a trip back to the boot
 * screen. Eight seconds of nothing landing is past all of them and still well
 * inside `SKY_MASK_MAX_AGE_SECONDS`, so the markers have already stopped being
 * drawn against a stale mask long before this fires.
 */
const MAX_CONSECUTIVE_FAILURES = 8;

/**
 * How many times a frame source may be rebuilt before a run of failures is
 * reported as fatal.
 *
 * A phone camera can be got back — its capture session is a thing that can be
 * thrown away and built again, and a photo output that has stopped delivering
 * stills is the one failure on this path that a rebuild actually fixes. So a
 * run of failures asks for that first rather than going straight to a screen
 * that says the sky cannot be segmented.
 *
 * Twice, and not more, because a rebuild costs a second of black preview and
 * proves nothing on its own: a camera that has been handed back twice and
 * stopped capturing twice is not a camera having a moment. Past that the run of
 * failures is the honest report, and repeating the rebuild would only replace
 * it with a view that flickers and never says why.
 */
const MAX_SOURCE_REBUILDS = 2;

/**
 * Periodically segments the sky in whatever frame is on screen, and smooths the
 * result.
 *
 * Identical whatever the picture is: the grabber hides whether it comes from
 * the phone's camera or the harness's `<video>`, and everything after it — the
 * model, the pooling, the temporal filter — is the same code either way.
 *
 * Inference takes far longer than a frame, so runs are spaced rather than
 * scheduled: the next one starts a fixed gap after the last one finished. See
 * `startSegmentationLoop` for why that distinction is the difference between a
 * responsive view and a one-second step through everything on screen.
 *
 * Nothing here degrades into a working-looking view without a mask. A mask that
 * cannot be computed, or one that has gone stale because passes stopped landing,
 * is reported rather than papered over: without it there is nothing to say what
 * is behind a building, and drawing markers anyway would be inventing a clear
 * line of sight nobody checked.
 */
export function useSkySegmentation(
  grabberRef: MutableRefObject<SkyFrameGrabber | null>,
  lens: FrameLens,
  orientationFilterRef: MutableRefObject<OrientationFilter>,
  readingRef: MutableRefObject<AttitudeReading | null>,
  onFatal: (error: Error) => void,
  /**
   * Asks the frame source to put itself back together, if it is the sort that
   * can. See `SceneFrame.rebuild`.
   */
  rebuildSource?: () => boolean
): SkySegmentation {
  const [mask, setMask] = useState<AnchoredSkyMask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statsRef = useRef<SkySegmentationStats>({
    updatedAtMs: null,
    lastPassMs: null,
    passes: 0,
    failures: 0
  });
  const filterRef = useRef(new SkyMaskTemporalFilter(lens));
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;
  const rebuildSourceRef = useRef(rebuildSource);
  rebuildSourceRef.current = rebuildSource;

  useEffect(() => {
    let active = true;
    let failures = 0;
    let rebuilds = 0;
    /** When the newest accepted mask was produced, on the same clock as below. */
    let maskAtSeconds = -Infinity;

    const segmentCurrentFrame = async () => {
      const grabber = grabberRef.current;
      if (!active || !grabber || !grabber.size()) return;

      const startedAtMs = performance.now();
      // Where the camera was looking at the moment the frame was taken, read at
      // that moment rather than around it. The mask is filed under this aim and
      // everything downstream reads it through that: the temporal filter re-aims
      // the previous mask by the change between two of them, the horizon prior
      // caps the cells that were looking at the ground, and the markers are
      // tested against the sky it actually covers.
      //
      // The orientation filter only coasts forwards, so an attitude for the
      // shutter cannot be recovered after the fact — hence the callback rather
      // than a timestamp handed back with the pixels. The same clock as the
      // filter, so the two agree.
      let capture: { attitude: CameraAttitude; sample: SkyMaskSensorSample } | null = null;
      const onShutter = () => {
        const capturedAtSeconds = performance.now() / 1000;
        const attitude = orientationFilterRef.current.sample(capturedAtSeconds);
        capture = {
          attitude,
          sample: {
            timestampSeconds: capturedAtSeconds,
            headingDeg: attitude.headingDeg,
            pitchDeg: attitude.pitchDeg,
            rollDeg: attitude.rollDeg,
            gyroRadPerSecond: readingRef.current?.gyroRadPerSecond
          }
        };
      };

      try {
        const raw = await segmentSky(grabber, onShutter);
        if (!active) return;
        // A grabber that returned pixels without reporting a shutter would leave
        // the mask with no aim to be read at, which is not something to guess at.
        if (!capture) throw new Error("The frame was segmented without a shutter reading");
        const { attitude, sample } = capture;

        failures = 0;
        const finishedAtMs = performance.now();
        maskAtSeconds = finishedAtMs / 1000;
        statsRef.current = {
          updatedAtMs: finishedAtMs,
          lastPassMs: finishedAtMs - startedAtMs,
          passes: statsRef.current.passes + 1,
          failures: statsRef.current.failures
        };
        // Before the temporal filter, not after: the filter stores what it
        // returns and warps it into the next frame, so a mask cleared
        // afterwards would have its ground handed back by the very next blend.
        // Applied here it is carried forward with the attitude it was taken at.
        const grounded = applyHorizonPrior(raw, attitude, lens);
        // Published with `attitude` and not with the attitude the phone has by
        // now: the mask describes the frame the model was given, and the whole
        // point of carrying the aim along is that the two are a second apart.
        setMask({ mask: filterRef.current.update(grounded, sample), attitude });
        setError(null);
      } catch (cause) {
        if (!active) return;
        failures += 1;
        statsRef.current = { ...statsRef.current, failures: statsRef.current.failures + 1 };
        console.warn(`Sky segmentation failed (${failures} in a row)`, cause);
        const message = cause instanceof Error ? cause.message : "Unknown model error";
        setError(message);
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          // A phone camera that has stopped delivering stills is the one thing
          // on this path that comes back, and only by being rebuilt whole. Ask
          // for that before reporting a phone that cannot segment the sky: the
          // source reports no frame at all while it is being rebuilt, so the
          // loop waits it out rather than spending the budget again on a camera
          // that is not there yet.
          if (rebuilds < MAX_SOURCE_REBUILDS && rebuildSourceRef.current?.()) {
            rebuilds += 1;
            failures = 0;
            console.warn(`Rebuilding the frame source after a run of failures (${rebuilds})`);
            return;
          }
          active = false;
          onFatalRef.current(
            new Error(`The sky could not be segmented, so nothing can be hidden behind terrain: ${message}`)
          );
        }
      }
    };

    const stop = startSegmentationLoop(segmentCurrentFrame, SKY_SEGMENTATION_INTERVAL_MS);

    // A pass that never returns leaves the newest mask in place indefinitely,
    // and a mask of where the buildings were a minute ago is worse than none.
    const staleness = setInterval(() => {
      if (!active) return;
      if (performance.now() / 1000 - maskAtSeconds > SKY_MASK_MAX_AGE_SECONDS) {
        setMask((current) => (current === null ? current : null));
      }
    }, SKY_SEGMENTATION_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(staleness);
      stop();
    };
  }, [grabberRef, lens, orientationFilterRef, readingRef]);

  const reset = useCallback(() => filterRef.current.reset(), []);

  return { mask, error, statsRef, reset };
}
