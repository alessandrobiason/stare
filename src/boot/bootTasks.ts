import { Camera } from "expo-camera";
import { loadActiveCatalog } from "../data/tleProvider";
import { readDeviceCapabilities } from "../device/deviceOrientation";
import { readMagneticDeclinationDeg, requestObserverFix } from "../device/location";
import { askForPassAlerts } from "../notifications/alertAccess";
import { preloadSkySegmenter } from "../vision/skySegmenter";
import { BootFailure } from "./bootFailure";
import { BootTasks } from "./bootSequence";

/**
 * Asks for the camera, and fails boot if it is refused.
 *
 * It used to be asked for inside the view, where a refusal cost only the picture
 * behind the markers. It now costs the sky mask as well — the camera is the
 * frame the model reads — so it belongs here with the other things the view
 * cannot open without.
 */
async function requestCamera(): Promise<void> {
  const permission = await Camera.requestCameraPermissionsAsync();
  if (permission.granted) return;
  // Both land on the phone's own settings page, because iOS raises its prompt
  // once per install: `canAskAgain` decides which sentence is honest, not
  // whether there is a way back. See `bootFailure.ts`.
  throw new BootFailure(permission.canAskAgain ? "cameraRefused" : "cameraBlocked");
}

/**
 * The real work behind each boot step.
 *
 * `force` is passed through to the catalog when the user asks for a retry by
 * hand, so the throttle that stops us hammering CelesTrak after a failure does
 * not also disable the button offered to fix it.
 */
export function bootTasks({ force = false }: { force?: boolean } = {}): BootTasks {
  return {
    loadCatalog: () => loadActiveCatalog({ force }),
    checkSensors: readDeviceCapabilities,
    locateObserver: requestObserverFix,
    readDeclination: readMagneticDeclinationDeg,
    requestCamera,
    // Asking is also what publishes the answer to the two screens that read it
    // (`alertAccess`), which is why boot calls this rather than reading the
    // permission and leaving the asking to the settings row: the one prompt iOS
    // ever shows is worth spending where somebody has just been told it is
    // coming, on the page before this.
    requestAlerts: askForPassAlerts,
    loadSkyModel: preloadSkySegmenter
  };
}
