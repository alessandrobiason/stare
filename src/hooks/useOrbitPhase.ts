import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../math/angles";

/** A looping forecast clock. Seeking pauses it; play resumes at that position. */
export function useOrbitPhase(loopSeconds: number | null) {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const phaseRef = useRef(0);
  const playingRef = useRef(true);

  useEffect(() => {
    if (!playing || loopSeconds === null || !(loopSeconds > 0)) return;
    if (typeof requestAnimationFrame !== "function") return;

    let previous = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      if (!playingRef.current) return;
      const elapsed = Math.max(0, now - previous);
      previous = now;
      phaseRef.current = (phaseRef.current + elapsed / (loopSeconds * 1000)) % 1;
      setPhase(phaseRef.current);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [loopSeconds, playing]);

  const seek = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    playingRef.current = false;
    phaseRef.current = clamp(value, 0, 1);
    setPlaying(false);
    setPhase(phaseRef.current);
  }, []);

  const toggle = useCallback(() => {
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }, []);

  return { phase, playing, seek, toggle };
}
