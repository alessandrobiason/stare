import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { decode as decodeJpeg } from "jpeg-js";
import { AlphaType, ColorType, Skia } from "../components/skia";
import { DEVICE_CAMERA_CAPTURE_QUALITY } from "../constants";
import { frameAgreement } from "./frameAgreement";
import { FramePixels, FrameReading, ShutterCallback, SkyFrameGrabber } from "./skySegmenter";
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
 * `expo-camera` captures, `expo-image-manipulator` resamples natively, Skia
 * decodes (`decodeFrame`) — because the alternative, a hand-written resampler over a raw camera
 * buffer, is exactly the sort of thing that quietly gets a colour order or a row
 * stride wrong and produces a plausible-looking mask of nothing.
 *
 * **Video frames first, stills behind them.** A still was the only way in for a
 * while, and it cost far more than its JPEG round trip: every capture went
 * through the full photo pipeline — multi-frame fusion on the ISP, the GPU and
 * the Neural Engine — and then a full-resolution HEIC decode, crop, JPEG encode
 * and decode in `expo-camera`, to be resampled here to 320x448. Once a second,
 * and every 300 ms while the phone was being turned, that hitched the camera
 * preview itself and took the Neural Engine from the sky model. The
 * frame-processor route that would avoid it (`react-native-vision-camera` with
 * `vision-camera-resize-plugin`) needs a version pair that does not exist for
 * this React Native, so the patch to `expo-camera` adds the one thing needed
 * instead: a copy of the frame the preview is already showing, cropped, scaled
 * and turned natively (`CameraFrameTap`, `grabFrameAsync`).
 *
 * The native half of that cannot be run anywhere but on a phone, so it is not
 * trusted blind. The first frames are compared with a still of the same moment
 * (`frameAgreement`), a frame the wrong way round sends the grabber back to
 * stills, and so does a run of frames that fail or a build with no tap at all.
 * The Console says which of the two is being read and why, and has a switch
 * between them.
 *
 * The still path, where it is taken, is as it was.
 *
 * A still is full-resolution and there is no bounding it: the one
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

/** A decoded hand-off: RGBA, row-major, at whatever size the JPEG was. */
type DecodedFrame = { width: number; height: number; data: Uint8Array };

/** Whether the native decoder has already failed once and said so. */
let nativeDecodeWarned = false;

/**
 * The hand-off JPEG as RGBA, decoded by Skia's native codec.
 *
 * It used to be `jpeg-js`, which is JavaScript, and on the phone that means
 * interpreted JavaScript on the thread the markers are drawn from: a hundred
 * milliseconds and more of a frozen sky on every pass, whether or not the mask
 * was hiding anything. Skia is already in the app to draw the markers, and its
 * codec is libjpeg-turbo, which does the same decode in a few milliseconds.
 *
 * The two decoders round a handful of pixels differently — well under a level on
 * average, from chroma upsampling and the IDCT — which moves the mask by a small
 * fraction of what the JPEG hand-off itself already costs it. Read without a
 * colour space, so Skia hands back the stored values rather than converting them,
 * which is what `jpeg-js` did.
 *
 * `jpeg-js` stays as the fallback: a codec that declines the file is a slower
 * pass, not a camera that cannot be segmented.
 */
function decodeFrame(bytes: Uint8Array): DecodedFrame {
  try {
    const decoded = decodeNatively(bytes);
    if (decoded) return decoded;
    throw new Error("Skia could not decode the camera frame");
  } catch (cause) {
    if (!nativeDecodeWarned) {
      nativeDecodeWarned = true;
      console.warn("Decoding camera frames in JavaScript instead", cause);
    }
    return decodeJpeg(bytes, { useTArray: true });
  }
}

function decodeNatively(bytes: Uint8Array): DecodedFrame | null {
  // Both are native objects, released by hand for the reason every native image
  // on this path is: see the note in `grab`.
  const encoded = Skia.Data.fromBytes(bytes);
  try {
    const image = Skia.Image.MakeImageFromEncoded(encoded);
    if (!image) return null;
    try {
      const width = image.width();
      const height = image.height();
      const data = image.readPixels(0, 0, {
        width,
        height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul
      });
      if (!data || data.length !== width * height * 4) return null;
      return { width, height, data: data as Uint8Array };
    } finally {
      image.dispose();
    }
  } finally {
    encoded.dispose();
  }
}

