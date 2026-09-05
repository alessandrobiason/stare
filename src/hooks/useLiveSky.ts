import { useEffect, useRef, useState } from "react";
import { subscribeToObserver } from "../device/location";
import { ObserverLocation, OrbitEpoch } from "../types";

export type LiveSky = {
  /** Where the phone is now; boot's fix until the first update arrives. */
  observer: ObserverLocation;
  /**
   * Now, and where from, for the render loop to read. The same shape the replay
   * harness publishes, so the marker loop cannot tell the two apart.
   */
  epochRef: React.MutableRefObject<OrbitEpoch>;
};

/**
 * The device's own answer to "when and where". The replay harness takes the
 * same shape from the recording's clock and GPS stream instead.
 *
 * The epoch is rewritten per displayed frame, not on a timer: the marker loop
 * carries satellites forward from whatever epoch it is handed, so a 10 Hz clock
 * would step the sky in 100 ms jumps however smoothly frames arrive. Per frame
 * costs one `Date` against the SGP4 that frame already pays for.
 *
 * The two loops are unordered, so markers can be drawn against a clock one
 * frame old — under a hundredth of a degree even for the fastest low pass, well
 * inside the tracker's own carry-forward error.
 */
export function useLiveSky(initialObserver: ObserverLocation): LiveSky {
  const [observer, setObserver] = useState(initialObserver);
  const epochRef = useRef<OrbitEpoch>({ time: new Date(), observer: initialObserver });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    subscribeToObserver((next) => {
      if (active) setObserver(next);
    })
      .then((cleanup) => {
        // The subscription can resolve after unmount; tear it straight down.
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      // Boot already has a fix; losing updates only means it stops following.
      .catch((error) => console.warn("Location updates unavailable", error));

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let handle = requestAnimationFrame(function advance() {
      epochRef.current = { time: new Date(), observer };
      handle = requestAnimationFrame(advance);
    });
    return () => cancelAnimationFrame(handle);
  }, [observer]);

  return { observer, epochRef };
}
