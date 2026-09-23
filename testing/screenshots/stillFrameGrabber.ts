import { Size } from "../../src/vision/skySegmentation";
import { FramePixels, ShutterCallback, SkyFrameGrabber } from "../../src/vision/skySegmenter";

/**
 * A still photograph where the camera's frames would be, for the App Store
 * screenshots.
 *
 * The phone's grabber reads the preview, the replay's reads a `<video>`, and
 * this reads one `<img>` that never changes — so the mask the model computes is
 * the mask of the photograph the screenshot is taken over, and the marks behind
 * the building in `03-occlusion` are hidden by the app's own segmentation
 * rather than by anything drawn here.
 *
 * **The crop matters more than it looks.** The picture is laid into the camera's
 * own 3:4 box with CSS `object-fit: cover`, so what is on screen is the middle
 * of the photograph and not all of it. Reading the whole file here instead
 * would hand the model a wider picture than the one being displayed, and every
 * mask boundary — the roofline, the edge of the tower — would land in the wrong
 * place on screen. So this reproduces that crop explicitly.
 */

let scratch: CanvasRenderingContext2D | null = null;

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
 * The part of `image` that `object-fit: cover` leaves showing in a box of
 * `frame`'s shape: the largest centred rectangle of that aspect ratio.
 */
function coveredSource(
  image: HTMLImageElement,
  frame: Size
): { x: number; y: number; width: number; height: number } {
  const frameAspect = frame.width / frame.height;
  const imageAspect = image.naturalWidth / image.naturalHeight;

  if (imageAspect > frameAspect) {
    // Wider than the box: the sides are off screen.
    const width = image.naturalHeight * frameAspect;
    return { x: (image.naturalWidth - width) / 2, y: 0, width, height: image.naturalHeight };
  }

  const height = image.naturalWidth / frameAspect;
  return { x: 0, y: (image.naturalHeight - height) / 2, width: image.naturalWidth, height };
}

/**
 * `image` is read on every call rather than captured, so the grabber can be
 * built before React has attached the element.
 *
 * `frame` is the box the picture is laid into — the phone camera's pixel size —
 * rather than the photograph's own, because that is the frame the projection
 * places marks in and the shape the mask has to be in to line up with them.
 */
export function stillFrameGrabber(
  image: () => HTMLImageElement | null,
  frame: Size
): SkyFrameGrabber {
  return {
    size(): Size | null {
      const element = image();
      // `complete` is false until the file has decoded, and a mask computed
      // from a blank element would be a sky with nothing in the way of it.
      if (!element?.complete || !element.naturalWidth) return null;
      return frame;
    },

    grab(size: Size, onShutter: ShutterCallback): Promise<FramePixels> {
      const element = image();
      if (!element?.complete) throw new Error("The still has not decoded yet");
      const context = scratchContext(size);
      // Nothing to wait for: the picture is the same picture it was.
      onShutter();
      const source = coveredSource(element, frame);
      context.drawImage(
        element,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        size.width,
        size.height
      );
      const { data } = context.getImageData(0, 0, size.width, size.height);
      return Promise.resolve({ pixels: data, channels: 4 });
    }
  };
}