/**
 * How many video frames may fail in a row before the grabber stops asking for
 * them and reads stills instead, until the Console's switch asks it to try again.
 *
 * More than one, because a single frame can lose to a session reconfiguring or
 * an interruption, which a still would lose to as well. A run of them is the
 * frame tap not working on this phone, and stills are the path that does.
 */
const VIDEO_FAILURES_BEFORE_STILLS = 3;

/**
 * How long stills are read after a run of failed video frames before video
 * frames are tried again.
 *
 * Not for good. The run that first sent a phone back to stills was three frames
 * timing out while the camera was being restarted after the phone was unlocked —
 * nothing wrong with the tap, and nothing that lasts — and a fallback with no way
 * back left that session on stills, and its stutter, until someone found the
 * switch. Half a minute of stills is a price worth paying to find out again.
 * A frame that came back the wrong way round is different, and stays a fallback:
 * see `checkedAgainstStill`.
 */
const VIDEO_RETRY_AFTER_MS = 30_000;

/**
 * How the native tap says the capture session is stopped or interrupted: the
 * phone locked, the app in the background, another app on the camera. Matched
 * on the class name, which is in the message the error reaches JavaScript with.
 */
const SESSION_NOT_RUNNING = "CameraFrameTapNotRunningException";

/**
 * How many times the video frames are compared with a still before giving up on
 * getting a decisive answer. Each check costs one still — the very thing the
 * video frames are there to avoid — so the count is small.
 */
