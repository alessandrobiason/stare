import {
  BootProgress,
  BootStep,
  BootStepDefinition,
  describeError,
  initialBootSteps,
  runCatalogStep,
  settleCatalog,
  settleSensors,
  settleSkyModel,
  startBootRun
} from "../../src/boot/bootRunner";
import { ActiveCatalog } from "../../src/data/tleProvider";
import { DeviceCapabilities } from "../../src/device/capabilities";
import { SatelliteCatalog } from "../../src/satellite/catalog";
import { RecordingData } from "./recordingDataset";

/**
 * The harness's boot: what the replay needs in hand before it can open the
 * view.
 *
 * The app's own sequence is `src/boot/bootSequence.ts`, and this is deliberately
 * not it. The replay has no fix to wait for and no camera to ask for; it has a
 * recording and the video the mask reads instead. The two share their mechanism
 * — the step list, the progress reporting, the catalogue and sky-model checks —
 * through `bootRunner.ts`, so the parts that are meant to be identical cannot
 * drift apart, and neither carries branches for the other.
 */
const STEPS: readonly BootStepDefinition[] = [
  { id: "catalog", label: "Satellite catalogue" },
  { id: "sensors", label: "Device sensors" },
  { id: "recording", label: "Sensor timeline" },
  { id: "video", label: "Camera recording" },
  { id: "skyModel", label: "Sky detection model" }
] as const;

/** The step list before anything has run, for the boot screen's first frame. */
export function initialSteps(): BootStep[] {
  return initialBootSteps(STEPS);
}

/** What the replay's boot produces. */
export type ReplayBootResult = {
  catalog: SatelliteCatalog;
  /** What the machine running the harness turned out to have. */
  capabilities: DeviceCapabilities;
  /** Non-fatal problems worth mentioning but not worth stopping for. */
  warnings: string[];
  recording: RecordingData;
  /** The staged recording's video. Required: it is what the sky mask reads. */
  videoUri: string;
};

export type ReplayBootTasks = {
  loadCatalog(): Promise<ActiveCatalog>;
  checkSensors(): Promise<DeviceCapabilities>;
  loadRecording(): Promise<RecordingData>;
  /** Rejects when the staged recording has no video. */
  loadVideo(): Promise<string>;
  loadSkyModel(): Promise<void>;
};

/**
 * Prepares everything the replay needs, reporting progress as it goes.
 *
 * The steps run together and report in a fixed order, as the app's do. The one
 * rule that differs is the sensors: the machine running the harness usually has
 * none, and does not need them, because the recording carries its own attitude.
 * A missing sensor is a warning here where it stops the app.
 *
 * @throws BootError when a step the replay cannot do without fails.
 */
export async function runReplayBoot(
  tasks: ReplayBootTasks,
  onProgress: (progress: BootProgress) => void
): Promise<ReplayBootResult> {
  const boot = startBootRun(STEPS, onProgress);

  const [catalogResult, sensorsResult, recordingResults, skyModelResult] = await Promise.all([
    runCatalogStep(boot, "catalog", tasks.loadCatalog),
    boot.run("sensors", tasks.checkSensors),
    Promise.all([
      boot.run("recording", tasks.loadRecording),
      boot.run("video", tasks.loadVideo)
    ]),
    boot.run("skyModel", tasks.loadSkyModel)
  ]);

  const [recordingResult, videoResult] = recordingResults;

  // Settled before anything is thrown, so a failure below still shows the full
  // picture rather than a half-run list.
  if (videoResult instanceof Error) {
    boot.update("video", "failed", describeError(videoResult, "The recording could not be resolved"));
  } else {
    boot.update("video", "done");
  }
  const throwIfSkyModelFailed = settleSkyModel(boot, "skyModel", skyModelResult);

  const sensors = settleSensors(
    boot,
    "sensors",
    sensorsResult,
    "The replay's recorded attitude is used instead."
  );
  const warnings = sensors.warning ? [sensors.warning] : [];

  const catalog = settleCatalog(boot, "catalog", catalogResult);

  if (recordingResult instanceof Error) {
    throw boot.fail(
      "recording",
      describeError(recordingResult, "The sensor timeline could not be loaded")
    );
  }
  boot.update("recording", "done");

  // The video is the replay's camera. Without it there are no frames to segment
  // and no picture to place the markers over.
  if (videoResult instanceof Error) {
    throw boot.fail(
      "video",
      describeError(
        videoResult,
        "No staged recording video was found. Run `npm run prepare-test-data` with TEST_DATA_DIR set."
      )
    );
  }

  throwIfSkyModelFailed();

  return {
    catalog,
    capabilities: sensors.capabilities,
    warnings,
    recording: recordingResult,
    videoUri: videoResult
  };
}
