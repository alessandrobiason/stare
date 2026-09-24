import React from "react";
import { StyleSheet, View } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaInsetsContext,
  SafeAreaProvider
} from "react-native-safe-area-context";
import { BootScreen } from "../../src/components/BootScreen";
import { FatalErrorBoundary } from "../../src/components/FatalErrorBoundary";
import { loadActiveCatalog } from "../../src/data/tleProvider";
import { useAppBoot } from "../../src/hooks/useAppBoot";
import { SatelliteCatalog } from "../../src/satellite/catalog";
import { preloadSkySegmenter } from "../../src/vision/skySegmenter";
import { ShotScene as Scene } from "./scenes";
import { ShotScene } from "./ShotScene";

/**
 * The root of the screenshot harness: the app booted against a photograph
 * instead of a camera.
 *
 * Reached from `App.web.tsx` when the page is asked for with `?shot=<scene id>`,
 * which is how one bundle serves both this and the replay harness. See
 * `tools/screenshots/capture.mjs` for the other half.
 */

/**
 * Where this run's photograph is being served from.
 *
 * The capture names the file in the URL, because the name carries a hash of the
 * photograph's contents: Metro caches what it serves out of `public/` and does
 * not watch it, so a photograph swapped under a running dev server went on
 * being served as it was, and the frame came back showing the old one with
 * nothing to say so. Asking for a different name is the one thing no cache can
 * answer wrongly. See `stagePhotos` in `tools/screenshots/capture.mjs`.
 *
 * The plain name is the fallback, for opening a scene by hand in a browser.
 */
export function photoUriFor(id: string): string {
  const asked =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("photo");
  // Only a name of the shape this tool stages: it goes straight into a URL.
  return asked && /^shot-[a-z0-9-]+\.jpg$/.test(asked) ? `/${asked}` : `/shot-${id}.jpg`;
}

/**
 * The 6.9-inch iPhone's safe area, in points, forced on the layout.
 *
 * A browser window has no sensor housing and no home indicator, so the provider
 * measures zero on every edge and the app draws its title hard against the top
 * of the screen. That is correct for the replay harness and wrong for a store
 * frame, where a Dynamic Island is then drawn over the top of the picture
 * (`render.mjs`) and would land on the app's own controls.
 *
 * Supplied here so the capture is laid out exactly as the phone lays it out:
 * the title below the housing, the tab bar above the home indicator. The same
 * two numbers are in `render.mjs` as `SAFE`, which is what draws the chrome
 * that occupies them.
 */
const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

type Booted = {
  catalog: SatelliteCatalog;
};

/**
 * Waits for the photograph to decode.
 *
 * Part of boot rather than left to the `<img>`, because everything after it
 * assumes a picture: the segmenter has nothing to read until the file is
 * decoded, and a screenshot taken before it lands is a set of marks over
 * nothing at all.
 */
function loadPhoto(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error(`No photograph at ${uri}. Run \`npm run screenshots\`, which stages one.`));
    image.src = uri;
  });
}

type Props = {
  scene: Scene;
};

export default function ShotApp({ scene }: Props) {
  const photoUri = photoUriFor(scene.id);

  const boot = useAppBoot<Booted>(async () => {
    // In parallel: they are a network fetch, a 95 MB model and a JPEG, and
    // nothing about one depends on another.
    const [active] = await Promise.all([
      loadActiveCatalog({}),
      preloadSkySegmenter(),
      loadPhoto(photoUri)
    ]);

    // Elements in, records built — the same two steps the app's own catalogue
    // step takes (`runCatalogStep`), without the boot-screen bookkeeping around
    // them, since a capture has nobody to report progress to.
    const catalog = await SatelliteCatalog.build(active.tles);
    if (catalog.size === 0) {
      throw new Error(
        "The catalogue held no usable orbits — is the mock CelesTrak server up? See capture.mjs."
      );
    }
    return { catalog };
  });

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaInsetsContext.Provider value={IPHONE_INSETS}>
        <View style={styles.root}>
          {boot.result && (
            <FatalErrorBoundary onError={boot.reportFatal}>
              <ShotScene scene={scene} catalog={boot.result.catalog} photoUri={photoUri} />
            </FatalErrorBoundary>
          )}

          {boot.phase !== "ready" && (
            <BootScreen
              failed={boot.phase === "failed"}
              error={boot.error}
              retryable={boot.retryable}
              onRetry={boot.retry}
              progress={boot.progress}
            />
          )}
        </View>
      </SafeAreaInsetsContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
