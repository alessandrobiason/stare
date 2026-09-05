import { RefObject, useEffect } from "react";
import { useLatestRef } from "../../src/hooks/useLatestRef";

/** `HTMLVideoElement` plus the frame callback API, which TS does not yet declare. */
export type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { mediaTime: number }) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Reports the replayed video's current time once per *displayed* frame.
 *
 * The harness's clock, standing in for the phone's `useLiveSky`: the recording
 * carries elapsed seconds, and this is what turns them into the epoch the
 * markers are placed against.
 *
 * The `timeupdate` event is deliberately low frequency in browsers (often about
 * 4 Hz), which is far too coarse to drive camera orientation and satellite
 * projection. `requestVideoFrameCallback` fires per presented frame and is used
 * where available, with `requestAnimationFrame` as the fallback.
 */
export function usePlaybackTime(
  videoRef: RefObject<HTMLVideoElement | null>,
  onTimeChange: (seconds: number) => void
): void {
  const onTimeChangeRef = useLatestRef(onTimeChange);

  useEffect(() => {
    const video = videoRef.current as FrameCallbackVideo | null;
    if (!video) return;

    let active = true;
    const requestVideoFrame = video.requestVideoFrameCallback;

    if (requestVideoFrame) {
      let handle = requestVideoFrame.call(video, function onFrame(_now, metadata) {
        onTimeChangeRef.current(metadata.mediaTime);
        if (active) handle = requestVideoFrame.call(video, onFrame);
      });
      return () => {
        active = false;
        video.cancelVideoFrameCallback?.(handle);
      };
    }

    let handle = requestAnimationFrame(function onAnimationFrame() {
      if (!active) return;
      if (!video.paused && !video.ended) onTimeChangeRef.current(video.currentTime);
      handle = requestAnimationFrame(onAnimationFrame);
    });
    return () => {
      active = false;
      cancelAnimationFrame(handle);
    };
  }, [onTimeChangeRef, videoRef]);
}
