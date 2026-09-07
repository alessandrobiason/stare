import type { CameraView } from "expo-camera";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BootResult } from "../boot/bootSequence";
import { DEVICE_LENS } from "../camera/projection";
import { DEVICE_CAMERA, DEVICE_CAMERA_FIELD_OF_VIEW } from "../constants";
import { aimReadout, deviceSensorSection, statusSection } from "../debug/sections";
import { northOffsetNoiseDeg } from "../fusion/orientationFilter";
import { useCompassAccuracy } from "../hooks/useCompassAccuracy";
import { useLocale } from "../hooks/useLocale";
import { useDeviceOrientation } from "../hooks/useDeviceOrientation";
import { useLiveSky } from "../hooks/useLiveSky";
import { useSceneControls } from "../hooks/useSceneControls";
import { AttitudeSource } from "../hooks/useSmoothedOrientation";
import { cameraFrameGrabber } from "../vision/cameraFrameGrabber";
import { CameraBackground } from "./CameraBackground";
import { CompassNotice } from "./CompassNotice";
import { SceneStatus } from "./SceneStatus";
import { SceneFrame, SkyOverlay } from "./SkyOverlay";

type Props = {
  boot: BootResult;
};

/**
 * The app: the phone's camera with the catalog projected onto it, aimed by its
 * sensors and placed by its GPS.
 *
 * Boot settled everything it needs — catalog downloaded, sensors present, first
 * fix in, camera granted and the sky model loaded — so no loading states are
 * left here. The one thing still in flight when the view opens is the first sky
 * mask, and until it lands there are no markers to draw: the status panel says
 * so rather than the view pretending the whole sky is clear.
 */
