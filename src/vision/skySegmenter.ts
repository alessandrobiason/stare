import { startSlicing } from "../timeSlice";
import { SkyMask } from "./skyMask";
import { createSkyModel } from "./skyModel";
import { resetSkyModelLoad, SkyModelLoad, subscribeSkyModelLoad } from "./skyModelProgress";
import { SkyModel, SkyModelDiagnostics } from "./skyModelTypes";
import {
  maskGridFor,
  modelInputSize,
  Size,
  startSkyPooling,
  toModelTensorSliced
} from "./skySegmentation";

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
  /**
   * How frames are being read, for the Console. Optional: only a source with a
   * choice to report — the phone's, between video frames and stills — has one.
   */
  reading?(): FrameReading;
  /** Switches that choice from the Console. See `FrameReading.preferVideo`. */
  setPreferVideo?(on: boolean): void;
};

/** What a frame source can say about how it is reading frames. See `cameraFrameGrabber`. */
export type FrameReading = {
  /** Where the last frame came from: "video frame" or "still photo". `null` before the first. */
  source: string | null;
  /** How long the last frame took, from asking for it to having its pixels. */
  lastGrabMs: number | null;
  /** Whether video frames are wanted — the Console's switch. */
  preferVideo: boolean;
  /** Why stills are being read although video frames are wanted, when they are. */
  fallbackReason: string | null;
  /** How the video frames compared with a still, once they have been. See `frameAgreement`. */
  agreement: string | null;
};

let modelPromise: Promise<SkyModel> | null = null;
/** The loaded model's own report of itself, once there is one. See `skyModelDiagnostics`. */
let diagnostics: SkyModelDiagnostics | null = null;

function loadModel(): Promise<SkyModel> {
  if (!modelPromise) {
    modelPromise = createSkyModel()
      .then((model) => {
        diagnostics = model.diagnostics;
        return model;
      })
      .catch((error: unknown) => {
        // Allow a later call to retry rather than pinning the failure forever.
        modelPromise = null;
        // And start the next attempt's bar from the bottom rather than from
        // wherever this one gave way. See `resetSkyModelLoad`.
        resetSkyModelLoad();
        throw error;
      });
  }
  return modelPromise;
}

/**
 * How the sky model's session came up, for the Console's "Sky model" page.
 * `null` before the first load has finished — boot waits on that first, so in
 * practice this is `null` only while the boot screen is still up.
 */
export function skyModelDiagnostics(): SkyModelDiagnostics | null {
  return diagnostics;
}

/**
 * Downloads the model and starts the runtime, without segmenting anything.
 *
 * Called during boot, and required to succeed: without a mask nothing can be
 * said about what is behind a building, and the view would be claiming a clear
 * line of sight it has not checked. Boot stops on the failure instead.
 *
 * `onLoad` follows how far that has got, for the boot screen's bar. It is fed
 * from the published state rather than from this call, because by the time boot
 * makes it the download has usually been running for the length of the intro
 * (`prewarmBoot`) — so what a caller needs is to be told where the load already
 * is, which `subscribeSkyModelLoad` does on subscribing. The subscription is
 * dropped when the load settles either way; it is a boot screen's business, and
 * the boot screen is gone by then.
 */
export async function preloadSkySegmenter(
  onLoad?: (load: SkyModelLoad) => void
): Promise<void> {
  const unsubscribe = onLoad ? subscribeSkyModelLoad(onLoad) : null;
  try {
    await loadModel();
  } finally {
    unsubscribe?.();
  }
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
  /** Where the pass spent its time, for the Console. See `PassTimings`. */
  timings: PassTimings;
};

/**
 * One pass, stage by stage, in milliseconds of wall-clock time.
 *
 * Wall clock rather than work, because the question these answer is where a
 * pass *waits*: the stages that hand the thread back in slices take longer than
 * their arithmetic, and the native stages are mostly waiting on another
 * processor. A pass whose `inference` is in the hundreds is not on the Neural
 * Engine; one whose `frame` is in the hundreds is taking stills.
 */
export type PassTimings = {
  /** Asking for a frame to having its pixels. */
  frameMs: number;
  /** Normalising those pixels into the model's input. */
  tensorMs: number;
  /** The model itself. */
  inferenceMs: number;
  /** Pooling its output into the mask grid. */
  poolingMs: number;
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
  const frameStartedAt = performance.now();
  const captured = await grabber.grab(input, onShutter);
  const frameMs = performance.now() - frameStartedAt;
  // The capture comes back decoded, and on the phone the decode has just held
  // the thread (`cameraFrameGrabber`). A frame goes through before the tensor
  // is built rather than the two running as one stretch, and the tensor itself
  // is built a slice at a time.
  const tensorSlices = startSlicing();
  await tensorSlices.handOver();
  const tensorStartedAt = performance.now();
  const tensor = await toModelTensorSliced(captured.pixels, input, captured.channels, tensorSlices);
  const inferenceStartedAt = performance.now();
  const logits = await model.run(tensor, input);
  const poolingStartedAt = performance.now();

  // The model runs off the JS thread; pooling its output does not, and in one go
  // it is the longest single stretch a pass holds that thread for — frames of a
  // frozen sky on the phone, every time a mask lands, whether or not the mask is
  // hiding anything. So the thread is handed back between rows. The mask is the
  // one `poolSkyLogits` returns, arriving a few frames later.
  const pooling = startSkyPooling(logits, input, maskGridFor(frame));
  const slices = startSlicing();
  for (let row = 0; row < pooling.rows; row += 1) {
    pooling.poolRow(row);
    if (slices.spent()) await slices.handOver();
  }

  const mask = pooling.finish();
  return {
    mask,
    pixels: captured,
    size: input,
    timings: {
      frameMs,
      tensorMs: inferenceStartedAt - tensorStartedAt,
      inferenceMs: poolingStartedAt - inferenceStartedAt,
      poolingMs: performance.now() - poolingStartedAt
    }
  };
}
