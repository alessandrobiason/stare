import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { statusSection } from "../../src/debug/sections";
import { useDeviceOrientation } from "../../src/hooks/useDeviceOrientation";
import { useSceneControls } from "../../src/hooks/useSceneControls";
import { AttitudeSource } from "../../src/hooks/useSmoothedOrientation";
import { SceneStatus } from "../../src/components/SceneStatus";
import { SceneFrame, SkyOverlay } from "../../src/components/SkyOverlay";
import {
  MAGNETIC_DECLINATION_DEG,
  REPLAY_CAMERA,
  REPLAY_CAMERA_FIELD_OF_VIEW,
  REPLAY_DATASET_LABEL,
  REPLAY_LENS
} from "./constants";
import { replaySensorSection } from "./debugSections";
import { ReplayBootResult } from "./replayBoot";
import { ReplayVideo } from "./ReplayVideo";
import { usePlaybackTime } from "./usePlaybackTime";
import { useRecordedReplay } from "./useRecordedReplay";
import { videoFrameGrabber } from "./videoFrameGrabber";

type Props = {
  boot: ReplayBootResult;
};

/**
 * The recorded replay: a staged video with the catalog projected onto it, using
 * the recording's own GPS and attitude.
 *
 * The test path. It stands in for a phone on a machine with no sky to point at,
 * which is what makes the projection checkable against a known ground truth.
 * Everything below the picture is the app's own — `SkyOverlay`, the same mask,
 * the same markers, the same debug pages — and the whole of the difference is
 * the frame handed to it and where the attitude comes from.
 */
export const ReplayScene: React.FC<Props> = ({ boot }) => {
  const replay = useRecordedReplay(boot.recording);
  const { replayStart, epochRef, onPlaybackTimeChange } = replay;
  const liveOrientation = useDeviceOrientation(boot.capabilities, MAGNETIC_DECLINATION_DEG);
  const controls = useSceneControls();
  const [maskStatus, setMaskStatus] = useState("Waiting for the first sky mask…");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // The video's clock, per displayed frame, is what drives the epoch.
  usePlaybackTime(videoRef, onPlaybackTimeChange);

  const frame = useMemo<SceneFrame>(
    () => ({
      label: "Recorded video",
      sizePx: { widthPx: REPLAY_CAMERA.widthPx, heightPx: REPLAY_CAMERA.heightPx },
      fieldOfView: REPLAY_CAMERA_FIELD_OF_VIEW,
      lens: REPLAY_LENS,
      grabber: videoFrameGrabber(() => videoRef.current),
      render: ({ onDiscontinuity }) => (
        <ReplayVideo
          uri={boot.videoUri}
          videoRef={videoRef}
          onTimeChange={onPlaybackTimeChange}
          onSeeked={(seconds) => {
            onDiscontinuity();
            onPlaybackTimeChange(seconds);
          }}
        />
      )
    }),
    [boot.videoUri, onPlaybackTimeChange]
  );

  // The recording's own attitude while it is playing, the machine's sensors
  // otherwise — which on a laptop is nothing at all, and boot has already said so.
  //
  // Both are subscribed to and the recording wins, rather than one being chosen
  // per render: at a reading per displayed frame from either side, choosing in
  // a render is what the app path stopped doing.
  const attitude = useCallback<AttitudeSource>(
    (onReading) => {
      const recorded = replay.subscribe((snapshot) =>
        onReading({
          yawDeg: snapshot.orientation.yaw,
          pitchDeg: snapshot.orientation.pitch,
          rollDeg: snapshot.orientation.roll,
          northOffsetDeg: snapshot.orientation.northOffset,
          gyroRadPerSecond: snapshot.gyro
        })
      );
      const live = liveOrientation.subscribe((next) => {
        if (replay.snapshotRef.current) return;
        onReading({
          yawDeg: next.yaw,
          pitchDeg: next.pitch,
          rollDeg: next.roll,
          northOffsetDeg: next.northOffset,
          gyroRadPerSecond: next.gyro
        });
      });
      return () => {
        recorded();
        live();
      };
    },
    [liveOrientation, replay]
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
        debug={controls.debug}
        onToggleDebug={controls.toggleDebug}
        warned={boot.warnings.length > 0}
        skyMaskFiltering={controls.skyMaskFiltering}
        onToggleSkyMaskFiltering={controls.toggleSkyMaskFiltering}
        celestialAlignment={controls.celestialAlignment}
        onToggleCelestialAlignment={controls.toggleCelestialAlignment}
        sceneDebugSections={() => {
          // Read as the panel draws, since a video frame no longer renders this.
          const snapshot = replay.snapshotRef.current;
          return [
            replaySensorSection({ label: REPLAY_DATASET_LABEL, snapshot, replayStart }),
            statusSection({
              rows: [
                {
                  label: "Playing",
                  value: snapshot
                    ? `${REPLAY_DATASET_LABEL} · t=${snapshot.elapsedSeconds.toFixed(3)} s · frame ${snapshot.frameNumber}`
                    : REPLAY_DATASET_LABEL
                },
                {
                  label: "Orbit replay time",
                  value: snapshot
                    ? new Date(replayStart.getTime() + snapshot.elapsedSeconds * 1000).toISOString()
                    : "—"
                },
                { label: "Sky mask", value: maskStatus }
              ],
              warnings: boot.warnings
            })
          ];
        }}
      />

      <SceneStatus markerCount={controls.markerCount} fleets={controls.markerFleets} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});

export default ReplayScene;
