import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrameLens } from "../camera/projection";
import { CELESTIAL_ALIGNMENT } from "../constants";
import {
  bodiesWorthSighting,
  CelestialNorthReference,
  CelestialSighting,
  sightBody
} from "../fusion/celestialNorth";
import { OrientationFilter } from "../fusion/orientationFilter";
import { OrbitEpoch } from "../types";
import { brightBlobs } from "../vision/brightBodies";
import { SegmentedFrameSample } from "./useSkySegmentation";

/** What the alignment has been doing, for the debug overlay. */
export type CelestialAlignmentStats = {
  /** What became of the last frame, in a few words. */
  status: string;
  /** Which bodies were high enough to be looked for when it was taken. */
  looking: string;
  /** The last sighting that was fed to the filter. */
  applied: CelestialSighting | null;
  /** `performance.now()` seconds when that happened. */
  appliedAtSeconds: number | null;
  /** Frames looked at, sightings made, and sightings acted on. */
  frames: number;
  sightings: number;
  fixes: number;
};

const IDLE: CelestialAlignmentStats = {
  status: "No frame looked at yet",
  looking: "—",
  applied: null,
  appliedAtSeconds: null,
  frames: 0,
  sightings: 0,
  fixes: 0
};

export type CelestialAlignment = {
  /**
   * Handed to `useSkySegmentation`, which calls it with every frame a pass
   * succeeded on. Stable across renders, so the segmentation loop is not
   * rebuilt for it.
   */
  onFrame: (frame: SegmentedFrameSample) => void;
  /** Counters and the last verdict, read by the debug panel on its own timer. */
  statsRef: MutableRefObject<CelestialAlignmentStats>;
  /** Drops the run of sightings. Call on a seek, as the attitude filter does. */
  reset: () => void;
  /**
   * Whether the heading is currently the sky's rather than the compass's.
   *
   * React state, unlike everything else here, and for the reason
   * `useCompassAccuracy` gives about the same kind of value: something is drawn
   * from it. A compass the platform will not vouch for normally puts a line
   * over the sky asking for a figure-eight (`CompassNotice`), and while a
   * sighting is standing that line is asking for work that would change
   * nothing — the bearing it would fix is not the one aiming the view.
   *
   * It changes a handful of times a session at most, so it costs a render each
   * time rather than one per frame.
   */
  fixStanding: boolean;
};

export type CelestialAlignmentInput = {
  /** When and where the markers are being placed: the ephemeris needs both. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /** The lens the frame's pixels cover, for turning one of them into a ray. */
  lens: FrameLens;
  /** The filter a confirmed sighting corrects. */
  orientationFilterRef: MutableRefObject<OrientationFilter>;
  /**
   * Whether to look at all. Off, frames are dropped where they arrive and the
   * run of sightings is thrown away, so switching it back on starts over rather
   * than confirming against a sighting from before it was turned off.
   */
  enabled: boolean;
};

/**
 * Checks the compass against the sky, on the frames the sky segmentation has
 * already captured.
 *
 * The one thing aiming this view that has an answer key. Everything else is a
 * sensor being trusted: the magnetometer says where north is and nothing can
 * contradict it, so a magnet near the phone quietly moves the whole sky
 * (`CompassNotice`). But the sun's bearing is known from the clock and the GPS
 * fix to an arcminute, and on a clear day the sun is in the frame — so the
 * difference between where the app draws it and where the camera sees it is the
 * compass error, measured rather than guessed. `celestialNorth.ts` has the
 * geometry and the gates; this is the loop around them.
 *
 * Nothing about it is a mode. There is no calibration step, nothing for the
 * person holding the phone to do, and no state to be in: when a body is up and
 * findable the heading quietly becomes right, and when it clouds over the
 * estimate decays back to the magnetometer over minutes. The most that is ever
 * shown is a line on a debug page saying what the last frame was made of.
 *
 * Free, in the sense that matters on a phone: the capture, the resample and the
 * JPEG round trip are the whole cost of looking at the sky, they have already
 * been paid for by the segmentation pass, and what is added here is one pass
 * over a 320x448 buffer.
 */
