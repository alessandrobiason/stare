import { SkyMask } from "./skyMask";
import { createSkyModel } from "./skyModel";
import { SkyModel } from "./skyModelTypes";
import { maskGridFor, modelInputSize, poolSkyLogits, Size, toModelTensor } from "./skySegmentation";

/**
 * Sky segmentation, on whichever platform is running.
 *
 * The pipeline is the same everywhere — resample the frame to the network's
 * input, normalize, one forward pass, pool the logits into a mask grid — and all
 * of it lives in `skySegmentation.ts`. Only two things differ, and both are
 * behind an interface here: where the pixels come from (the camera on a phone,
 * a `<video>` and a canvas under the replay harness) and which ONNX runtime
 * executes the model (`skyModel.ts` against ONNX Runtime React Native, the
 * harness's `skyModelWeb.ts` against ONNX Runtime Web).
 */

/** Interleaved 8-bit pixels, at exactly the size that was asked for. */
export type FramePixels = {
  pixels: Uint8Array | Uint8ClampedArray;
  channels: 3 | 4;
};

/**
 * Called as close to the instant the pixels were taken as the platform can
 * report, and before any of the work that follows it.
 *
 * Which instant that is matters, because the mask is a map of the sky rather
 * than of the screen (`AnchoredSkyMask`) and the aim it is filed under has to be
 * where the camera was looking when the shutter fired. Everything after the
 * shutter — a resize, a JPEG round trip, the better part of a second of
 * inference — happens on a frame the camera has already left behind, and on a
 * phone being panned the capture alone is degrees of sky.
 *
 * A grabber calls it on the near side of its capture rather than the far side.
 * The two are not the same instant and not close together: on the phone the
 * still is captured, encoded and decoded before `takePictureAsync` resolves, so
 * the reply is a whole capture later than the photons, while the request is
 * ahead of them only by the camera's own latency on a preview that is already
 * running. Late by a capture is what a trailing mask looks like; early by the
 * shutter delay is not visible.
 */
export type ShutterCallback = () => void;

/** What the segmenter needs from whatever is showing the picture. */
export type SkyFrameGrabber = {
  /**
   * The frame's own pixel size, or `null` while there is nothing to read — a
   * video with no data yet, a camera that has not opened. The aspect ratio of
   * this is what the model input and the mask grid are shaped from.
   */
  size(): Size | null;
  /** The frame resampled to exactly `size`, taken at `onShutter`. */
  grab(size: Size, onShutter: ShutterCallback): Promise<FramePixels>;
};

let modelPromise: Promise<SkyModel> | null = null;

function loadModel(): Promise<SkyModel> {
  if (!modelPromise) {
    modelPromise = createSkyModel().catch((error: unknown) => {
      // Allow a later call to retry rather than pinning the failure forever.
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

/**
 * Downloads the model and starts the runtime, without segmenting anything.
 *
 * Called during boot, and required to succeed: without a mask nothing can be
 * said about what is behind a building, and the view would be claiming a clear
 * line of sight it has not checked. Boot stops on the failure instead.
 */
export async function preloadSkySegmenter(): Promise<void> {
  await loadModel();
}

/**
 * A completed pass: what the model made of the frame, and the frame itself.
 *
 * The pixels are handed back rather than dropped because there is a second
 * question worth asking of the same picture — whether the sun or the moon is in
 * it, which is what tells the app whether its compass is lying
 * (`src/vision/brightBodies.ts`). Asking it here costs nothing: the capture,
 * the resample and the JPEG round trip have all already been paid for, and on a
 * phone they are the entire cost. Taking a second frame for it would have
 * doubled the most expensive thing this app does, to look at the same sky.
 */
export type SegmentedFrame = {
  mask: SkyMask;
  /** Exactly the pixels the model was given. */
  pixels: FramePixels;
  /** And the size they are at, which is the model's input rather than the frame's. */
  size: Size;
};

/**
 * Segments the sky in the frame `grabber` is showing.
 *
 * `onShutter` fires when that frame is taken rather than when the mask comes
 * back, which is the only moment the attitude behind it can be read at: see
 * `ShutterCallback`.
 */
export async function segmentSky(
  grabber: SkyFrameGrabber,
  onShutter: ShutterCallback = () => undefined
): Promise<SegmentedFrame> {
  const frame = grabber.size();
  if (!frame) throw new Error("Sky segmentation has no frame to read");

  const model = await loadModel();
  const input = modelInputSize(frame);
  const captured = await grabber.grab(input, onShutter);
  const logits = await model.run(toModelTensor(captured.pixels, input, captured.channels), input);

  return {
    mask: poolSkyLogits(logits, input, maskGridFor(frame)),
    pixels: captured,
    size: input
  };
}
