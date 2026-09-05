import { Camera } from "expo-camera";
import { loadActiveCatalog } from "../data/tleProvider";
import { readDeviceCapabilities } from "../device/deviceOrientation";
import { readMagneticDeclinationDeg, requestObserverFix } from "../device/location";
import { preloadSkySegmenter } from "../vision/skySegmenter";
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
  throw new Error(
    permission.canAskAgain
      ? "Camera access is needed to see the sky and to work out what is in front of it."
      : "Camera access is off for this app. Turn it on in Settings to use the view."
  );
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
    loadSkyModel: preloadSkySegmenter
  };
}
