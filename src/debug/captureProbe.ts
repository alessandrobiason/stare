import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";

/**
 * A one-off experiment against the still camera, for a dev client attached to
 * Metro.
 *
 * Temporary. This is not part of the app and nothing calls it in a release
 * build; it exists because five attempts at a capture failure that only happens
 * on someone else's phone have all been reasoning about a fixed error string,
 * and a dev client can run the experiment instead.
 *
 * What it is actually asking: `expo-camera` builds its `AVCapturePhotoSettings`
 * the same way whatever options are passed, so almost nothing here can reach
 * the failure — with one exception. `shutterSound: false` makes the native side
 * call `AudioServicesDisposeSystemSoundID(1108)` from inside
 * `willCapturePhotoFor`, which is to say *during* the capture, disposing a
 * system sound the app does not own. Every ordinary camera screen leaves the
 * shutter sound alone; this app turns it off on every one of a capture a
 * second. That is the most unusual thing it does at this layer, and it is one
 * line of JavaScript to rule in or out.
 *
 * The rest of the matrix separates the other JavaScript-reachable suspects, and
 * the burst at the end asks whether a capture that works once keeps working —
 * which tells a configuration that is wrong from the start apart from a session
 * that degrades.
 */

/** Prefixed so the results are greppable in a noisy Metro log. */
const TAG = "[capture-probe]";

type ProbeVariant = {
  label: string;
  options: Parameters<CameraView["takePictureAsync"]>[0];
};

/**
 * Single captures, cheapest question first.
 *
 * Ordered so that the first difference in the results names the culprit: the
 * bare default is what every other app using this library sends, and each row
 * after it adds exactly one of the things this app does differently.
 */
const VARIANTS: ProbeVariant[] = [
  { label: "1 bare defaults (what every other app sends)", options: {} },
  { label: "2 shutterSound off, file output", options: { shutterSound: false } },
  { label: "3 pictureRef, shutter sound left on", options: { pictureRef: true } },
  {
    label: "4 pictureRef + shutterSound off",
    options: { pictureRef: true, shutterSound: false }
  },
  {
    label: "5 exactly what the sky mask sends",
    options: { pictureRef: true, shutterSound: false, quality: 0.4, skipProcessing: false }
  }
];

/** How long to leave between probe captures, so none is judged on the last. */
const GAP_MS = 1500;

/** How many of the app's own captures to take in a row at the end. */
const BURST = 6;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Whatever came back, disposed of the way that kind of result has to be. */
function discard(picture: unknown): void {
  if (!picture || typeof picture !== "object") return;

  const ref = picture as { release?: () => void; uri?: string };
  if (typeof ref.release === "function") {
    ref.release();
    return;
  }
  if (typeof ref.uri === "string") {
    try {
      const file = new File(ref.uri);
      if (file.exists) file.delete();
    } catch {
      // A file that would not delete says nothing about the capture.
    }
  }
}

/** One capture, reported rather than thrown. */
async function attempt(
  view: CameraView,
  label: string,
  options: ProbeVariant["options"]
): Promise<boolean> {
  const startedAt = Date.now();
  try {
    const picture = await view.takePictureAsync(options);
    const elapsed = Date.now() - startedAt;
    discard(picture);
    console.warn(`${TAG} OK   ${label} — ${elapsed}ms`);
    return true;
  } catch (cause) {
    const elapsed = Date.now() - startedAt;
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`${TAG} FAIL ${label} — ${elapsed}ms — ${message}`);
    return false;
  }
}

/**
 * Runs the matrix and then the burst, logging every outcome.
 *
 * Never throws: a probe that took the view down with it would be worse than no
 * probe at all.
 */
export async function runCaptureProbe(view: CameraView): Promise<void> {
  console.warn(`${TAG} starting — ${VARIANTS.length} variants, then ${BURST} in a row`);

  for (const { label, options } of VARIANTS) {
    await attempt(view, label, options);
    await wait(GAP_MS);
  }

  console.warn(`${TAG} burst of ${BURST} with the sky mask's own options`);
  let succeeded = 0;
  for (let index = 1; index <= BURST; index += 1) {
    const ok = await attempt(view, `burst ${index}/${BURST}`, {
      pictureRef: true,
      shutterSound: false,
      quality: 0.4,
      skipProcessing: false
    });
    if (ok) succeeded += 1;
    await wait(GAP_MS);
  }

  console.warn(`${TAG} done — burst succeeded ${succeeded}/${BURST}`);
}
