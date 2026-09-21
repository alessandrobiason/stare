import { ActiveCatalog } from "../data/tleProvider";
import { DeviceCapabilities } from "../device/capabilities";
import { PassAlertAccess } from "../notifications/alertTypes";
import { SatelliteCatalog } from "../satellite/catalog";
import { ObserverLocation } from "../types";
import { BootFailure, bootFailureOf } from "./bootFailure";
import {
  BootError,
  BootProgress,
  BootStepReport,
  BootRun,
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
/**
 * The weights are what the progress bar is drawn on, and they are not a guess
 * at how long each step takes so much as a statement of which one is the wait.
 *
 * Two of these are a system prompt, one is a sensor probe that answers at once,
 * and one is a couple of megabytes of orbital elements. The sky model is 95 MB
 * downloaded once per install, rewritten, and compiled by Core ML — on a first
 * launch the other four are over before it has started, and it is the only
 * step that can say how far through itself it is (`skyModelProgress.ts`). So
 * it is given most of the bar, and the bar spends most of its travel on a
 * figure that is real rather than on four steps' worth of jumps.
 */
const STEPS: readonly BootStepDefinition[] = [
  { id: "catalog", label: "Satellite catalogue", weight: 3 },
  { id: "sensors", label: "Device sensors", weight: 1 },
  { id: "location", label: "Your location", weight: 2 },
  { id: "camera", label: "Camera", weight: 1 },
  { id: "skyModel", label: "Sky detection model", weight: 13 }
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
   * How far magnetic north sits from true north here, in degrees east, or
   * `null` where the compass had not settled on one by the time boot gave up
   * waiting (`readMagneticDeclinationDeg`).
   *
   * `null` rather than zero, which is a declination — magnetic north — and
   * indistinguishable from a real reading of it. The view keeps the compass
   * watch open and fills this in from the first heading that does settle
   * (`subscribeToCompass`), and says which of the two it is holding meanwhile.
   */
  declinationDeg: number | null;
  /**
   * Whether the phone will let a pass alert through — the one permission boot
   * asks for and does not need.
   *
   * `"undetermined"` where boot never got as far as asking, which is any boot
   * that had already failed by then. Nothing reads this to decide whether to
   * queue anything: the answer is published where both the scheduler and the
   * settings row can see it (`src/notifications/alertAccess.ts`), and this is
   * here so that what boot did is part of what boot returns.
   */
  alerts: PassAlertAccess;
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
  /**
   * Asks for notifications, and never rejects: this is the one thing boot asks
   * for that boot does not need. A refusal is an app with no pass alerts in it
   * and everything else exactly as it was.
   */
  requestAlerts(): Promise<PassAlertAccess>;
  /**
   * Downloads the segmentation model and starts the runtime, saying how far
   * through it is as it goes. It is the one step with a real figure to report,
   * and the reason the boot screen has a bar at all.
   */
  loadSkyModel(report: BootStepReport): Promise<void>;
};

/** What the operating system was asked for, and what came back. */
type Access = {
  camera: void | Error;
  /** `null` when the camera was refused and the fix was never asked for. */
  observer: ObserverLocation | Error | null;
  /** `null` when there was no fix to read it against, or none to be had. */
  declinationDeg: number | null;
  /** What the phone said about notifications, or `"undetermined"` if unasked. */
  alerts: PassAlertAccess;
};

/**
 * Everything boot asks the operating system's permission for, one prompt at a
 * time: the camera, then the location, then — once both are granted —
 * notifications.
 *
 * One at a time because two prompts are two system alerts: asked together, the
 * order they arrive in is the operating system's to decide, and one raised
 * while the other is up may never be presented at all — which is a boot that
 * waits forever on an answer to a question nobody was asked. It costs nothing
 * to boot: the prompts are answered one after another whatever we do, and the
 * catalogue, the sensors and the sky model are still loading behind them.
 *
 * Nothing is asked for after a refusal that has already lost boot. A phone that
 * has just refused the camera is not then asked where it is for a view that
 * will not open either way.
 *
 * The declination comes last for a harder reason: the platform answers for the
 * heading through the same authorisation as the fix, so asked alongside the
 * request rather than after it, it is asked before there is any permission to
 * answer it with. It failed exactly once per device — on the first launch,
 * the only one where the permission is not already granted — and left the first
 * session's headings out by the local declination, which is a marker out by
 * twenty degrees in the places where that matters most.
 */
async function requestAccess(boot: BootRun, tasks: BootTasks): Promise<Access> {
  const camera = await boot.run("camera", tasks.requestCamera);
  if (camera instanceof Error) {
    return { camera, observer: null, declinationDeg: null, alerts: "undetermined" };
  }

  const observer = await boot.run("location", tasks.locateObserver);
  if (observer instanceof Error) {
    return { camera, observer, declinationDeg: null, alerts: "undetermined" };
  }

  // Folded into the location step: same subsystem, same permission, and not
  // worth a line of its own on screen.
  const declinationDeg = await tasks.readDeclination().catch(() => null);

  // Last, and no step of its own, because it is the only prompt here that can
  // be refused and leave the app working. A phone is asked for what the view
  // needs before it is asked for what the view would like — and by the time
  // this one is put, the person has already said yes twice, which is the best
  // moment there is to ask for the third. See `src/satellite/passAlerts.ts`.
  const alerts = await tasks.requestAlerts().catch((): PassAlertAccess => "denied");
  return { camera, observer, declinationDeg, alerts };
}

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
 * The one thing not run against the rest is the asking: everything the phone
 * has to grant is requested in a single chain, one prompt at a time, for the
 * reasons in `requestAccess`.
 *
 * Nothing here is optional except the last thing it asks for. Notifications
 * are requested once the camera and the fix have both been granted, and a
 * refusal is carried out in `BootResult.alerts` rather than thrown: the app
 * opens on the same view either way, with or without pass alerts in it.
 *
 * Everything else is a stop. Without a catalogue there is nothing to draw;
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

  const [catalogResult, sensorsResult, access, skyModelResult] = await Promise.all([
    runCatalogStep(boot, "catalog", tasks.loadCatalog),
    boot.run("sensors", tasks.checkSensors),
    requestAccess(boot, tasks),
    boot.run("skyModel", () =>
      tasks.loadSkyModel((fraction, activity) => boot.advance("skyModel", fraction, activity))
    )
  ]);

  // Settled before anything is thrown, so a failure below still shows the full
  // picture rather than a half-run list.
  const throwIfSkyModelFailed = settleSkyModel(boot, "skyModel", skyModelResult);
  const sensors = settleSensors(boot, "sensors", sensorsResult);

  // Ahead of the catalogue: it is the one failure retrying cannot fix.
  if (sensors.missing) {
    throw new BootError("sensors", sensors.missing, boot.steps, sensors.failure ?? undefined);
  }

  const catalog = settleCatalog(boot, "catalog", catalogResult);

  // Settled in the order they were asked for, so the reason boot stopped is the
  // first prompt that went against it rather than the last.
  //
  // The camera is no longer only the picture behind the markers: it is what the
  // sky mask is computed from, so refusing it leaves nothing to check a line of
  // sight against.
  if (access.camera instanceof Error) {
    throw boot.fail(
      "camera",
      describeError(access.camera, "The camera could not be opened"),
      // `requestCamera` throws a failure of its own, saying whether the prompt
      // was refused or is off for good; anything else is the camera itself.
      bootFailureOf(access.camera) ?? new BootFailure("cameraFailed", access.camera.message)
    );
  }
  boot.update("camera", "done");

  // `null` only where the camera failed above, which has already thrown.
  const observer = access.observer;
  if (observer === null || observer instanceof Error) {
    throw boot.fail(
      "location",
      describeError(observer, "Your location could not be found"),
      bootFailureOf(observer) ?? new BootFailure("locationUnavailable")
    );
  }
  boot.update(
    "location",
    "done",
    `${observer.latitudeDeg.toFixed(3)}, ${observer.longitudeDeg.toFixed(3)}`
  );

  throwIfSkyModelFailed();

  return {
    catalog,
    capabilities: sensors.capabilities,
    warnings: [],
    observer,
    declinationDeg: access.declinationDeg,
    alerts: access.alerts
  };
}
