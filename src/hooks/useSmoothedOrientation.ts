import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { AttitudeMeasurement, OrientationFilter } from "../fusion/orientationFilter";

/** One attitude reading as a scene reports it. The clock is this hook's own. */
export type AttitudeReading = Omit<AttitudeMeasurement, "timestampSeconds">;

/**
 * Where attitude readings come from: call it with a listener, and unsubscribe
 * with what it returns.
 *
 * A subscription rather than a value, because a reading arrives twenty to forty
 * times a second and nothing on screen is drawn from one. Passed down as a prop
 * it has to be React state in whichever scene owns the sensors, and every one of
 * those readings then re-renders that whole scene — camera view, overlay,
 * legend, the entire marker tree — to deliver a number to a filter that the
 * render loop samples on its own. See `useDeviceOrientation`.
 */
export type AttitudeSource = (onReading: (reading: AttitudeReading) => void) => () => void;

export type SmoothedOrientationState = {
  /**
   * The filter itself. Call `sample(nowSeconds)` from an animation frame to
   * carry the attitude forward between readings.
   */
  filterRef: MutableRefObject<OrientationFilter>;
  /**
   * The newest reading as it arrived, before smoothing, or `null` before the
   * first. The filter's own output is the one to aim the view with; this is for
   * the parts that want the raw sensor rather than the estimate — the mask's
   * temporal filter reads the turn rate off it.
   */
  readingRef: MutableRefObject<AttitudeReading | null>;
  /** Drops the estimate. Call on a seek. */
  reset: () => void;
};

/**
 * Feeds raw device attitude into `OrientationFilter`.
 *
 * The estimate is deliberately not React state. A reading arrives per camera
 * frame, so publishing it re-rendered the scene 60 times a second for consumers
 * that redraw on their own animation frame anyway — and that render produced
 * the next reading, a cascade React eventually refused outright with "maximum
 * update depth exceeded". Callers sample `filterRef` when they draw.
 *
 * The measurement going *in* is not state either, for the same reason one step
 * earlier: it arrives on `source` and goes straight into the filter, so a
 * reading costs one Kalman update and no render at all.
 *
 * Clocked on `performance.now()` rather than the measurement's own timestamp,
 * because the render loop sampling between readings has only the wall clock and
 * the two must agree. Replay runs at 1x, so this holds either way; a seek
 * breaks it, which is what `reset` is for.
 */
export function useSmoothedOrientation(source: AttitudeSource): SmoothedOrientationState {
  const filterRef = useRef(new OrientationFilter());
  const readingRef = useRef<AttitudeReading | null>(null);

  useEffect(
    () =>
      source((reading) => {
        readingRef.current = reading;
        filterRef.current.update({ ...reading, timestampSeconds: performance.now() / 1000 });
      }),
    [source]
  );

  const reset = useCallback(() => filterRef.current.reset(), []);

  return { filterRef, readingRef, reset };
}
