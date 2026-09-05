import { useEffect, useRef, useState } from "react";

/**
 * Seconds since the animation started, as state, refreshed every display frame.
 *
 * One render per frame of one component, which is what drives the boot sky.
 * That is the same bargain `useMarkerFrames` makes for the overlay: the
 * component that draws re-renders at display rate, and nothing above it does.
 *
 * `running` false holds the clock where it is rather than resetting it — the
 * boot screen stops the sky when start-up fails, and a picture that jumped
 * back to its first frame at that moment would read as a reload.
 */
export function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  /** Where the clock was left, so a pause does not lose the time before it. */
  const restingRef = useRef(0);

  useEffect(() => {
    if (!running) return;

    const resumedAt = restingRef.current;
    let startedAt: number | null = null;
    let handle = requestAnimationFrame(function tick(now: number) {
      if (startedAt === null) startedAt = now;
      restingRef.current = resumedAt + (now - startedAt) / 1000;
      setElapsed(restingRef.current);
      handle = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(handle);
  }, [running]);

  return elapsed;
}
