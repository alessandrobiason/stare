import { useCallback, useState } from "react";
import { allCategories, SatelliteCategory } from "../satellite/categories";
import { FleetBreakdown } from "../satellite/fleets";

export type SceneControls = {
  enabledCategories: Set<SatelliteCategory>;
  toggleCategory: (category: SatelliteCategory) => void;
  enableAllCategories: () => void;
  /** Reported from the render loop; React bails out when the value is unchanged. */
  markerCount: number;
  /**
   * What those markers are, by fleet — what the count opens into when it is
   * tapped (`SceneStatus`). Published by the same loop, on the same tick.
   */
  markerFleets: FleetBreakdown;
  setMarkerCount: (count: number, fleets: FleetBreakdown) => void;
  /**
   * Which of the two view modes is running: normal, or normal plus the debug
   * overlays. Off on open — debug is what someone asks for, not what they land in.
   */
  debug: boolean;
  toggleDebug: () => void;
  /**
   * Whether the sky mask is allowed to hide markers behind terrain. On, because
   * that is the view the app is for; the debug menu's switch is what turns it
   * off, and with it off every satellite above the elevation mask is drawn
   * wherever it is — over trees, walls and everything else.
   */
  skyMaskFiltering: boolean;
  toggleSkyMaskFiltering: () => void;
  /**
   * Whether the sun and the moon are used to check the compass. On, because a
   * heading that has been checked against the sky is the better heading in
   * every case where one is available, and because there is nothing to weigh up
   * — a sighting is a measurement like the magnetometer's, and the filter
   * decides what it is worth. The debug menu's switch turns it off, which is
   * how a correction is confirmed to have come from here.
   */
  celestialAlignment: boolean;
  toggleCelestialAlignment: () => void;
};

/** Nothing counted yet: the breakdown a scene shows before its first frame. */
const NO_FLEETS: FleetBreakdown = { rows: [], other: 0 };

/**
 * The controls both scenes carry: which categories are drawn, how many markers
 * the last frame placed and what they are, and whether the debug overlays are
 * up. The same sky either way, so the same controls — a phone and the replay
 * behave identically.
 */
export function useSceneControls(): SceneControls {
  const [enabledCategories, setEnabledCategories] =
    useState<Set<SatelliteCategory>>(allCategories);
  const [markerCount, setCount] = useState(0);
  const [markerFleets, setFleets] = useState<FleetBreakdown>(NO_FLEETS);
  const [debug, setDebug] = useState(false);
  const [skyMaskFiltering, setSkyMaskFiltering] = useState(true);
  const [celestialAlignment, setCelestialAlignment] = useState(true);

  // One callback for the two, because the loop publishes them together: handed
  // over separately they would be two state updates for one tick of the same
  // figure, and a render in between showing a count the breakdown disagrees with.
  const publishMarkers = useCallback((count: number, fleets: FleetBreakdown) => {
    setCount(count);
    setFleets(fleets);
  }, []);

  const toggleCategory = useCallback((category: SatelliteCategory) => {
    setEnabledCategories((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  }, []);

  const enableAllCategories = useCallback(() => setEnabledCategories(allCategories()), []);
  const toggleDebug = useCallback(() => setDebug((on) => !on), []);
  const toggleSkyMaskFiltering = useCallback(() => setSkyMaskFiltering((on) => !on), []);
  const toggleCelestialAlignment = useCallback(() => setCelestialAlignment((on) => !on), []);

  return {
    enabledCategories,
    toggleCategory,
    enableAllCategories,
    markerCount,
    markerFleets,
    setMarkerCount: publishMarkers,
    debug,
    toggleDebug,
    skyMaskFiltering,
    toggleSkyMaskFiltering,
    celestialAlignment,
    toggleCelestialAlignment
  };
}
