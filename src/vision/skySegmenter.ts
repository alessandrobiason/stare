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

/** What the segmenter needs from whatever is showing the picture. */
export type SkyFrameGrabber = {
  /**
   * The frame's own pixel size, or `null` while there is nothing to read — a
   * video with no data yet, a camera that has not opened. The aspect ratio of
   * this is what the model input and the mask grid are shaped from.
   */
  size(): Size | null;
  /** The frame resampled to exactly `size`. */
  grab(size: Size): Promise<FramePixels>;
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

/** Segments the sky in the frame `grabber` is showing. */
export async function segmentSky(grabber: SkyFrameGrabber): Promise<SkyMask> {
  const frame = grabber.size();
  if (!frame) throw new Error("Sky segmentation has no frame to read");

  const model = await loadModel();
  const input = modelInputSize(frame);
  const { pixels, channels } = await grabber.grab(input);
  const logits = await model.run(toModelTensor(pixels, input, channels), input);

  return poolSkyLogits(logits, input, maskGridFor(frame));
}
