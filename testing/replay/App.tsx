import React from "react";
import { StyleSheet, View } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { BootScreen } from "../../src/components/BootScreen";
import { FatalErrorBoundary } from "../../src/components/FatalErrorBoundary";
import { useAppBoot } from "../../src/hooks/useAppBoot";
import { ReplayScene } from "./ReplayScene";
import { runReplayBoot } from "./replayBoot";
import { replayBootTasks } from "./replayBootTasks";

/**
 * The replay harness's root: the app, with a staged recording where the phone
 * would be.
 *
 * Reached only through `App.web.tsx`, which the bundler picks for the web
 * build. Everything visible below the picture — the boot screen, the error
 * boundary, the overlay the scene renders — is the app's own component, because
 * the point of the harness is to exercise those rather than to stand in for
 * them.
 */
export default function App() {
  const boot = useAppBoot((onProgress, { force }) =>
    runReplayBoot(replayBootTasks({ force }), onProgress)
  );

  return (
    // The app's own root, to the letter: the provider the panels read their
    // insets from (`SafeAreaLayer`), and a full-bleed view under it. A browser
    // window has no notch, so what it reports here is zero on every edge — the
    // harness runs the same layout against the same numbers rather than a
    // different one that happens to look similar.
    //
    // There are no initial metrics on the web — the browser's insets are read
    // from a probe element once the page is up — so this renders nothing until
    // the first measurement lands, a tick before the boot screen it was going
    // to show anyway.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={styles.root}>
        {boot.result && (
          <FatalErrorBoundary onError={boot.reportFatal}>
            <ReplayScene boot={boot.result} />
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
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
