import { CameraView, useCameraPermissions } from "expo-camera";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * A bare camera, on its own, with nothing of this app around it.
 *
 * Temporary, and reached only by the switch in `src/App.tsx`. The probe that
 * runs inside the real view established that every capture is refused in two to
 * twenty milliseconds whatever options are passed — which is AVFoundation
 * rejecting the request outright rather than a capture that ran and failed — and
 * that the preview sometimes never reports itself started at all. What it could
 * not establish is whether that is the library on this phone or this app around
 * the library, because the real view puts the camera inside a laid-out frame,
 * under a Skia canvas, next to a segmentation loop and a boot sequence.
 *
 * So this is the control. One full-screen `CameraView`, no boot, no overlay, no
 * fitted box, and the smallest possible set of props. If a capture works here,
 * the fault is something this app does to the camera and the probe should move
 * back into the real view to find out what. If it fails here too, the fault is
 * below JavaScript and the next build's error detail is the only way on.
 *
 * Three configurations, in one reload:
 *
 *  1. the default back camera, no props at all beyond the ref
 *  2. the front camera, which says whether the back camera in particular is the
 *     problem or the session machinery is
 *  3. the back camera with a lens named explicitly — the device reports "Back
 *     Camera", "Back Dual Wide Camera" and "Back Ultra Wide Camera", and
 *     `expo-camera` picks one by a default that this pins instead
 */

const TAG = "[camera-lab]";

/** The configurations to try, in order, each on a camera of its own. */
type Stage = {
  label: string;
  facing: "back" | "front";
  selectedLens?: string;
  pictureSize?: string;
};

const STAGES: Stage[] = [
  { label: "1 back, bare defaults", facing: "back" },
  // `pictureSize` picks the AVCaptureSession preset, and the preset picks the
  // device's active format. Every capture is being refused in five
  // milliseconds, which is the request being rejected rather than a capture
  // that ran — and the one line in `takePicture` that can invalidate a request
  // for free is `photoSettings.maxPhotoDimensions = photoOutput.maxPhotoDimensions`,
  // which AVFoundation requires to match the *current active format's*
  // supportedMaxPhotoDimensions. A phone with several supported photo sizes can
  // fail that where a phone with one cannot. So walk the presets: if any of
  // them captures, that is both the evidence and a workaround.
  { label: "2 back, pictureSize=Photo", facing: "back", pictureSize: "Photo" },
  { label: "3 back, pictureSize=640x480", facing: "back", pictureSize: "640x480" },
  { label: "4 back, pictureSize=1920x1080", facing: "back", pictureSize: "1920x1080" },
  { label: "5 back, pictureSize=Medium", facing: "back", pictureSize: "Medium" },
  { label: "6 back, pictureSize=Low", facing: "back", pictureSize: "Low" },
  { label: "7 front", facing: "front" }
];

/** How long a stage waits for `onCameraReady` before going on without it. */
const READY_TIMEOUT_MS = 8000;
/** Left between one stage's camera going away and the next one appearing. */
const STAGE_GAP_MS = 1500;
/** Captures per stage, so a first success that does not repeat still shows. */
const SHOTS = 3;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const CameraLab: React.FC = () => {
  const [stage, setStage] = useState(0);
  const [shown, setShown] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const cameraRef = useRef<CameraView | null>(null);
  const readyResolve = useRef<((started: boolean) => void) | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  /** Logged to Metro and shown on the phone, so neither end has to guess. */
  const report = useCallback((line: string) => {
    console.warn(`${TAG} ${line}`);
    setLines((current) => [...current, line]);
  }, []);

  const onCameraReady = useCallback(() => {
    const resolve = readyResolve.current;
    readyResolve.current = null;
    resolve?.(true);
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted) return;
    let cancelled = false;

    void (async () => {
      report(`permission granted=${permission.granted}`);
      // Which binary this is. A dev client leaves most of these null, but the
      // runtime version is the native fingerprint, and it says which commit the
      // build was made from — which decides how to read everything below it.
      try {
        report(
          `build: runtimeVersion=${Updates.runtimeVersion ?? "null"} ` +
            `channel=${Updates.channel ?? "null"} embedded=${Updates.isEmbeddedLaunch} ` +
            `createdAt=${Updates.createdAt?.toISOString() ?? "null"}`
        );
      } catch (cause) {
        report(`build: unavailable — ${String(cause)}`);
      }

      for (let index = 0; index < STAGES.length; index += 1) {
        if (cancelled) return;
        const { label, facing, selectedLens, pictureSize } = STAGES[index];

        setShown(false);
        await wait(STAGE_GAP_MS);
        if (cancelled) return;

        setStage(index);
        const started = new Promise<boolean>((resolve) => {
          readyResolve.current = resolve;
          setTimeout(() => {
            if (readyResolve.current !== resolve) return;
            readyResolve.current = null;
            resolve(false);
          }, READY_TIMEOUT_MS);
        });
        setShown(true);

        const ready = await started;
        if (cancelled) return;
        report(`${label} — onCameraReady=${ready ? "yes" : "TIMED OUT"}`);
        if (selectedLens) report(`${label} — lens pinned to ${selectedLens}`);
        if (pictureSize) report(`${label} — pictureSize=${pictureSize}`);

        // A moment for the preview to settle before asking it for a still.
        await wait(1200);
        if (cancelled) return;

        for (let shot = 1; shot <= SHOTS; shot += 1) {
          const view = cameraRef.current;
          if (!view) {
            report(`${label} — shot ${shot}: no view`);
            continue;
          }
          const startedAt = Date.now();
          try {
            const picture = await view.takePictureAsync({});
            const elapsed = Date.now() - startedAt;
            const size =
              picture && typeof picture === "object" && "width" in picture
                ? `${(picture as { width?: number }).width}x${(picture as { height?: number }).height}`
                : "?";
            report(`${label} — shot ${shot}: OK ${elapsed}ms ${size}`);
          } catch (cause) {
            const elapsed = Date.now() - startedAt;
            const message = cause instanceof Error ? cause.message : String(cause);
            report(`${label} — shot ${shot}: FAIL ${elapsed}ms ${message.split("\n")[0]}`);
          }
          await wait(900);
          if (cancelled) return;
        }
      }

      report("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [permission?.granted, report]);

  const current = STAGES[stage];

  return (
    <View style={styles.root}>
      {shown && (
        <CameraView
          key={`${stage}`}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={current.facing}
          selectedLens={current.selectedLens}
          pictureSize={current.pictureSize}
          onCameraReady={onCameraReady}
          onMountError={({ message }) => report(`MOUNT ERROR: ${message}`)}
        />
      )}

      <View style={styles.log} pointerEvents="none">
        {lines.slice(-14).map((line, index) => (
          <Text key={index} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  log: { position: "absolute", left: 8, right: 8, bottom: 24 },
  line: { color: "#8f8", fontSize: 10, fontFamily: "Menlo" }
});

export default CameraLab;
