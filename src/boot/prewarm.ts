import { loadActiveCatalog } from "../data/tleProvider";
import { preloadSkySegmenter } from "../vision/skySegmenter";

/**
 * Starts the half of boot that needs nobody's permission, as early as it can
 * be started.
 *
 * Boot does five things, and only three of them are the app's own work: the
 * catalogue has to be downloaded and parsed, and the segmentation model has to
 * be fetched and its runtime brought up. The other two — the camera and the
 * fix — are the operating system asking the person a question, and they cannot
 * be hurried or asked early. `src/App.tsx` is deliberately split so that
 * nothing mounts the boot sequence until the intro has been accepted, because
 * a permission prompt over the screen that explains the permission is the one
 * ordering this app must not get wrong.
 *
 * That split has a cost on the one launch where it applies. The very first run
 * on a device shows two pages of intro, which take a person some seconds to
 * read — and for all of those seconds the network sat idle, because boot had
 * not been mounted yet. Then the intro was accepted and the app went looking
 * for a couple of megabytes of orbital elements it could have had in hand
 * already.
 *
 * So the work that asks nothing of anybody starts when the intro appears. Both
 * calls below are idempotent by construction — the catalogue shares one
 * in-flight request (`loadActiveCatalog`) and the model one promise
 * (`loadModel`) — so boot, when it does start, joins whatever this began
 * instead of starting it again. Nothing here changes what boot checks or in
 * what order; it changes only when the clock starts.
 *
 * Nothing is awaited and nothing is reported. A failure here is not a failure:
 * boot runs the same steps a moment later and is the thing that decides what a
 * failure means and what the screen says about it. This is a head start, and a
 * head start that does not arrive simply leaves boot where it would have been.
 */
export function prewarmBoot(): void {
  // Never rejects on its own, and falls all the way back to the bundled
  // element set rather than throwing. Caught anyway: this is a fire-and-forget
  // call, and an unhandled rejection from one would be a red screen in
  // development over work nobody is waiting on.
  void loadActiveCatalog().catch(() => undefined);
  // This one does reject — a download that fails, a runtime that will not
  // start. Boot asks again and stops on it there, with a reason.
  void preloadSkySegmenter().catch(() => undefined);
}
