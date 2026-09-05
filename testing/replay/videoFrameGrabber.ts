import { Size } from "../../src/vision/skySegmentation";
import { FramePixels, SkyFrameGrabber } from "../../src/vision/skySegmenter";

/**
 * The browser's half of "give me this frame at this size": a `<video>` drawn
 * into a canvas, which is the resampler every browser already ships.
 *
 * Everything downstream of it — normalization, the model, the pooling into a
 * mask — is the app's own code in `src/vision/skySegmentation.ts`, so this and
 * `src/vision/cameraFrameGrabber.ts` are the whole of the difference between
 * the harness and the phone.
 */

let scratch: CanvasRenderingContext2D | null = null;

/**
 * The canvas frames are drawn into, kept between runs and resized in place.
 *
 * Always fully repainted, so there is nothing to carry over between frames — and
 * allocating a canvas per run only asks the browser to find and free the backing
 * surface again every time.
 */
function scratchContext(size: Size): CanvasRenderingContext2D {
  if (!scratch) {
    const canvas = document.createElement("canvas");
    scratch = canvas.getContext("2d", { willReadFrequently: true });
    if (!scratch) throw new Error("Canvas 2D is unavailable for sky segmentation");
  }

  const canvas = scratch.canvas;
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  return scratch;
}

/**
 * `video` is read on every call rather than captured, so the grabber can be
 * built before React has attached the element and stays valid if it is replaced.
 */
export function videoFrameGrabber(video: () => HTMLVideoElement | null): SkyFrameGrabber {
  return {
    size(): Size | null {
      const element = video();
      if (!element) return null;
      // Before this the element has no picture to read, and `videoWidth` is 0.
      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      if (!element.videoWidth || !element.videoHeight) return null;
      return { width: element.videoWidth, height: element.videoHeight };
    },

    grab(size: Size): Promise<FramePixels> {
      const element = video();
      if (!element) throw new Error("The replay video is not ready");
      const context = scratchContext(size);
      // Straight to the target size: `drawImage` is the browser's own scaler,
      // and the frame keeps its shape because `size` was derived from it.
      context.drawImage(element, 0, 0, size.width, size.height);
      const { data } = context.getImageData(0, 0, size.width, size.height);
      return Promise.resolve({ pixels: data, channels: 4 });
    }
  };
}
