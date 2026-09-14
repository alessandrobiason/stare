import { useCallback, useState } from "react";
import {
  allCategories,
  allSubcategories,
  SatelliteCategory,
  SatelliteSubcategory
} from "../satellite/categories";

/**
 * Which of the three tabs the app is showing.
 *
 * The sky is the app and the other two are what used to be drawn on top of it:
 * a catalog to look things up in, which is not built yet, and everything about
 * the app rather than about the sky. See `TabBar`.
 */
export type SceneTab = "sky" | "catalog" | "settings";

export type SceneControls = {
  /** Which tab is showing. The sky, because the sky is the app. */
  tab: SceneTab;
  setTab: (tab: SceneTab) => void;
  enabledCategories: Set<SatelliteCategory>;
  toggleCategory: (category: SatelliteCategory) => void;
  /**
   * Which subcategories are drawn, on top of whether their category is: a
   * switch each under the categories that are split (`SUBCATEGORIES_OF`).
   *
   * All on, because the default view is the sky as it is rather than an edited
   * one, and a constellation missing from a sky nobody has filtered is a bug
   * from where the person holding the phone is standing.
   */
  enabledSubcategories: Set<SatelliteSubcategory>;
  toggleSubcategory: (subcategory: SatelliteSubcategory) => void;
  /** Everything back on: every category and every subcategory with them. */
  enableAllCategories: () => void;
  /**
   * Whether the filter panel is down from its button in the header.
   *
   * Here rather than inside the panel, because the control that opens it is
   * somewhere else on the screen — the layers button in the header — and
   * because leaving the sky has to put it away (`setTab`).
   */
  filterOpen: boolean;
  toggleFilter: () => void;
  /**
   * Which of the two view modes is running: normal, or normal plus the debug
   * overlays. Off on open — debug is what someone asks for, not what they land in.
   */
  debug: boolean;
  toggleDebug: () => void;
  /**
   * Opens the console, from the settings tab it is listed on.
   *
   * Two things at once, which is why it is not `toggleDebug`: the console draws
   * its overlays over the camera picture — the sky mask, the marker figures —
   * and opening it from a sheet that covers that picture would put a page of
   * readings about a view nobody can see over a view nobody can see.
   */
  openConsole: () => void;
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
 * The controls both scenes carry: which tab is up, which categories are drawn,
 * whether the filter panel is open, whether the debug overlays are up, and
 * whether the guide is open over all of it. The same sky either way, so the
 * same controls — a phone and the replay behave identically.
 *
 * What the sky itself is showing is not here. The count and its breakdown are
 * read from the frame loop and drawn in the header a few nodes away
 * (`SkyOverlay`, `SkyHeader`), so they never leave the view that produces
 * them.
 */
export function useSceneControls(): SceneControls {
  const [tab, setTabState] = useState<SceneTab>("sky");
  const [enabledCategories, setEnabledCategories] =
    useState<Set<SatelliteCategory>>(allCategories);
  const [enabledSubcategories, setEnabledSubcategories] =
    useState<Set<SatelliteSubcategory>>(allSubcategories);
  const [filterOpen, setFilterOpen] = useState(false);
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

  const toggleSubcategory = useCallback((subcategory: SatelliteSubcategory) => {
    setEnabledSubcategories((current) => {
      const next = new Set(current);
      if (!next.delete(subcategory)) next.add(subcategory);
      return next;
    });
  }, []);

  const enableAllCategories = useCallback(() => {
    setEnabledCategories(allCategories());
    setEnabledSubcategories(allSubcategories());
  }, []);
  const toggleFilter = useCallback(() => setFilterOpen((open) => !open), []);
  /**
   * Leaving the sky puts the filter away with it: the panel hangs off a button
   * that is no longer on the screen, and coming back to a sheet nobody opened
   * is a view that remembers the wrong thing.
   */
  const setTab = useCallback((next: SceneTab) => {
    setTabState(next);
    setFilterOpen(false);
  }, []);
  const toggleDebug = useCallback(() => setDebug((on) => !on), []);
  const openConsole = useCallback(() => {
    setTabState("sky");
    setDebug(true);
  }, []);
  const openGuide = useCallback(() => setGuide(true), []);
  const closeGuide = useCallback(() => setGuide(false), []);
  const toggleSkyMaskFiltering = useCallback(() => setSkyMaskFiltering((on) => !on), []);
  const toggleCelestialAlignment = useCallback(() => setCelestialAlignment((on) => !on), []);

  return {
    tab,
    setTab,
    enabledCategories,
    toggleCategory,
    enabledSubcategories,
    toggleSubcategory,
    enableAllCategories,
    filterOpen,
    toggleFilter,
    debug,
    toggleDebug,
    openConsole,
    guide,
    openGuide,
    closeGuide,
    skyMaskFiltering,
    toggleSkyMaskFiltering,
    celestialAlignment,
    toggleCelestialAlignment
  };
}
