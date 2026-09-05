import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { decode as decodeJpeg } from "jpeg-js";
import { DEVICE_CAMERA_CAPTURE_QUALITY } from "../constants";
import { FramePixels, ShutterCallback, SkyFrameGrabber } from "./skySegmenter";
import { Size } from "./skySegmentation";

/**
 * The phone's half of "give me this frame at this size".
 *
 * Everything downstream of it is the shared pipeline, so the replay harness runs
 * the same model on the same normalized input as the phone. Only the way to a
 * block of pixels differs, and there is no way around that: a browser has a
 * canvas, and iOS has the camera API.
 *
 * The steps are all library work rather than pixel handling of our own —
 * `expo-camera` captures, `expo-image-manipulator` resamples natively, `jpeg-js`
 * decodes — because the alternative, a hand-written resampler over a raw camera
 * buffer, is exactly the sort of thing that quietly gets a colour order or a row
 * stride wrong and produces a plausible-looking mask of nothing.
 *
 * The cost is a capture and a JPEG round trip per pass rather than a direct read
 * of the preview buffer. At one pass a second that is affordable; it is not a
 * design that would survive being asked for thirty. The frame-processor route
 * that would avoid it (`react-native-vision-camera` with
 * `vision-camera-resize-plugin`) needs a version pair that does not currently
 * exist for this React Native — the resize plugin is still on Vision Camera 4
 * and worklets-core, while only Vision Camera 5 builds here.
 *
 * The capture is a full-resolution still and there is no bounding it: the one
 * prop that would is the `AVCaptureSession` preset in disguise, and writing it
 * stops the photo output capturing at all on an iPhone 15. The note above
 * `DEVICE_CAMERA_CAPTURE_QUALITY` in `constants.ts` has the whole of that, and
 * why the cost is transient rather than the sort that ends a session. What can
 * be trimmed is trimmed here: the still is asked for at a low JPEG quality, and
 * every native image is released the moment it has been read.
 *
 * Readiness is the other thing load-bearing on a real phone, and it is settled
 * where the camera view is rather than here: `takePictureAsync` is only legal
 * once the preview is running, and before that the native side throws. The
 * camera accessor passed in returns `null` until then, which the segmentation
 * loop reads as "no frame yet" rather than as a failed pass.
 */

/** JPEG quality for the hand-off between the resizer and the decoder. */
const HANDOFF_QUALITY = 0.95;

/**
 * A phone frame source.
 *
 * `frame` is the shape the markers are projected against — `DEVICE_CAMERA`, not
 * whatever the still camera happens to return — because the mask and the markers
 * have to describe the same box. The capture is resampled straight to the model
 * input derived from it.
 */
export function cameraFrameGrabber(
  camera: () => CameraView | null,
  frame: Size
): SkyFrameGrabber {
  return {
    size(): Size | null {
      return camera() ? frame : null;
    },

    async grab(size: Size, onShutter: ShutterCallback): Promise<FramePixels> {
      const view = camera();
      if (!view) throw new Error("The camera is not open");

      // A picture reference rather than a file: it stays a native image all the
      // way into the resizer, so the capture is never encoded, written out and
      // read back just to be thrown away.
      const picture = await view.takePictureAsync({
        pictureRef: true,
        shutterSound: false,
        // The native side encodes the still to JPEG and decodes it again to
        // make the ref. At the default quality that is a full-quality encode of
        // a full-resolution bitmap for pixels about to be resampled to 320x448.
        quality: DEVICE_CAMERA_CAPTURE_QUALITY,
        // Leave orientation processing on: the mask has to line up with the
        // preview the markers are drawn over, and skipping it returns the
        // sensor's own rotation instead.
        skipProcessing: false
      });
      if (!picture) throw new Error("The camera returned no picture");
      // The shutter, as near as this side of the API can see it: the still is
      // taken, and everything below — resize, encode, decode, and then the model
      // — is work on a picture of a moment that has passed. The attitude the
      // mask is filed under is read here rather than before the capture, which
      // on a phone being turned is the difference between a mask aimed where it
      // was taken and one aimed several degrees off it.
      onShutter();

      // Every native image on this path is released by hand. They are shared
      // refs, so left alone they hold their bitmaps until the JavaScript garbage
      // collector happens to notice a small object — which at one capture a
      // second is far too late, and is the difference between a session that
      // runs and one the operating system terminates within a minute.
      try {
        const resizer = ImageManipulator.manipulate(picture).resize({
          width: size.width,
          height: size.height
        });
        const resized = await resizer.renderAsync();
        try {
          const saved = await resized.saveAsync({
            format: SaveFormat.JPEG,
            compress: HANDOFF_QUALITY
          });

          const file = new File(saved.uri);
          try {
            const decoded = decodeJpeg(new Uint8Array(await file.arrayBuffer()), {
              useTArray: true
            });
            if (decoded.width !== size.width || decoded.height !== size.height) {
              throw new Error(
                `The camera frame came back ${decoded.width}x${decoded.height}, not ${size.width}x${size.height}`
              );
            }
            // `jpeg-js` returns RGBA; the shared normalization ignores the alpha.
            return { pixels: decoded.data, channels: 4 };
          } finally {
            // The resizer writes into the cache directory. One of these a second
            // adds up, and nothing reads it after this point.
            try {
              if (file.exists) file.delete();
            } catch {
              // A file we could not delete is the operating system's problem, not
              // a reason to fail the mask that was computed from it.
            }
          }
        } finally {
          resized.release();
          resizer.release();
        }
      } finally {
        picture.release();
      }
    }
  };
}