export function useCelestialAlignment({
  epochRef,
  lens,
  orientationFilterRef,
  enabled
}: CelestialAlignmentInput): CelestialAlignment {
  const referenceRef = useRef(new CelestialNorthReference());
  const statsRef = useRef<CelestialAlignmentStats>(IDLE);
  const [fixStanding, setFixStanding] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const reset = useCallback(() => {
    referenceRef.current.reset();
  }, []);

  // Switched off, the run is dropped rather than left to be confirmed against
  // whenever it is switched back on: the two sightings either side of that
  // would be minutes and a walk apart, which is exactly what the hold window
  // exists to refuse.
  useEffect(() => {
    if (!enabled) {
      referenceRef.current.reset();
      statsRef.current = { ...statsRef.current, status: "Switched off" };
      setFixStanding(false);
    }
  }, [enabled]);

  /**
   * Lets the standing fix lapse once nothing has renewed it.
   *
   * On its own timer rather than off the next frame, because the case this is
   * for is frames that have stopped saying anything — the sun behind a
   * building, or a night that has begun — and there is nothing due to arrive
   * that would notice. Coarse on purpose: what it gates is a line of text, and
   * the thing it is tracking decays over tens of seconds.
   */
  useEffect(() => {
    if (!fixStanding) return;
    const timer = setInterval(() => {
      const appliedAt = statsRef.current.appliedAtSeconds;
      const age = appliedAt === null ? Infinity : performance.now() / 1000 - appliedAt;
      if (age > CELESTIAL_ALIGNMENT.fixStandsForSeconds) setFixStanding(false);
    }, LAPSE_POLL_MS);
    return () => clearInterval(timer);
  }, [fixStanding]);

  const onFrame = useCallback(
    (frame: SegmentedFrameSample) => {
      if (!enabledRef.current) return;

      const stats = statsRef.current;
      const frames = stats.frames + 1;

      // The epoch of the frame on screen rather than of the capture a second
      // earlier. The two differ by the sun's own motion over that second, which
      // is four thousandths of a degree — a hundredth of the best this ever
      // claims — and the capture has no wall clock of its own to be read from.
      const { time, observer } = epochRef.current;
      const bodies = bodiesWorthSighting(observer, time);
      const looking = bodies.length === 0 ? "nothing up" : bodies.map((body) => body.body).join(", ");

      if (bodies.length === 0) {
        statsRef.current = {
          ...stats,
          frames,
          looking,
          status: `Neither body between ${CELESTIAL_ALIGNMENT.minimumAltitudeDeg}° and ${CELESTIAL_ALIGNMENT.maximumAltitudeDeg}° up`
        };
        return;
      }

      const blobs = brightBlobs(frame.pixels, frame.size, {
        peakDropCounts: CELESTIAL_ALIGNMENT.peakDropCounts,
        minimumPeakLuminance: CELESTIAL_ALIGNMENT.minimumPeakLuminance,
        minimumPixels: CELESTIAL_ALIGNMENT.minimumBlobPixels,
        limit: CELESTIAL_ALIGNMENT.candidateBlobs
      });

      let sightings = stats.sightings;
      let fixes = stats.fixes;
      let applied = stats.applied;
      let appliedAtSeconds = stats.appliedAtSeconds;
      const reasons: string[] = [];

      for (const position of bodies) {
        const attempt = sightBody({
          blobs,
          attitude: frame.attitude,
          frame: frame.size,
          lens,
          position,
          northOffsetDeg: frame.northOffsetDeg
        });
        if (!attempt.sighting) {
          reasons.push(`${position.body}: ${attempt.reason}`);
          continue;
        }

        sightings += 1;
        const confirmed = referenceRef.current.confirm(attempt.sighting, frame.capturedAtSeconds);
        if (!confirmed) {
          reasons.push(`${position.body}: seen once, waiting to see it again`);
          continue;
        }

        // Straight into the same state the magnetometer corrects, weighed by
        // the sighting's own standard deviation. See `correctNorthOffset` for
        // why that is the whole of the integration.
        orientationFilterRef.current.correctNorthOffset(
          confirmed.northOffsetDeg,
          confirmed.noiseDeg
        );
        fixes += 1;
        applied = confirmed;
        appliedAtSeconds = frame.capturedAtSeconds;
        // Only on the edge: this is the one thing here that costs a render, and
        // a sighting a second would otherwise buy one a second for a boolean
        // that is already true.
        setFixStanding(true);
        reasons.push(
          `${position.body}: ${confirmed.correctionDeg >= 0 ? "+" : ""}${confirmed.correctionDeg.toFixed(1)}° at ±${confirmed.noiseDeg.toFixed(1)}°`
        );
      }

      statsRef.current = {
        status: reasons.join(" · "),
        looking,
        applied,
        appliedAtSeconds,
        frames,
        sightings,
        fixes
      };
    },
    [epochRef, lens, orientationFilterRef]
  );

  return useMemo(
    () => ({ onFrame, statsRef, reset, fixStanding }),
    [fixStanding, onFrame, reset]
  );
}

/** How often the standing fix is checked for having lapsed. */
const LAPSE_POLL_MS = 2000;
