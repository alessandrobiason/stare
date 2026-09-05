import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { DeviceCapabilities } from "../device/capabilities";
import { DeviceOrientation, subscribeToDeviceOrientation } from "../device/deviceOrientation";

/** Live device attitude, as everything downstream of the sensors takes it. */
export type DeviceOrientationFeed = {
  /**
   * Subscribes to readings; the returned function unsubscribes. A listener that
   * arrives after the sensors have started is handed the newest reading at
   * once, so it is not left level until the next one.
   */
  subscribe: (listener: (orientation: DeviceOrientation) => void) => () => void;
  /**
   * The newest reading, or `null` before the first. For the debug pages, which
   * read it on their own slow timer rather than rendering from it.
   */
  latestRef: MutableRefObject<DeviceOrientation | null>;
};

/**
 * Live device attitude, or nothing at all when unavailable. What aims the view
 * on a phone; a recorded stream overrides it when one is replaying.
 *
 * Published to listeners rather than as React state. `DeviceMotion` and the
 * magnetometer are both read at 20 Hz and each publishes, so a reading arrives
 * roughly every 25 ms; as state that was up to 40 renders a second of the whole
 * scene — every marker, the camera view, the panels — for a number only the
 * attitude filter and a debug page ever look at. Nothing on screen is drawn
 * from a raw reading: the markers are drawn from the *filtered* attitude, which
 * the render loop samples itself. See `useSmoothedOrientation`.
 *
 * `declinationDeg` is how far magnetic north sits from true north here, which
 * only the caller knows — the platform's figure on a phone, the recording's
 * constant under the replay. `capabilities` is what boot found: with no motion
 * sensor there is nothing to subscribe to, so nothing is ever published rather
 * than waiting on a listener that never fires.
 */
export function useDeviceOrientation(
  capabilities: DeviceCapabilities,
  declinationDeg: number
): DeviceOrientationFeed {
  const latestRef = useRef<DeviceOrientation | null>(null);
  const listenersRef = useRef(new Set<(orientation: DeviceOrientation) => void>());

  useEffect(() => {
    if (!capabilities.motion) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    subscribeToDeviceOrientation(
      (next) => {
        if (!active) return;
        latestRef.current = next;
        for (const listener of listenersRef.current) listener(next);
      },
      capabilities,
      declinationDeg
    )
      .then((cleanup) => {
        // The subscription can resolve after unmount; tear it straight down.
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch((error) => console.warn("Device orientation unavailable", error));

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [capabilities, declinationDeg]);

  const subscribe = useCallback((listener: (orientation: DeviceOrientation) => void) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    if (latestRef.current) listener(latestRef.current);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return useMemo(() => ({ subscribe, latestRef }), [subscribe]);
}
