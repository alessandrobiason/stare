import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { runBootSequence } from "./boot/bootSequence";
import { bootTasks } from "./boot/bootTasks";
import { BootScreen } from "./components/BootScreen";
import { CameraLab } from "./debug/CameraLab";
import { DeviceScene } from "./components/DeviceScene";
import { FatalErrorBoundary } from "./components/FatalErrorBoundary";
import { IntroScreen } from "./components/IntroScreen";
import { useAppBoot } from "./hooks/useAppBoot";
import { useIntro } from "./hooks/useIntro";

/**
 * Stare: draws the live satellite catalog over the iPhone's rear camera,
 * placed by GPS and aimed by the phone's own motion sensors.
 *
 * The first launch on a device opens on the intro (`IntroScreen`): what the app
 * does, how to hold it, and the three things the phone is about to ask
 * permission for. Every launch after it opens straight on the boot screen and
 * stays there until everything the view needs is in hand, so nothing below has
 * a loading state of its own. Anything fatal — during start-up or after it —
 * comes back to that same screen with the reason and a way to try again.
 *
 * This is the whole of the product. `testing/replay/App.tsx` is the same view
 * fed by a recording instead of a camera, which is how it is developed and
 * tested without a phone in hand; nothing in here knows that exists.
 */
/**
 * Temporary: replaces the whole app with a bare camera, for a dev client.
 *
 * Off in anything that ships. See `CameraLab` — it exists to say whether the
 * capture failure is the library on this phone or this app around it, and it
 * can only answer that by being the only thing on screen.
 */
const CAMERA_LAB = false;

export default function App() {
  const intro = useIntro();

  if (CAMERA_LAB) {
    return (
      <SafeAreaView style={styles.root}>
        <CameraLab />
      </SafeAreaView>
    );
  }

  if (intro.pending) {
    return (
      <SafeAreaView style={styles.root}>
        <IntroScreen onDone={intro.complete} />
      </SafeAreaView>
    );
  }

  return <BootedApp wordmark={!intro.firstRun} />;
}

/**
 * The app proper, from boot onwards.
 *
 * Split from the root above so that boot *starts* here rather than at launch:
 * its first two steps ask for the camera and a fix (`bootTasks`), and mounted
 * alongside the intro they would put the system's prompts over the screen that
 * explains them. Mounting this only once the intro is done is what orders the
 * two.
 */
const BootedApp: React.FC<{ wordmark: boolean }> = ({ wordmark }) => {
  const boot = useAppBoot((onProgress, { force }) =>
    runBootSequence(bootTasks({ force }), onProgress)
  );

  return (
    <SafeAreaView style={styles.root}>
      {boot.result && (
        <FatalErrorBoundary onError={boot.reportFatal}>
          <DeviceScene boot={boot.result} />
        </FatalErrorBoundary>
      )}

      {boot.phase !== "ready" && (
        <BootScreen
          failed={boot.phase === "failed"}
          error={boot.error}
          retryable={boot.retryable}
          onRetry={boot.retry}
          wordmark={wordmark}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
