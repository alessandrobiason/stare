import { useCallback, useState } from "react";
import { allCategories, SatelliteCategory } from "../satellite/categories";

export type SceneControls = {
  enabledCategories: Set<SatelliteCategory>;
  toggleCategory: (category: SatelliteCategory) => void;
  enableAllCategories: () => void;
  /** Reported from the render loop; React bails out when the value is unchanged. */
  markerCount: number;
  setMarkerCount: (count: number) => void;
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
};

/**
 * The controls both scenes carry: which categories are drawn, how many markers
 * the last frame placed, and whether the debug overlays are up. The same sky
 * either way, so the same controls — a phone and the replay behave identically.
 */
export function useSceneControls(): SceneControls {
  const [enabledCategories, setEnabledCategories] =
    useState<Set<SatelliteCategory>>(allCategories);
  const [markerCount, setMarkerCount] = useState(0);
  const [debug, setDebug] = useState(false);
  const [skyMaskFiltering, setSkyMaskFiltering] = useState(true);

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

  return {
    enabledCategories,
    toggleCategory,
    enableAllCategories,
    markerCount,
    setMarkerCount,
    debug,
    toggleDebug,
    skyMaskFiltering,
    toggleSkyMaskFiltering
  };
}
