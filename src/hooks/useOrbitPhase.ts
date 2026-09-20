import { useEffect, useState } from "react";

/**
 * How far round its orbit the animated satellite is, in `[0, 1)`.
 *
 * A wall clock rather than a frame counter: the phase is read off elapsed time
 * on each animation frame, so a loop takes `loopSeconds` on a phone dropping
 * frames exactly as it does on one that is not, and a stall shows as the dot
 * jumping rather than as the orbit quietly taking longer than the card says
 * it does.
 *
 * `null` stops it, for a card with no orbit to draw.
 *
 * Keyed on the loop's length alone, which is deliberate: the track underneath
 * is replanned from time to time (`useGroundTrack`) and restarting the
 * animation at every replan would put a stutter into a loop that is otherwise
 * continuous. The length only changes when the card is opened on a different
 * object, which is the one moment the phase *should* go back to the start.
 */
export function useOrbitPhase(loopSeconds: number | null): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (loopSeconds === null || !(loopSeconds > 0)) return;
    // Server-rendered in the test suite, where there are no frames to ask for.
    if (typeof requestAnimationFrame !== "function") return;

    setPhase(0);
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick() {
      const elapsed = (performance.now() - startedAt) / 1000;
      // `%` on a float that only grows: the modulo is what makes it a loop, and
      // the elapsed time is small enough for the whole life of an open card
      // that it cannot lose precision.
      setPhase((elapsed / loopSeconds) % 1);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [loopSeconds]);

  return loopSeconds === null ? 0 : phase;
}