const AGREEMENT_ATTEMPTS = 3;

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
  let preferVideo = true;
  let videoFailures = 0;
  let fallbackReason: string | null = null;
  /** When video frames are tried again, if the fallback is one that ends. */
  let retryVideoAt: number | null = null;
  let source: string | null = null;
  let lastGrabMs: number | null = null;
  let agreement: string | null = null;
  /** Whether the video frames still need comparing with a still. */
  let agreementAttempts = 0;
  let agreementSettled = false;

  /**
   * A frame from the video stream the preview is already producing, or `null`
   * when this build's camera has no way to give one. See `CameraFrameTap` in the
   * patch to `expo-camera`: no still, no encode, no file.
   */
  const videoFrame = async (view: CameraView, size: Size): Promise<FramePixels | null> => {
    const buffer = await view.grabFrameAsync(size.width, size.height);
    if (!buffer) return null;
    const pixels = new Uint8Array(buffer);
    if (pixels.length !== size.width * size.height * 4) {
      throw new Error(
        `The video frame came back as ${pixels.length} bytes, not ${size.width}x${size.height} RGBA`
      );
    }
    return { pixels, channels: 4 };
  };

  /**
   * The first video frames, checked against a still of the same moment — see
   * `frameAgreement` for why. Returns the frame to use for this pass: the video
   * frame when they agree or cannot be told apart, and the still when the video
   * frame is plainly the wrong way round, which also ends video frames for good.
   */
  const checkedAgainstStill = async (
    view: CameraView,
    size: Size,
    video: FramePixels,
    onShutter: ShutterCallback
  ): Promise<FramePixels> => {
    agreementAttempts += 1;
    const still = await stillFrame(view, size, onShutter);
    const result = frameAgreement(video, still, size);
    const scores = `upright ${result.upright.toFixed(2)} · turned ${result.turned.toFixed(2)} · mirrored ${result.mirrored.toFixed(2)} · flipped ${result.flipped.toFixed(2)}`;

    if (result.verdict === "matches") {
      agreementSettled = true;
      agreement = `matches a still (${scores})`;
      return video;
    }
    if (result.verdict === "inconclusive") {
      agreementSettled = agreementAttempts >= AGREEMENT_ATTEMPTS;
      agreement = `inconclusive after ${agreementAttempts} of ${AGREEMENT_ATTEMPTS} checks (${scores})`;
      return video;
    }
    agreementSettled = true;
    agreement = `${result.verdict} against a still (${scores})`;
    fallbackReason = `Video frames came out ${result.verdict} against a still, so stills are read instead`;
    console.warn(fallbackReason);
    return still;
  };

  /**
   * A still, the way every frame used to be read: see the note on this file.
   * What the grabber falls back to, and what the video frames are checked
   * against.
   */
  const stillFrame = async (
    view: CameraView,
    size: Size,
    onShutter: ShutterCallback
  ): Promise<FramePixels> => {
    // The shutter, as near as this side of the API can see it — and the near
    // side is the request, not the reply. `takePictureAsync` resolves once the
    // still has been captured, encoded to JPEG at full resolution and decoded
    // again to make the ref, which on a forty-eight-megapixel phone is the
    // better part of a second; the photons landed at the start of that, with
    // the preview already running and its exposure and focus converged. Read
    // at the reply instead, the mask is filed under an aim that is a whole
    // capture ahead of the frame it describes, and on a phone being panned at
    // hand speed that is tens of degrees — a mask trailing the buildings in
    // the direction of the turn, which is the inertia this is here to remove.
    onShutter();

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
          const decoded = decodeFrame(new Uint8Array(await file.arrayBuffer()));
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
  };

  return {
    size(): Size | null {
      return camera() ? frame : null;
    },

    async grab(size: Size, onShutter: ShutterCallback): Promise<FramePixels> {
      const view = camera();
      if (!view) throw new Error("The camera is not open");
      const startedAt = performance.now();

      if (fallbackReason !== null && retryVideoAt !== null && startedAt >= retryVideoAt) {
        fallbackReason = null;
        retryVideoAt = null;
        videoFailures = 0;
      }

      if (preferVideo && fallbackReason === null && typeof view.grabFrameAsync === "function") {
        // The shutter is the request, as it is for a still, and much nearer the
        // photons: the frame is the next one the preview produces.
        onShutter();
        try {
          const video = await videoFrame(view, size);
          if (video) {
            videoFailures = 0;
            const used = agreementSettled ? video : await checkedAgainstStill(view, size, video, onShutter);
            source = used === video ? "video frame" : "still photo";
            lastGrabMs = performance.now() - startedAt;
            return used;
          }
          fallbackReason = "This build's camera has no video frame tap";
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          if (message.includes(SESSION_NOT_RUNNING)) {
            // The camera is not running, which is a pass with nothing to read
            // rather than a tap that does not work: not counted against video
            // frames, and no still tried either, since it would be refused for
            // the same reason. The loop's own failure count waits it out.
            throw cause;
          }
          videoFailures += 1;
          console.warn(`A video frame could not be read (${videoFailures} in a row)`, cause);
          if (videoFailures >= VIDEO_FAILURES_BEFORE_STILLS) {
            fallbackReason = `${videoFailures} video frames failed in a row: ${message}`;
            retryVideoAt = performance.now() + VIDEO_RETRY_AFTER_MS;
          }
        }
      }

      const still = await stillFrame(view, size, onShutter);
      source = "still photo";
      lastGrabMs = performance.now() - startedAt;
      return still;
    },

    reading(): FrameReading {
      const retrying =
        fallbackReason !== null && retryVideoAt !== null
          ? ` · video again in ${Math.max(0, Math.ceil((retryVideoAt - performance.now()) / 1000))} s`
          : "";
      return {
        source,
        lastGrabMs,
        preferVideo,
        fallbackReason: fallbackReason === null ? null : fallbackReason + retrying,
        agreement
      };
    },

    setPreferVideo(on: boolean): void {
      preferVideo = on;
      if (on) {
        // Asked for again, so everything that ruled video frames out is asked
        // again too — the check against a still included.
        fallbackReason = null;
        retryVideoAt = null;
        videoFailures = 0;
        agreement = null;
        agreementAttempts = 0;
        agreementSettled = false;
      }
    }
  };
}
