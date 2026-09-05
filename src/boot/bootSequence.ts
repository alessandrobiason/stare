import { ActiveCatalog } from "../data/tleProvider";
import { DeviceCapabilities } from "../device/capabilities";
import { SatelliteCatalog } from "../satellite/catalog";
import { ObserverLocation } from "../types";
import {
  BootError,
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
} from "./bootRunner";

/**
 * What has to be in hand before the app can open its view: a downloaded
 * catalogue, the sensors that aim it, a fix, the camera it is drawn over, and
 * the model that says what in that camera is sky.
 *
 * This is the app's only boot sequence. The replay harness has its own
 * (`testing/replay/replayBoot.ts`) because it needs a different set of things —
 * a recording and its video where this needs a fix and a camera — and the two
 * share their mechanism through `bootRunner.ts` rather than one sequence
 * branching on which it is.
 */
const STEPS: readonly BootStepDefinition[] = [
  { id: "catalog", label: "Satellite catalogue" },
  { id: "sensors", label: "Device sensors" },
  { id: "location", label: "Your location" },
  { id: "camera", label: "Camera" },
  { id: "skyModel", label: "Sky detection model" }
] as const;

/** The step list before anything has run, for the boot screen's first frame. */
export function initialSteps(): BootStep[] {
  return initialBootSteps(STEPS);
}

/** Everything boot produces, handed over once every step has settled. */
export type BootResult = {
  catalog: SatelliteCatalog;
  /** What the device's own sensors turned out to be. */
  capabilities: DeviceCapabilities;
  /** Non-fatal problems worth mentioning but not worth stopping for. */
  warnings: string[];
  /** Where the phone is, as of the fix boot waited for. */
  observer: ObserverLocation;
  /**
   * How far magnetic north sits from true north here, in degrees east.
   *
   * Zero when the platform cannot say, which leaves headings out by the local
   * declination rather than out by somewhere else's.
   */
  declinationDeg: number;
};

/**
 * The work boot does, injected rather than imported: each reaches for a native
 * API, and the interface is what lets the ordering, failure rules and progress
 * reporting be tested without any of it.
 */
export type BootTasks = {
  loadCatalog(): Promise<ActiveCatalog>;
  checkSensors(): Promise<DeviceCapabilities>;
  locateObserver(): Promise<ObserverLocation>;
  /** Resolves to `null` where the platform cannot say. */
  readDeclination(): Promise<number | null>;
  /** Rejects when the camera cannot be opened or is refused. */
  requestCamera(): Promise<void>;
  /** Downloads the segmentation model and starts the runtime. */
  loadSkyModel(): Promise<void>;
};

/**
 * Prepares everything the AR view needs, reporting progress as it goes.
 *
 * The steps are independent network and hardware work, so they run together —
 * waiting for the catalogue before asking for the camera would cost the sum of
 * the parts — but report in a fixed order, so the list never reshuffles. That
 * includes the catalogue's own expensive half: building its SGP4 records is
 * part of the step (`runCatalogStep`), so it runs against the other steps'
 * waiting rather than after all of them.
 *
 * Nothing here is optional. Without a catalogue there is nothing to draw;
 * without the sensors there is no attitude to aim with; without a fix there is
 * nowhere to place a satellite; and without the camera and the sky model the
 * view cannot say what is behind a building, and would be drawing every
 * satellite as if it were in the clear.
 *
 * @throws BootError when a step the app cannot do without fails.
 */
export async function runBootSequence(
  tasks: BootTasks,
  onProgress: (progress: BootProgress) => void
): Promise<BootResult> {
  const boot = startBootRun(STEPS, onProgress);

  const [catalogResult, sensorsResult, locationResults, skyModelResult] = await Promise.all([
    runCatalogStep(boot, "catalog", tasks.loadCatalog),
    boot.run("sensors", tasks.checkSensors),
    Promise.all([
      boot.run("location", tasks.locateObserver),
      // Folded into the location step: same subsystem, and not worth a line of
      // its own on screen.
      tasks.readDeclination().catch(() => null),
      boot.run("camera", tasks.requestCamera)
    ]),
    boot.run("skyModel", tasks.loadSkyModel)
  ]);

  // Settled before anything is thrown, so a failure below still shows the full
  // picture rather than a half-run list.
  const throwIfSkyModelFailed = settleSkyModel(boot, "skyModel", skyModelResult);
  const sensors = settleSensors(boot, "sensors", sensorsResult);

  // Ahead of the catalogue: it is the one failure retrying cannot fix.
  if (sensors.missing) throw new BootError("sensors", sensors.missing, boot.steps);

  const catalog = settleCatalog(boot, "catalog", catalogResult);

  const [observerResult, declination, cameraResult] = locationResults;
  if (observerResult instanceof Error) {
    throw boot.fail("location", describeError(observerResult, "Your location could not be found"));
  }
  boot.update(
    "location",
    "done",
    `${observerResult.latitudeDeg.toFixed(3)}, ${observerResult.longitudeDeg.toFixed(3)}`
  );

  // The camera is no longer only the picture behind the markers: it is what the
  // sky mask is computed from, so refusing it leaves nothing to check a line of
  // sight against.
  if (cameraResult instanceof Error) {
    throw boot.fail("camera", describeError(cameraResult, "The camera could not be opened"));
  }
  boot.update("camera", "done");

  throwIfSkyModelFailed();

  return {
    catalog,
    capabilities: sensors.capabilities,
    warnings: [],
    observer: observerResult,
    declinationDeg: declination ?? 0
  };
}