export const DeviceScene: React.FC<Props> = ({ boot }) => {
  // Where a language chosen in the console reaches the view: this renders the
  // panels that say something — the count, the compass notice, the filter and
  // the card, by way of `SkyOverlay` — and none of them would otherwise have
  // any reason to render again. See `useLocale`.
  useLocale();
  const { observer, epochRef } = useLiveSky(boot.observer);
  const orientation = useDeviceOrientation(boot.capabilities, boot.declinationDeg);
  // The one thing about the sensors this view renders from, and it renders only
  // when the platform regrades its compass — a handful of times a session
  // rather than twenty times a second. See `useCompassAccuracy`.
  const compass = useCompassAccuracy(orientation);
  const controls = useSceneControls();
  const [maskStatus, setMaskStatus] = useState("Waiting for the first sky mask…");
  /**
   * Whether the sun or the moon is currently aiming the view instead of the
   * magnetometer, which decides whether there is any point asking for a compass
   * calibration. See `useCelestialAlignment`.
   */
  const [skyFixStanding, setSkyFixStanding] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  /**
   * Whether the camera can be captured from, in a ref rather than state.
   *
   * Nothing renders differently for it — it only decides whether a capture is
   * legal to attempt — and putting it in state would rebuild the frame below,
   * and with it the grabber, on the one event that says the camera is finally
   * usable.
   */
  const cameraReadyRef = useRef(false);
  const onCameraReadyChange = useCallback((ready: boolean) => {
    cameraReadyRef.current = ready;
  }, []);
  /**
   * The camera's own "throw this session away and build another", filled in by
   * the view below while it is mounted.
   *
   * A photo output that has stopped delivering stills is not something that can
   * be reconfigured back into working — nothing `expo-camera` exposes reaches
   * it — so a camera that has gone quiet is one to replace rather than to
   * settle. That is the whole of what the segmentation loop can do about a run
   * of failed passes, and it is worth doing before the view gives up and says
   * the sky cannot be segmented. See `CameraBackground`.
   */
  const rebuildCameraRef = useRef<(() => void) | null>(null);
  const rebuildCamera = useCallback(() => {
    const rebuild = rebuildCameraRef.current;
    if (!rebuild) return false;
    rebuild();
    return true;
  }, []);

  /**
   * The phone's camera, as the overlay sees it.
   *
   * The frame handed to the grabber is `DEVICE_CAMERA` rather than whatever the
   * still camera returns, because the mask and the markers have to be
   * describing the same box.
   *
   * The grabber is handed the camera only once the preview is running. Before
   * that it reports no frame at all, which the segmentation loop waits out
   * quietly; handing it a view that cannot be captured from would instead spend
   * the loop's failure budget on the first seconds of every launch.
   */
  const frame = useMemo<SceneFrame>(
    () => ({
      label: "Phone camera",
      sizePx: { widthPx: DEVICE_CAMERA.widthPx, heightPx: DEVICE_CAMERA.heightPx },
      fieldOfView: DEVICE_CAMERA_FIELD_OF_VIEW,
      lens: DEVICE_LENS,
      grabber: cameraFrameGrabber(() => (cameraReadyRef.current ? cameraRef.current : null), {
        width: DEVICE_CAMERA.widthPx,
        height: DEVICE_CAMERA.heightPx
      }),
      rebuild: rebuildCamera,
      // The live camera never jumps, so nothing here uses `onDiscontinuity`.
      render: () => (
        <CameraBackground
          cameraRef={cameraRef}
          onReadyChange={onCameraReadyChange}
          recoveryRef={rebuildCameraRef}
        />
      )
    }),
    [onCameraReadyChange, rebuildCamera]
  );

  // Both the yaw and the bearing to north are reported separately, so the
  // filter can treat the noisy magnetic term as the slow reference it is.
  //
  // Handed on as a subscription rather than a reading, so the twenty-odd
  // readings a second each cost a filter update instead of a render of this
  // scene and everything under it.
  const attitude = useCallback<AttitudeSource>(
    (onReading) =>
      orientation.subscribe((next) =>
        onReading({
          yawDeg: next.yaw,
          pitchDeg: next.pitch,
          rollDeg: next.roll,
          northOffsetDeg: next.northOffset,
          // What that bearing is worth, which only a phone can say. A compass
          // the platform has graded unusable is one that 13 µT of magnet can
          // have pointed thirty degrees off at these latitudes, and fusing it
          // as though it were a good one is how the sky ends up drawn
          // somewhere else with nothing on screen looking amiss.
          northOffsetNoiseDeg: northOffsetNoiseDeg(next.compassAccuracy),
          gyroRadPerSecond: next.gyro
        })
      ),
    [orientation]
  );

  return (
    <View style={styles.root}>
      <SkyOverlay
        frame={frame}
        catalog={boot.catalog}
        epochRef={epochRef}
        attitude={attitude}
        enabledCategories={controls.enabledCategories}
        onToggleCategory={controls.toggleCategory}
        onEnableAll={controls.enableAllCategories}
        onVisibleSatelliteCountChange={controls.setMarkerCount}
        onMaskStatusChange={setMaskStatus}
        onSkyFixChange={setSkyFixStanding}
        debug={controls.debug}
        onToggleDebug={controls.toggleDebug}
        warned={boot.warnings.length > 0}
        skyMaskFiltering={controls.skyMaskFiltering}
        onToggleSkyMaskFiltering={controls.toggleSkyMaskFiltering}
        celestialAlignment={controls.celestialAlignment}
        onToggleCelestialAlignment={controls.toggleCelestialAlignment}
        sceneDebugSections={() => [
          deviceSensorSection({
            // Read as the panel draws, since a reading no longer renders this.
            orientation: orientation.latestRef.current,
            observer,
            capabilities: boot.capabilities
          }),
          statusSection({
            rows: [
              {
                label: "Position",
                value: `${observer.latitudeDeg.toFixed(4)}, ${observer.longitudeDeg.toFixed(4)} · ${observer.heightM.toFixed(0)} m`
              },
              { label: "Aim", value: aimReadout(orientation.latestRef.current) },
              { label: "Sky mask", value: maskStatus }
            ],
            warnings: boot.warnings
          })
        ]}
      />

      <SceneStatus markerCount={controls.markerCount} />
      <CompassNotice
        accuracy={compass.accuracy}
        declinationKnown={compass.declinationKnown}
        skyFixStanding={skyFixStanding}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});

export default DeviceScene;
