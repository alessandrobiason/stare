import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
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
    <SafeAreaView style={styles.root}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
