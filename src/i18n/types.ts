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
