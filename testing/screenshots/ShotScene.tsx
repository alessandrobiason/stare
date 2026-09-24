import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { lensFor } from "../../src/camera/projection";
import {
  DEVICE_CAMERA,
  DEVICE_CAMERA_FIELD_OF_VIEW,
  MINIMUM_SATELLITE_ELEVATION_DEG
} from "../../src/constants";
import { SceneFrame, SkyOverlay } from "../../src/components/SkyOverlay";
import { useSceneControls } from "../../src/hooks/useSceneControls";
import { AttitudeSource } from "../../src/hooks/useSmoothedOrientation";
import { SatelliteCatalog } from "../../src/satellite/catalog";
import { SkyTracker } from "../../src/satellite/skyTracker";
import { OrbitEpoch } from "../../src/types";
import { ShotScene as Scene } from "./scenes";
import { StillPicture } from "./StillPicture";
import { stillFrameGrabber } from "./stillFrameGrabber";

/**
 * The app's view over a still photograph, at a fixed place, instant and
 * bearing: the thing the App Store frames are photographed from.
 *
 * It is the third scene, beside the phone's (`DeviceScene`) and the replay
 * harness's (`ReplayScene`), and like them it owns nothing that is on screen.
 * Everything visible is `SkyOverlay` — the same markers, the same panels, the
 * same mask — so a change to the app is a change to the store listing, which is
 * the entire reason this exists. What it replaced was a second implementation
 * of those panels in HTML and CSS, which could only ever be as current as the
 * last person to remember it.
 *
 * **Nothing here moves.** The epoch is one instant rather than a clock, the
 * attitude is one bearing rather than a sensor, and the picture is a file. That
 * is what makes two runs of the capture produce the same pixels, which is what
 * lets the workflow commit the result only when the app has actually changed.
 */

/** The phone's own lens, so the marks land where the phone would put them. */
const LENS = lensFor(DEVICE_CAMERA_FIELD_OF_VIEW);

/**
 * How often the fixed attitude is republished, in milliseconds.
 *
 * The orientation filter is fed by a subscription and carries its estimate
 * forward on the wall clock, so a single reading at mount would leave it
 * coasting. A slow heartbeat of the same numbers keeps it pinned to them
 * without pretending to be a sensor.
 */
const ATTITUDE_HEARTBEAT_MS = 100;

type Props = {
  scene: Scene;
  catalog: SatelliteCatalog;
  /** Where the photograph is served from. See `capture.mjs`. */
  photoUri: string;
};

/**
 * Where to point, in the app's own terms: a compass bearing and a height.
 *
 * A scene that names a target is asking for that object to be in the middle of
 * the frame, which is only knowable once the catalogue is in hand — so it is
 * resolved here, through the same tracker the view uses, rather than written
 * into `scenes.ts` as a bearing somebody worked out once and could not check.
 */
function aimOf(scene: Scene, catalog: SatelliteCatalog): { azimuthDeg: number; elevationDeg: number } {
  if (scene.aim.kind === "fixed") return scene.aim;

  const tracker = new SkyTracker(catalog, MINIMUM_SATELLITE_ELEVATION_DEG);
  const detail = tracker.describe(scene.aim.name, new Date(scene.timeIso), scene.observer);
  if (!detail) {
    throw new Error(`${scene.id}: the catalogue has no ${scene.aim.name} to point at`);
  }
  if (detail.elevationDeg < MINIMUM_SATELLITE_ELEVATION_DEG) {
    throw new Error(
      `${scene.id}: ${scene.aim.name} is ${detail.elevationDeg.toFixed(1)} degrees up at ${scene.timeIso}, so there is no mark to photograph`
    );
  }
  return {
    azimuthDeg: detail.azimuthDeg,
    elevationDeg: detail.elevationDeg - (scene.aim.lowerBy ?? 0)
  };
}

