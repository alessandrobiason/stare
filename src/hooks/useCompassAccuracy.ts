import { useEffect, useState } from "react";
import { DeviceOrientationFeed } from "./useDeviceOrientation";

/** What the view needs to know about the compass, as opposed to the bearing. */
export type CompassState = {
  /** The platform's grade of its own compass, or `undefined` before the first heading. */
  accuracy: number | undefined;
  /**
   * Whether a declination has been had at all. False means the offsets are to
   * magnetic north — a few degrees out in most places, twenty in some.
   */
  declinationKnown: boolean;
};

const UNKNOWN: CompassState = { accuracy: undefined, declinationKnown: false };

/**
 * The compass's standing, as React state, from a feed nothing else renders
 * from.
 *
 * The rest of `DeviceOrientation` deliberately never reaches a render: readings
 * arrive around forty times a second and re-rendering the scene for each one
 * costs the camera view, every marker and every panel, which is what
 * `useDeviceOrientation` exists to avoid. This is the exception, and it earns
 * it by changing almost never — the platform regrades its compass a handful of
 * times in a session, and a declination is had once — so the state is written
 * only when one of the two actually moves, not when a reading carrying them
 * arrives.
 *
 * It has to be state rather than a ref because something is drawn from it: a
 * compass the platform cannot vouch for is the one sensor fault the view can
 * ask the person holding it to fix (`CompassNotice`), and a notice read off a
 * ref would appear only when the next unrelated render happened to come along.
 */
export function useCompassAccuracy(feed: DeviceOrientationFeed): CompassState {
  const [state, setState] = useState<CompassState>(UNKNOWN);

  useEffect(
    () =>
      feed.subscribe((orientation) => {
        const next: CompassState = {
          accuracy: orientation.compassAccuracy,
          declinationKnown: orientation.declination !== undefined
        };
        setState((current) =>
          current.accuracy === next.accuracy &&
          current.declinationKnown === next.declinationKnown
            ? current
            : next
        );
      }),
    [feed]
  );

  return state;
}
