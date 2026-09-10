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
import { CompassNotice, compassNoticeShowing } from "./CompassNotice";
import { SafeAreaLayer } from "./SafeAreaLayer";
import { SceneStatus } from "./SceneStatus";
import { SceneFrame, SkyOverlay } from "./SkyOverlay";

type Props = {
  boot: BootResult;
};

/**
 * The app: the phone's camera with the catalog projected onto it, aimed by its
 * sensors and placed by its GPS.
 *
 * The camera fills the screen: the frame keeps its own 4:3 shape, is scaled
 * until it covers the phone and is clipped where it runs past the edges, and
 * everything this scene writes over it is inset off the notch and the home
 * indicator instead. See `SceneFrame.fit` and `SafeAreaLayer`.
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
      // Edge to edge: the camera is the screen, and the sides of the 4:3 frame
      // that do not fit a tall phone run off it. See `frameBoxFor`.
      fit: "cover",
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

  // One decision, read twice: whether the compass notice is going to be on
  // screen. The notice draws itself from it, and the overlay keeps the panel
  // that shares its corner out of the way while it is.
  const compassWarning = compassNoticeShowing({
    accuracy: compass.accuracy,
    declinationKnown: compass.declinationKnown,
    skyFixStanding
  });

  return (
    <View style={styles.root}>
      <SkyOverlay
        frame={frame}
        catalog={boot.catalog}
        epochRef={epochRef}
        attitude={attitude}
        enabledCategories={controls.enabledCategories}
        starlink={controls.starlink}
        onToggleStarlink={controls.toggleStarlink}
        onToggleCategory={controls.toggleCategory}
        onEnableAll={controls.enableAllCategories}
        onSkyChange={controls.setSky}
        onMaskStatusChange={setMaskStatus}
        onSkyFixChange={setSkyFixStanding}
        debug={controls.debug}
        onToggleDebug={controls.toggleDebug}
        warned={boot.warnings.length > 0}
        skyMaskFiltering={controls.skyMaskFiltering}
        onToggleSkyMaskFiltering={controls.toggleSkyMaskFiltering}
        celestialAlignment={controls.celestialAlignment}
        onToggleCelestialAlignment={controls.toggleCelestialAlignment}
        // Decided here rather than in the overlay, because only the scene has
        // the compass. The notice below and the passes panel want the same
        // corner, and the notice wins — see `SkyOverlay`.
        compassWarning={compassWarning}
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

      {/* The scene's own two panels, inset off the notch and the home
          indicator while the camera underneath them is not. The overlay's
          panels sit in a layer of their own for the same reason, and both
          measure from the same safe corners. See `SafeAreaLayer`. */}
      <SafeAreaLayer>
        <SceneStatus sky={controls.sky} />
        <CompassNotice
          accuracy={compass.accuracy}
          declinationKnown={compass.declinationKnown}
          skyFixStanding={skyFixStanding}
        />
      </SafeAreaLayer>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});

export default DeviceScene;
