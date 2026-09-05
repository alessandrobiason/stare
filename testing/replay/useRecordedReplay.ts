import { MutableRefObject, useCallback, useMemo, useRef, useState } from "react";
import { ObserverLocation, OrbitEpoch } from "../../src/types";
import { RecordingData, RecordingSnapshot, snapshotAt } from "./recordingDataset";

export type RecordedReplay = {
  /**
   * Fully interpolated sensor state at the current video time.
   *
   * A ref for the same reason as `epochRef`: it is rewritten once per displayed
   * frame, and the debug pages that read it are drawn on their own slow timer.
   * As state it was a render of the whole scene per video frame.
   */
  snapshotRef: MutableRefObject<RecordingSnapshot | null>;
  /** Subscribes to that state; the returned function unsubscribes. */
  subscribe: (listener: (snapshot: RecordingSnapshot) => void) => () => void;
  /** The absolute date the recording's t=0 is being replayed as. */
  replayStart: Date;
  /**
   * The epoch as of the newest video frame, for the render loop to read.
   *
   * A ref, not state: it changes every displayed frame and the satellite loop
   * redraws on its own schedule, so React would only add a re-render per frame
   * to reach a consumer that does not render from it.
   */
  epochRef: MutableRefObject<OrbitEpoch>;
  onPlaybackTimeChange: (elapsedSeconds: number) => void;
};

/**
 * Drives replay state from the video's playback position. Boot loads the
 * recording, so this only samples it.
 *
 * Its timestamps are elapsed seconds, not dates, so propagation is anchored to
 * a replay epoch chosen when the app opens and advanced by the video's clock.
 * Both outputs follow every displayed frame: rationing the epoch to a fixed
 * cadence was `SkyTracker`'s problem before it swept, and it would rather have
 * the real time each frame than interpolate back out of a stale one.
 *
 * Nothing here is published as state. The harness stands in for a phone, and on
 * a phone the sensors arrive the same way — see `useDeviceOrientation` — so the
 * two paths have the same render behaviour as well as the same arithmetic.
 */
export function useRecordedReplay(data: RecordingData): RecordedReplay {
  const [replayStart] = useState(() => new Date());

  const orbitEpochAt = useCallback(
    (elapsedSeconds: number, observer: ObserverLocation): OrbitEpoch => ({
      time: new Date(replayStart.getTime() + elapsedSeconds * 1000),
      observer
    }),
    [replayStart]
  );

  // Video time, not sensor time: the replay opens on the first frame.
  const [initial] = useState(() => snapshotAt(data, 0));
  const snapshotRef = useRef<RecordingSnapshot | null>(initial);
  const epochRef = useRef<OrbitEpoch>(orbitEpochAt(initial.elapsedSeconds, initial.observer));
  const listenersRef = useRef(new Set<(snapshot: RecordingSnapshot) => void>());

  const onPlaybackTimeChange = useCallback(
    (elapsedSeconds: number) => {
      const current = snapshotAt(data, elapsedSeconds);
      // Written before the listeners are told, so nothing they do can read an
      // epoch older than the frame they are being told about.
      epochRef.current = orbitEpochAt(elapsedSeconds, current.observer);
      snapshotRef.current = current;
      for (const listener of listenersRef.current) listener(current);
    },
    [data, orbitEpochAt]
  );

  const subscribe = useCallback((listener: (snapshot: RecordingSnapshot) => void) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    // The opening frame has already been sampled, so hand it over rather than
    // leaving a subscriber with nothing until the video starts moving.
    if (snapshotRef.current) listener(snapshotRef.current);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return useMemo(
    () => ({ snapshotRef, subscribe, replayStart, epochRef, onPlaybackTimeChange }),
    [onPlaybackTimeChange, replayStart, subscribe]
  );
}
