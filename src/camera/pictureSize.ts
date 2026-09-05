/**
 * Picking a capture size the phone will actually capture at.
 *
 * There is no way to ask. `getAvailablePictureSizesAsync` returns the same
 * fixed list of `AVCaptureSession` presets on every iPhone, and a preset the
 * session accepts is not the same thing as one the photo output will deliver a
 * still from. Which phones that bites is a fact about the camera hardware, and
 * the only place it is written down is the hardware.
 *
 * So the size is settled by trying: build a session at a candidate, take one
 * throwaway picture, and keep the first candidate that produces one. The last
 * candidate is the camera's own default, which is the configuration
 * `expo-camera` sets up for itself, so the walk ends somewhere that works.
 *
 * Build, not "apply". Each rung gets a session of its own, because on this API
 * a refused capture size is not a setting to back out of — it leaves the photo
 * output in a state later captures fail from, whatever the preset is set back
 * to afterwards. Stepping down the ladder by re-propping one long-lived camera
 * therefore reaches the safe rung with an output that can no longer capture at
 * any size, which is a camera that never recovers rather than one that falls
 * back. See `PictureSizeProbe.mount` and `DEVICE_CAMERA_PICTURE_SIZES`.
 */

/**
 * A `pictureSize` to try, or `undefined` for "leave the camera at its own
 * default", which is what `expo-camera` starts every session in.
 */
export type PictureSizeCandidate = string | undefined;

/** The camera, as the negotiation needs to drive it. */
export type PictureSizeProbe = {
  /**
   * Builds a fresh capture session configured for `size` and resolves once it
   * is running and settled.
   *
   * A whole session rather than a property write: see the note above on why a
   * candidate cannot be un-applied. Resolving early is the one thing this must
   * not do — a capture attempted mid-configuration fails for reasons that say
   * nothing about the size being judged. See
   * `DEVICE_CAMERA_PICTURE_SIZE_SETTLE_MS`.
   */
  mount(size: PictureSizeCandidate): Promise<void>;
  /**
   * Proves the camera by capturing from it and throwing the result away,
   * rejecting if the camera refuses.
   */
  capture(): Promise<void>;
};

export type NegotiatedPictureSize = {
  /** The size the camera has been left on. */
  size: PictureSizeCandidate;
  /**
   * Whether a capture at `size` actually succeeded.
   *
   * False means every candidate was refused, including the last: the camera is
   * left on it anyway, so that the segmentation loop's own failure reporting is
   * what the person sees rather than a view that waits forever for a frame.
   */
  proven: boolean;
  /** Candidates passed over, in the order they were tried. */
  rejected: { size: PictureSizeCandidate; cause: unknown }[];
};

/**
 * Walks `candidates` until one of them captures.
 *
 * @param candidates cheapest first, ending with one that is expected to work.
 */
export async function negotiatePictureSize(
  candidates: readonly PictureSizeCandidate[],
  probe: PictureSizeProbe
): Promise<NegotiatedPictureSize> {
  if (candidates.length === 0) throw new Error("No capture size to negotiate");

  const rejected: { size: PictureSizeCandidate; cause: unknown }[] = [];

  for (const size of candidates) {
    await probe.mount(size);
    try {
      await probe.capture();
      return { size, proven: true, rejected };
    } catch (cause) {
      rejected.push({ size, cause });
    }
  }

  // Every rung refused. The camera is on the last one — a session built for the
  // camera's own default, which is as good a state as this can leave it in —
  // and the loop above reports what it runs into from there.
  return { size: candidates[candidates.length - 1], proven: false, rejected };
}

/** How a candidate reads in a log line. */
export function describePictureSize(size: PictureSizeCandidate): string {
  return size ?? "the camera's default";
}
