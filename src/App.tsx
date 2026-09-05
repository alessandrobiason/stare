import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { runBootSequence } from "./boot/bootSequence";
import { bootTasks } from "./boot/bootTasks";
import { BootScreen } from "./components/BootScreen";
import { DeviceScene } from "./components/DeviceScene";
import { FatalErrorBoundary } from "./components/FatalErrorBoundary";
import { useAppBoot } from "./hooks/useAppBoot";

/**
 * Stare: draws the live satellite catalog over the iPhone's rear camera,
 * placed by GPS and aimed by the phone's own motion sensors.
 *
 * The app opens on the boot screen and stays there until everything the view
 * needs is in hand, so nothing below has a loading state of its own. Anything
 * fatal — during start-up or after it — comes back to that same screen with the
 * reason and a way to try again.
 *
 * This is the whole of the product. `testing/replay/App.tsx` is the same view
 * fed by a recording instead of a camera, which is how it is developed and
 * tested without a phone in hand; nothing in here knows that exists.
 */
export default function App() {
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
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