export const ShotScene: React.FC<Props> = ({ scene, catalog, photoUri }) => {
  const controls = useSceneControls();
  const imageRef = useRef<HTMLImageElement | null>(null);

  // One instant, held: see the note at the top of this file.
  const epochRef = useRef<OrbitEpoch>({
    time: new Date(scene.timeIso),
    observer: scene.observer
  });

  const aim = useMemo(() => aimOf(scene, catalog), [scene, catalog]);

  /**
   * The bearing being published, in a ref so it can be moved without
   * resubscribing the view to a new attitude source.
   */
  const aimRef = useRef(aim);
  aimRef.current = aim;

  /**
   * A way to turn the phone from outside, for `tools/screenshots/probe-aims.mjs`.
   *
   * Which way to point each scene is not a thing to reason about: how many
   * marks a bearing is worth depends on the catalogue, the field of view that
   * survives the screen crop, and what the mask takes out behind the terrain in
   * that particular photograph. Two attempts to work it out on paper were both
   * wrong by an order of magnitude. So the app is asked instead — the probe
   * turns the view and reads the count the header publishes — and this is the
   * handle it turns. Nothing in a capture run touches it.
   */
  useEffect(() => {
    const target = window as unknown as {
      stareShotAim?: (azimuthDeg: number, elevationDeg: number) => void;
      stareShotTime?: (iso: string) => void;
    };
    target.stareShotAim = (azimuthDeg, elevationDeg) => {
      aimRef.current = { azimuthDeg, elevationDeg };
    };
    // And the instant, for the same reason: which names end up on the frame
    // depends on what is overhead, and that is a search over time. The tracker
    // reads the epoch as it draws, so moving it is enough.
    target.stareShotTime = (iso) => {
      epochRef.current.time = new Date(iso);
    };
    return () => {
      delete target.stareShotAim;
      delete target.stareShotTime;
    };
  }, []);

  /**
   * The bearing, as the filter takes it: `yawDeg` is measured from the source's
   * own origin and `northOffsetDeg` says where that origin is. A scene has no
   * arbitrary origin to correct for, so the origin *is* north and the yaw is
   * the bearing itself.
   */
  const attitude = useCallback<AttitudeSource>(
    (onReading) => {
      const publish = () =>
        onReading({
          yawDeg: aimRef.current.azimuthDeg,
          pitchDeg: aimRef.current.elevationDeg,
          rollDeg: scene.rollDeg ?? 0,
          northOffsetDeg: 0,
          gyroRadPerSecond: { x: 0, y: 0, z: 0 }
        });
      publish();
      const timer = setInterval(publish, ATTITUDE_HEARTBEAT_MS);
      return () => clearInterval(timer);
    },
    [scene.rollDeg]
  );

  const frame = useMemo<SceneFrame>(
    () => ({
      label: `Still: ${scene.id}`,
      // The camera's own frame rather than the photograph's: this is the box
      // the projection places marks in, and the picture is laid into it.
      sizePx: { widthPx: DEVICE_CAMERA.widthPx, heightPx: DEVICE_CAMERA.heightPx },
      // As the phone does — the picture reaches all four corners and loses its
      // sides off the screen. The store frames have to show what a phone shows.
      fit: "cover",
      fieldOfView: DEVICE_CAMERA_FIELD_OF_VIEW,
      lens: LENS,
      grabber: stillFrameGrabber(
        () => imageRef.current,
        { width: DEVICE_CAMERA.widthPx, height: DEVICE_CAMERA.heightPx }
      ),
      render: () => <StillPicture uri={photoUri} imageRef={imageRef} />
    }),
    [photoUri, scene.id]
  );

  // The capture waits on this before it photographs anything: it says the view
  // is up, which attribute selectors in the driver can see.
  useEffect(() => {
    document.documentElement.dataset.shot = scene.id;
    return () => {
      delete document.documentElement.dataset.shot;
    };
  }, [scene.id]);

  return (
    <View style={styles.root}>
      <SkyOverlay
        frame={frame}
        catalog={catalog}
        epochRef={epochRef}
        attitude={attitude}
        enabledCategories={controls.enabledCategories}
        enabledSubcategories={controls.enabledSubcategories}
        onToggleSubcategory={controls.toggleSubcategory}
        onToggleCategory={controls.toggleCategory}
        onEnableAll={controls.enableAllCategories}
        tab={controls.tab}
        onSelectTab={controls.setTab}
        filterOpen={controls.filterOpen}
        onToggleFilter={controls.toggleFilter}
        frozen={controls.frozen}
        onToggleFrozen={controls.toggleFrozen}
        debug={controls.debug}
        onToggleDebug={controls.toggleDebug}
        onOpenConsole={controls.openConsole}
        guide={controls.guide}
        onOpenGuide={controls.openGuide}
        onCloseGuide={controls.closeGuide}
        skyMaskFiltering={controls.skyMaskFiltering}
        onToggleSkyMaskFiltering={controls.toggleSkyMaskFiltering}
        celestialAlignment={controls.celestialAlignment}
        onToggleCelestialAlignment={controls.toggleCelestialAlignment}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});

export default ShotScene;
