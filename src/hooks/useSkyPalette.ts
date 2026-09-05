import { MutableRefObject, useEffect, useMemo, useState } from "react";
import { blendPalettes, daylightFractionAt, MarkerPalette } from "../components/palette";
import { OrbitEpoch } from "../types";

/**
 * The palette the sky is drawn in, followed as the day turns.
 *
 * Read from the same epoch the markers are placed against — the phone's clock
 * and GPS, or the recording's own under the replay harness — so a video shot at
 * noon is drawn in the daylight set without the harness knowing there is one.
 *
 * Sampled on a slow timer rather than per frame. The sun moves at most a
 * quarter of a degree a minute, the whole fade is two degrees wide, and what
 * comes back is quantised (`daylightFractionAt`), so most samples return the
 * number the last one did and cost nothing: React bails out of a state update
 * to an identical value, and outside the twenty-odd minutes a day the fade is
 * running this never re-renders at all.
 */
export function useSkyPalette(epochRef: MutableRefObject<OrbitEpoch>): MarkerPalette {
  const [fraction, setFraction] = useState(() => fractionOf(epochRef.current));

  useEffect(() => {
    const handle = setInterval(
      () => setFraction(fractionOf(epochRef.current)),
      SAMPLE_INTERVAL_MS
    );
    return () => clearInterval(handle);
  }, [epochRef]);

  return useMemo(() => blendPalettes(fraction), [fraction]);
}

function fractionOf(epoch: OrbitEpoch): number {
  return daylightFractionAt(epoch.observer, epoch.time);
}

/**
 * How often the sun is asked where it is, in milliseconds.
 *
 * Fine enough that the fade advances a step at a time rather than in visible
 * jumps: at the fastest the band takes about eight minutes to cross, which is
 * fifteen seconds a step. The cost of a sample that changes nothing is a dozen
 * trigonometric calls.
 */
const SAMPLE_INTERVAL_MS = 15_000;
