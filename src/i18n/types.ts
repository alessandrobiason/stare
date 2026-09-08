import type { SatelliteCategory } from "../satellite/categories";

/**
 * Everything the app says, as data.
 *
 * One shape, twelve implementations. Pure data rather than functions —
 * placeholders are written `{like_this}` and filled by `fill` — so a language
 * file is a thing to read and diff rather than a thing to run, and so the
 * suite can walk every table and check that what each one says still fits the
 * space the panel gives it.
 *
 * The type is exhaustive on purpose: a new string added here fails to compile
 * in eleven files until it has been written in all of them. That is the whole
 * mechanism keeping the translations from drifting into a half-English screen.
 */
export type Strings = {
  intro: IntroStrings;
  scene: {
    /** What the marker count says to a screen reader. `{count}`. */
    visibleSatellites: string;
    /** The overlay the marks are drawn into. */
    markers: string;
    /**
     * What the marker count opens into: the fleets on the frame, and how many
     * of each.
     *
     * The fleet names themselves are not here. They are the names their
     * operators gave them — Starlink, Iridium, the ISS — and there is no
     * translation of those; see `src/satellite/fleets.ts`. What is here is the
     * panel's own three words: what it is, what it says when the sky is empty,
     * and what it calls everything too small or too unfamiliar to name.
     */
    breakdown: {
      /** The panel's title. Short: it is a pill over the sky, like the filter. */
      title: string;
      /** No markers at all — a filtered sky, a clouded one, or a wall. */
      empty: string;
      /** The last row: fleets with no name worth printing, and the long tail. */
      other: string;
    };
  };
  filter: {
    /** The panel's own title, closed and open. Short: it is a pill over the sky. */
    title: string;
    /** What the pill is, for a screen reader. */
    open: string;
    showAll: string;
    /** Why a quarter of a southward sky is rings that never move. */
    ringKey: string;
    categories: Record<SatelliteCategory, string>;
  };
  card: {
    details: string;
    close: string;
    /** Appended to the category of an object parked over the equator. */
    holdsStation: string;
    /** The link out to the operator's own page. `{site}`. */
    openSite: string;
    /**
     * What the photograph of a landmark is, for a screen reader. `{name}`.
     *
     * Never seen: the picture is the picture. It names the object rather than
     * describing the image, because what is on screen is a photograph of a thing
     * the card has just named, and no fixed sentence can describe a picture
     * fetched at the moment of the tap.
     */
    photo: string;
    /** The catalog is reloaded underneath an open card, and objects leave it. */
    missing: string;
    facts: {
      distance: string;
      altitude: string;
      speed: string;
      look: string;
      orbit: string;
    };
  };
  units: {
    /** `{value}` is already grouped for the locale. */
    km: string;
    kmPerSecond: string;
    minutes: string;
    hoursMinutes: string;
    /** How far above the horizon. `{degrees}`. */
    up: string;
    /** The same for an object that has set. `{degrees}`, unsigned. */
    below: string;
    /** Stands in for a figure that is not a number. */
    unknown: string;
  };
  /**
   * The eight compass points, from north, clockwise.
   *
   * A bearing is given as a point as well as a number, because a number alone
   * is only useful to someone already holding a compass — and the letters are
   * the ones that language's compass actually uses: German turns east into O,
   * Dutch turns south into Z, and neither reads N/E/S/W.
   */
  compass: readonly [string, string, string, string, string, string, string, string];
  compassNotice: {
    calibrate: Notice;
    magnetic: Notice;
  };
  boot: {
    failed: string;
    tryAgain: string;
    unsupported: string;
  };
  /**
   * The language picker: the intro's top right corner, and the console.
   *
   * Two words, because the languages themselves are not translated — a list of
   * endonyms is the one list that reads the same whichever language it is
   * currently in (`LANGUAGE_NAMES`). These are what say what the list is *for*,
   * and they are mostly read by a screen reader rather than seen.
   */
  language: {
    /** Names the control, and heads the list it opens. */
    title: string;
    /** Dismissing that list without choosing. */
    close: string;
  };
};

type Notice = { title: string; detail: string };

export type IntroStrings = {
  /** The first page: the app's name is in the sky above it, so there is no title. */
  what: { body: string };
  /** The second: how to hold the phone, and what a mark on the sky is. */
  holding: { title: string; body: string };
  /**
   * The third: the panels around the marks.
   *
   * The one page that exists because a number in the corner of a camera view
   * says nothing about what it counts. Each entry is explained beside a copy of
   * the badge it wears on the real screen, and `where` names the corner it sits
   * in, since that is how someone finds it again afterwards.
   */
  screen: {
    title: string;
    body: string;
    count: IntroElementStrings;
    filter: IntroElementStrings;
    marker: IntroElementStrings;
    console: IntroElementStrings;
  };
  /** The last: what the phone is about to ask the operating system for. */
  access: {
    title: string;
    body: string;
    camera: IntroAccessStrings;
    location: IntroAccessStrings;
    footnote: string;
  };
  next: string;
  /** The last page's button, which is the one that lets the system prompts begin. */
  allowAccess: string;
};

export type IntroElementStrings = {
  /** Where on screen to look for it: "top left", and so on. */
  where: string;
  /** What it is and what it is worth. */
  meaning: string;
};

export type IntroAccessStrings = {
  /** As the system's own prompt names it, so the two read as the same request. */
  name: string;
  reason: string;
};
