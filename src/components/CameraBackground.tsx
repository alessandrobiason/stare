import { CameraView } from "expo-camera";
import React, { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import {
  describePictureSize,
  negotiatePictureSize,
  PictureSizeCandidate
} from "../camera/pictureSize";
import {
  DEVICE_CAMERA_PICTURE_SIZES,
  DEVICE_CAMERA_PICTURE_SIZE_SETTLE_MS,
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
   * It also stays illegal after that on a capture size the phone will not
   * deliver a still at, which is why readiness waits on the negotiation below
   * rather than on `onCameraReady` alone. The segmenter has to know the
   * difference between a frame it cannot have yet and a pass that failed,
   * because it treats a run of the latter as fatal.
   */
  onReadyChange: (ready: boolean) => void;
  /**
   * Filled, while this is mounted, with "the camera has stopped capturing; try
   * to get it back".
   *
   * A ref rather than a prop the other way round because the caller is the
   * segmentation loop, several components up and running on its own timer: it
   * needs to reach the camera at the moment it gives up on it, not at a render.
   * See `rebuild` for what recovery actually is.
   */
  recoveryRef?: MutableRefObject<(() => void) | null>;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The rung every phone can be relied on to capture at: see the ladder. */
const SAFE_PICTURE_SIZE =
  DEVICE_CAMERA_PICTURE_SIZES[DEVICE_CAMERA_PICTURE_SIZES.length - 1];

/** One built capture session, and the size it was built for. */
type Session = { id: number; size: PictureSizeCandidate };

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
 * a capture bounded to something the mask actually needs, and no shutter
 * animation, which otherwise flashes over the sky once a second for captures the
 * person never asked for.
 *
 * How far the capture can be bounded is a fact about the phone, not about the
 * app, and nothing reports it — so it is measured here, once, before the
 * segmentation loop is told the camera is usable. See `negotiatePictureSize`
 * and `DEVICE_CAMERA_PICTURE_SIZES`.
 *
 * The camera is torn down and rebuilt between rungs rather than re-propped,
 * which is the whole of why this is written as a session at a time. A capture
 * size the phone refuses does not stay contained: it leaves the photo output
 * unable to capture at any size, so a camera that has been asked for one is only
 * good for being thrown away. Stepping down the ladder in place reaches the safe
 * rung with a dead camera and reports it as a phone that cannot segment the sky,
 * which is what an iPhone 15 did on every launch.
 *
 * `memo` because the view above it re-renders on every animation frame, and this
 * is a native camera preview: re-rendered at 60 Hz, every one of those frames
 * diffs the props of the one view on screen that must not be disturbed.
 */
export const CameraBackground: React.FC<Props> = React.memo(
  ({ cameraRef, onReadyChange, recoveryRef }) => {
    /**
     * The session on screen, or `null` before the first one is asked for.
     *
     * Driven by the negotiation below rather than by a render: the ladder walk
     * spans several sessions, and each one has to be built, waited on and — when
     * its size is refused — thrown away before the next is asked for.
     */
    const [session, setSession] = useState<Session | null>(null);
    /** Bumped to start the walk over on a camera that has stopped capturing. */
    const [recovery, setRecovery] = useState(0);

    const nextSessionId = useRef(0);
    /** Whether there is a camera on screen to be taken off it. */
    const mounted = useRef(false);
    /**
     * Whether a rebuild is still in flight — from the moment one is asked for
     * to the moment a session has proven itself, not just to the next render.
     * A caller that gives up again while the replacement camera is still being
     * built would otherwise restart the very thing it is waiting on.
     */
    const rebuilding = useRef(false);
    /** Whoever is waiting for the session it names to report itself running. */
    const pending = useRef<{ id: number; started: () => void } | null>(null);

    /**
     * Builds a session for `size` and resolves once its preview is running, or
     * once it has had long enough to say so.
     *
     * A preview that never starts resolves like one that did, and is left to be
     * caught by the capture that follows: a session that cannot be captured from
     * is a rung to step over whether the reason was the size or the start, and
     * the alternative is a walk that waits on `onCameraReady` forever behind a
     * view showing black.
     */
    const build = useCallback((size: PictureSizeCandidate): Promise<void> => {
      return new Promise((resolve) => {
        const id = (nextSessionId.current += 1);
        const abandon = setTimeout(() => {
          if (pending.current?.id !== id) return;
          pending.current = null;
          console.warn(`The camera preview did not start at ${describePictureSize(size)}`);
          resolve();
        }, DEVICE_CAMERA_PREVIEW_START_TIMEOUT_MS);
        pending.current = {
          id,
          started: () => {
            clearTimeout(abandon);
            resolve();
          }
        };
        mounted.current = true;
        setSession({ id, size });
      });
    }, []);

    const onCameraReady = useCallback((id: number) => {
      if (pending.current?.id !== id) return;
      const { started } = pending.current;
      pending.current = null;
      started();
    }, []);

    // A preview that has gone away is not ready again until it says so itself.
    useEffect(() => () => onReadyChange(false), [onReadyChange]);

    useEffect(() => {
      let cancelled = false;

      // On a rebuild the camera is not to be captured from until a session has
      // proven itself again, and the walk below starts by taking the old one
      // off the screen.
      onReadyChange(false);

      void (async () => {
        // The first walk tries the whole ladder. A later one is recovery from a
        // camera that stopped capturing, and the cheap rungs have already had
        // their turn — the useful thing left to try is a clean session at the
        // size every phone captures at.
        const ladder = recovery === 0 ? DEVICE_CAMERA_PICTURE_SIZES : [SAFE_PICTURE_SIZE];

        const chosen = await negotiatePictureSize(ladder, {
          mount: async (size) => {
            if (cancelled) return;
            if (mounted.current) {
              // Off the screen first: the session being replaced has to stop
              // before its successor asks the same hardware to start.
              mounted.current = false;
              setSession(null);
              await wait(DEVICE_CAMERA_REBUILD_GAP_MS);
              if (cancelled) return;
            }
            await build(size);
            await wait(DEVICE_CAMERA_PICTURE_SIZE_SETTLE_MS);
          },
          capture: async () => {
            if (cancelled) throw new Error("The camera view went away");
            const view = cameraRef.current;
            if (!view) throw new Error("The camera view went away");
            // Thrown away immediately: the only question is whether the phone
            // will produce it at all. Released by hand like every other native
            // image on this path — a shared ref left alone holds its bitmap
            // until the garbage collector notices a small wrapper.
            const picture = await view.takePictureAsync({
              pictureRef: true,
              shutterSound: false,
              skipProcessing: false
            });
            picture.release();
          }
        });
        if (cancelled) return;

        for (const { size, cause } of chosen.rejected) {
          console.warn(`The camera would not capture at ${describePictureSize(size)}`, cause);
        }
        if (!chosen.proven) {
          console.warn("No capture size worked; leaving the camera on its default and going on");
        }
        rebuilding.current = false;
        onReadyChange(true);
      })();

      return () => {
        cancelled = true;
        // Nobody is left to hear it, and a walk abandoned mid-mount would
        // otherwise hold its resolver — and the session it names — forever.
        pending.current?.started();
        pending.current = null;
      };
    }, [recovery, build, cameraRef, onReadyChange]);

    /**
     * Throws the camera away and builds a fresh one at the safe size.
     *
     * The only recovery there is. Nothing reachable from here can put a photo
     * output that has stopped capturing back in order — not the preset, not the
     * capture options — and the session it belongs to is the smallest thing that
     * can be replaced whole. Ignored while one is already in flight, so a loop
     * that gives up twice in a row does not restart the rebuild it is waiting
     * on.
     */
    const rebuild = useCallback(() => {
      if (rebuilding.current) return;
      rebuilding.current = true;
      setRecovery((count) => count + 1);
    }, []);

    useEffect(() => {
      if (!recoveryRef) return;
      recoveryRef.current = rebuild;
      return () => {
        recoveryRef.current = null;
      };
    }, [recoveryRef, rebuild]);

    // Nothing between sessions: a rung that has been refused is not a camera to
    // keep on screen, and the gap is a quarter of a second of the black the
    // preview starts as anyway.
    if (!session) return null;

    return (
      <CameraView
        // The session is the unit of configuration here, so it is also the unit
        // of identity: a new `key` is what makes React build a new native view
        // rather than re-prop the one whose photo output is already spoiled.
        key={session.id}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        pictureSize={session.size}
        animateShutter={false}
        onCameraReady={() => onCameraReady(session.id)}
      />
    );
  }
);
CameraBackground.displayName = "CameraBackground";

export default CameraBackground;
