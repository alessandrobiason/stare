import { useCallback, useState } from "react";
import { allCategories, SatelliteCategory } from "../satellite/categories";
import { SkySummary } from "./useAnimatedMarkers";

export type SceneControls = {
  enabledCategories: Set<SatelliteCategory>;
  toggleCategory: (category: SatelliteCategory) => void;
  /**
   * Whether Starlink is drawn. Its own switch rather than a sixth category,
   * because it is not a sixth purpose — see `isStarlink`.
   *
   * On, because the default view is the sky as it is rather than an edited one,
   * and a constellation missing from a sky nobody has filtered is a bug from
   * where the person holding the phone is standing.
   */
  starlink: boolean;
  toggleStarlink: () => void;
  /** Everything back on: the five categories and Starlink with them. */
  enableAllCategories: () => void;
  /**
   * What the last frame put on screen, and whether any of it can be seen.
   *
   * Reported from the render loop; React bails out when the object is
   * unchanged, which the loop arranges by publishing only on a real change
   * (`SkySummary`). One value rather than the count and the breakdown
   * separately: they are worked out on the same tick from the same marks, and
   * handed over apart they would be two state updates for one fact, with a
   * render in between showing a count its own breakdown disagreed with.
   */
  sky: SkySummary;
  setSky: (summary: SkySummary) => void;
  /**
   * Which of the two view modes is running: normal, or normal plus the debug
   * overlays. Off on open — debug is what someone asks for, not what they land in.
   */
  debug: boolean;
  toggleDebug: () => void;
  /**
   * Whether the guide is open over the view: the intro's pages about reading
   * the screen, brought back by the `?` above the console toggle
   * (`GuideToggle`). Shut on open, like the console — it is something asked for.
   *
   * Opened and closed rather than toggled, because no one control does both:
   * the `?` is underneath the guide while it is up, and the ways out are the
   * guide's own corner and its last page.
   */
  guide: boolean;
  openGuide: () => void;
  closeGuide: () => void;
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

/**
 * Nothing counted yet: what a scene shows before its first frame.
 *
 * Daylight rather than dark, because the panel says something different in each
 * and the empty sky before boot has finished should not be claiming the sun is
 * down. The first frame replaces it a sixtieth of a second later.
 */
const NO_SKY: SkySummary = {
  count: 0,
  fleets: { rows: [], other: 0 },
  sunlit: 0,
  darkness: "daylight"
};

/**
 * The controls both scenes carry: which categories are drawn, how many markers
 * the last frame placed and what they are, whether the debug overlays are up,
 * and whether the guide is open over all of it. The same sky either way, so the
 * same controls — a phone and the replay behave identically.
 */
export function useSceneControls(): SceneControls {
  const [enabledCategories, setEnabledCategories] =
    useState<Set<SatelliteCategory>>(allCategories);
  const [starlink, setStarlink] = useState(true);
  const [sky, setSky] = useState<SkySummary>(NO_SKY);
  const [debug, setDebug] = useState(false);
  const [guide, setGuide] = useState(false);
  const [skyMaskFiltering, setSkyMaskFiltering] = useState(true);
  const [celestialAlignment, setCelestialAlignment] = useState(true);

  const toggleCategory = useCallback((category: SatelliteCategory) => {
    setEnabledCategories((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  }, []);

  const toggleStarlink = useCallback(() => setStarlink((on) => !on), []);

  const enableAllCategories = useCallback(() => {
    setEnabledCategories(allCategories());
    setStarlink(true);
  }, []);
  const toggleDebug = useCallback(() => setDebug((on) => !on), []);
  const openGuide = useCallback(() => setGuide(true), []);
  const closeGuide = useCallback(() => setGuide(false), []);
  const toggleSkyMaskFiltering = useCallback(() => setSkyMaskFiltering((on) => !on), []);
  const toggleCelestialAlignment = useCallback(() => setCelestialAlignment((on) => !on), []);

  return {
    enabledCategories,
    toggleCategory,
    starlink,
    toggleStarlink,
    enableAllCategories,
    sky,
    setSky,
    debug,
    toggleDebug,
    guide,
    openGuide,
    closeGuide,
    skyMaskFiltering,
    toggleSkyMaskFiltering,
    celestialAlignment,
    toggleCelestialAlignment
  };
}
