import { CameraView } from "expo-camera";
import React, { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { runCaptureProbe } from "../debug/captureProbe";
import {
  DEVICE_CAMERA_PREVIEW_START_TIMEOUT_MS,
  DEVICE_CAMERA_REBUILD_GAP_MS
} from "../constants";

type Props = {
  /** Handed to the sky segmenter, which captures frames through it. */
  cameraRef: React.RefObject<CameraView | null>;
  /**
   * Told whether the camera can be captured from.
   *
   * `takePictureAsync` is only legal between `onCameraReady` and the view going
   * away; before that the native side has no photo output and the call throws.
   * The segmenter has to know the difference between a frame it cannot have yet
   * and a pass that failed, because it treats a run of the latter as fatal.
   */
  onReadyChange: (ready: boolean) => void;
  /**
   * Filled, while this is mounted, with "the camera has stopped capturing; try
   * to get it back".
   *
   * A ref rather than a prop the other way round because the caller is the
   * segmentation loop, several components up and running on its own timer: it
   * needs to reach the camera at the moment it gives up on it, not at a render.
   */
  recoveryRef?: MutableRefObject<(() => void) | null>;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether to run the still-camera experiment before handing the camera over.
 *
 * A dev-client switch, and off in every build that ships. `runCaptureProbe`
 * holds the camera for the better part of a minute and reports itself through
 * `console.warn`, which only means anything with Metro attached to read it.
 */
const RUN_CAPTURE_PROBE = false;

/**
 * The live rear camera: the AR background on a phone, doing the job the
 * recording's video does under the replay.
 *
 * No permission handling here any more. The camera is no longer just the picture
 * behind the markers — it is the input the sky mask is computed from, and
 * without a mask there is nothing to say which markers are behind a building. So
 * access is settled during boot, along with the sensors and the fix, and the
 * view is only reached once it has been granted.
 *
 * It is configured for a camera that is read from rather than photographed with:
 * no shutter animation, which otherwise flashes over the sky once a second for
 * captures the person never asked for.
 *
 * What it is not configured with is a capture size, and that is the point of
 * this file rather than an omission from it. `pictureSize` writes the
 * `AVCaptureSession` preset behind the photo output's back, which changes the
 * active format the output is still handing its own `maxPhotoDimensions`
 * against. The prop is never written here, at any value, and the session stays
 * exactly as `expo-camera` built it.
 *
 * Nothing in this file fixes the capture failure that kept an iPhone 15 from
 * starting, and three earlier versions of it that claimed to were wrong. That
 * fault is automatic deferred photo delivery in `expo-camera`'s own Swift, and
 * it is fixed in `patches/expo-camera+57.0.4.patch` — in the binary rather than
 * the bundle. The note above `DEVICE_CAMERA_CAPTURE_QUALITY` in `constants.ts`
 * has the whole of it.
 *
 * That leaves one camera, mounted once and left alone, which is also the
 * cheapest thing to be sure of. The one time it is rebuilt is recovery, after
 * the segmentation loop has given up on it entirely; see `rebuild`.
 *
 * `memo` because the view above it re-renders on every animation frame, and this
 * is a native camera preview: re-rendered at 60 Hz, every one of those frames
 * diffs the props of the one view on screen that must not be disturbed.
 */
export const CameraBackground: React.FC<Props> = React.memo(
  ({ cameraRef, onReadyChange, recoveryRef }) => {
    /** Bumped to throw the camera away and build another. */
    const [generation, setGeneration] = useState(0);
    /**
     * Whether the camera is on screen. False across a rebuild, which is the
     * whole of how the old session is made to stop before the new one starts.
     */
    const [shown, setShown] = useState(false);

    /** Whoever is waiting for the preview to report itself running. */
    const startWaiter = useRef<{
      resolve: (started: boolean) => void;
      abandon: ReturnType<typeof setTimeout>;
    } | null>(null);

    /**
     * Resolves when the preview reports itself running, or false when it has had
     * long enough to.
     *
     * `onCameraReady` is the only word there is that a session started, and it
     * never comes at all when the session failed to configure — a camera that
     * cannot be started would otherwise be a view showing black and a
     * segmentation loop with nothing to complain about. Giving up on it hands
     * the loop a camera to fail against instead, which is a failure someone
     * eventually sees.
     */
    const awaitPreviewStart = useCallback(
      () =>
        new Promise<boolean>((resolve) => {
          const abandon = setTimeout(() => {
            startWaiter.current = null;
            resolve(false);
          }, DEVICE_CAMERA_PREVIEW_START_TIMEOUT_MS);
          startWaiter.current = { resolve, abandon };
        }),
      []
    );

    const onCameraReady = useCallback(() => {
      const waiter = startWaiter.current;
      if (!waiter) return;
      startWaiter.current = null;
      clearTimeout(waiter.abandon);
      waiter.resolve(true);
    }, []);

    // A preview that has gone away is not ready again until it says so itself.
    useEffect(() => () => onReadyChange(false), [onReadyChange]);

    /** Whether a rebuild is still in flight, from asked for to captured from. */
    const rebuilding = useRef(false);

    useEffect(() => {
      let cancelled = false;
      onReadyChange(false);

      void (async () => {
        if (generation > 0) {
          // Off the screen, and then a gap. Each `CameraView` tears its session
          // down on a queue of its own, so a replacement mounted straight away
          // is a second `AVCaptureSession` asking for a camera the first has not
          // finished giving up. See `DEVICE_CAMERA_REBUILD_GAP_MS`.
          setShown(false);
          await wait(DEVICE_CAMERA_REBUILD_GAP_MS);
          if (cancelled) return;
        }

        setShown(true);
        const started = await awaitPreviewStart();
        if (cancelled) return;
        if (!started) {
          console.warn("The camera preview did not start; handing it to the mask loop anyway");
        }

        // Off in anything that ships. See `runCaptureProbe`: it takes over the
        // camera for half a minute, and it is only useful with a Metro log to
        // read it in.
        if (RUN_CAPTURE_PROBE && cameraRef.current) {
          await runCaptureProbe(cameraRef.current);
          if (cancelled) return;
        }

        rebuilding.current = false;
        onReadyChange(true);
      })();

      return () => {
        cancelled = true;
        // Nobody is left to hear it, and an abandoned wait would otherwise hold
        // its timer and its resolver for the whole six seconds.
        const waiter = startWaiter.current;
        if (waiter) {
          startWaiter.current = null;
          clearTimeout(waiter.abandon);
          waiter.resolve(false);
        }
      };
    }, [generation, awaitPreviewStart, cameraRef, onReadyChange]);

    /**
     * Throws the camera away and builds another.
     *
     * A last resort, and deliberately the only one: a capture session is the
     * smallest thing here that can be replaced whole, and replacing it is the
     * only answer to a photo output that has stopped delivering stills. It is
     * also not free — two sessions contending for one camera is its own failure —
     * so it happens only after the segmentation loop has given up, never as a
     * routine retry. Ignored while one is already in flight, so a loop that gives
     * up twice does not restart the rebuild it is waiting on.
     */
    const rebuild = useCallback(() => {
      if (rebuilding.current) return;
      rebuilding.current = true;
      setGeneration((count) => count + 1);
    }, []);

    useEffect(() => {
      if (!recoveryRef) return;
      recoveryRef.current = rebuild;
      return () => {
        recoveryRef.current = null;
      };
    }, [recoveryRef, rebuild]);

    if (!shown) return null;

    return (
      <CameraView
        // A rebuild has to be a new native view rather than a re-propped one:
        // the state being escaped lives in the session, not in the props.
        key={generation}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={false}
        onCameraReady={onCameraReady}
        onMountError={({ message }) => console.warn(`The camera could not be started: ${message}`)}
      />
    );
  }
);
CameraBackground.displayName = "CameraBackground";

export default CameraBackground;
