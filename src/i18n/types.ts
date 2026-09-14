import type { SatelliteCategory, SatelliteSubcategory } from "../satellite/categories";

/**
 * Everything the app says, as data.
 *
 * One shape, two implementations. Pure data rather than functions —
 * placeholders are written `{like_this}` and filled by `fill` — so a language
 * file is a thing to read and diff rather than a thing to run, and so the
 * suite can walk every table and check that what each one says still fits the
 * space the panel gives it.
 *
 * The type is exhaustive on purpose: a new string added here fails to compile
 * in the other file until it has been written there too. That is the whole
 * mechanism keeping the translations from drifting into a half-English screen.
 */
export type Strings = {
  /**
   * The tour of the sky view: a few steps over the live screen, each pointing at
   * the control it is about (`GuideTour`). Shown on the first launch, and again
   * from the Help row in the settings tab.
   *
   * Short on purpose. Every step is read with the thing it describes lit up
   * beside it, so a step says what is not obvious from looking — never what the
   * control is called or where it is.
   */
  tour: TourStrings;
  /**
   * The three tabs along the bottom: the sky, the catalog, and everything
   * about the app rather than about the sky.
   *
   * One word each. They are read under an icon in a bar a third of a screen
   * wide, so a phrase does not fit and does not need to: what is behind each
   * of them is either obvious or is titled again at the top of its own page.
   */
  tabs: {
    /** The camera with the catalog drawn over it, which is the app. */
    sky: string;
    /** The catalog to look things up in, which is not built yet. */
    catalog: string;
    /** The guide, the language and the console. See `SettingsScreen`. */
    settings: string;
  };
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
    /**
     * The small line under a notable satellite's name on the sky, saying why
     * that one out of hundreds is named (`NotableSatellites`).
     *
     * Short: it is set in the box a label is drawn in, under a name that
     * already fills it. A navigation satellite says which system it belongs to
     * instead where that has a name (GPS, Galileo), so `navigation` is only the
     * fallback for the ones that do not.
     */
    notable: {
      /** The nearest satellite above the horizon. */
      closest: string;
      /** The farthest. */
      farthest: string;
      /** A navigation satellite of a system with no name worth printing. */
      navigation: string;
    };
    /**
     * Whether any of what is drawn can actually be seen, which is the thing a
     * count of markers cannot say on its own.
     *
     * A satellite is sunlight bounced off metal, so it needs the sun on it and
     * darkness underneath it. A sky drawn full of marks at noon has nothing in
     * it to look at, and so does a night sky whose objects are all in the
     * Earth's shadow — and until this panel said one of these, the number in
     * the corner was the same in both cases as on a clear evening with the
     * station coming over. See `src/satellite/illumination.ts`.
     */
    sunlight: {
      /** The sun is up here, so nothing overhead can be picked out of the sky. */
      daylight: string;
      /** Dark here, but every mark on the frame is in the Earth's shadow. */
      none: string;
      /** Dark here, and some of them are lit. `{count}`. */
      some: string;
      /** Dark here, and all of them are lit. */
      all: string;
    };
    /**
     * What is coming: the landmarks about to cross the sky, and when.
     *
     * The overlay's other panels are both about the present tense — this many
     * marks are on the frame, these kinds may be drawn — and neither answers
     * the question somebody asks before the phone goes up at all: is anything
     * worth waiting for. The lines on the sky have always known, and for most
     * of the three hours they cover they are drawn on sky the camera is not
     * pointed at. See `src/satellite/upcomingPasses.ts`.
     *
     * The figures are not here. A countdown is `units.minutes` and
     * `units.hoursMinutes`, a bearing is a compass point and a height is
     * `units.up` — all of them already written, and all of them meaning the
     * same thing in a row about a pass as on the card.
     */
    passes: {
      /** The panel's title, open. Short: it is a pill over the sky. */
      title: string;
      /** What the pill is, for a screen reader. */
      open: string;
      /**
       * A pass already under way, in place of a countdown to it.
       *
       * The object is up: there is nothing to wait for, and a countdown to a
       * rise that has happened would be counting the wrong way.
       */
      now: string;
      /**
       * Whether the pass can be seen, in the few words a row has for it.
       *
       * The same six verdicts the card gives in a sentence (`card.seeing`),
       * said short enough to sit under a name and a time. Both are needed: the
       * card is prose about the object under the finger and this is a column
       * in a list, and a sentence set at nine points over a photograph is a
       * paragraph over the sky.
       *
       * They are not decoration. A countdown is a promise, and most of the
       * passes a plan finds are geometry rather than sightings — the sun is up,
       * or the object is in the Earth's shadow when it crosses. This is the
       * line that keeps the panel from sending somebody outside to look at
       * nothing.
       */
      seeing: Record<PassSeeing, string>;
    };
    /**
     * The strip of cardinal points along the bottom of the picture.
     *
     * The letters on it are `compass` below — the same eight the card gives
     * bearings in, so `SE` on the card and `SE` on the strip are the same
     * letters in every language. This is the one sentence that is not a
     * letter: what the strip says to somebody who is not looking at it.
     */
    compass: {
      /** Which way the camera is pointing. `{point}`, from `compass`. */
      facing: string;
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
    /**
     * And why half the marks on a clear night are drawn faintly.
     *
     * The only channel a mark spends on something other than where the object
     * is. An object in the Earth's shadow has no sunlight to throw back and
     * cannot be seen however clear the sky is, so it is drawn at half strength;
     * without this line that is a difference somebody can see and not account
     * for. See `src/components/markerScene.ts`.
     */
    shadowKey: string;
    categories: Record<SatelliteCategory, string>;
    /**
     * The parts a split category is divided into, each a row under its
     * category. Upper-cased like the categories. `STARLINK` is the operator's
     * own name and the same in every language.
     */
    subcategories: Record<SatelliteSubcategory, string>;
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
    /**
     * Whether this object can be seen from here, right now.
     *
     * The question the card exists to lead up to, and the one the overlay could
     * not answer at all until the sun was brought into it. It sits between what
     * the thing *is* and where it is, because that is the order somebody who
     * has just tapped a mark asks in: what is that, can I see it, where do I
     * look. See `src/satellite/nakedEye.ts` for what decides which of these is
     * shown.
     */
    seeing: {
      /** Lit, dark here, and bright enough to find by eye. */
      visible: string;
      /** Lit and dark here, but past what an unaided eye picks up. */
      binoculars: string;
      /** Lit and dark here, and far below anything but a telescope. */
      tooFaint: string;
      /** In the Earth's shadow: no sunlight on it, so nothing to see. */
      eclipsed: string;
      /** The sun is up here, which rules out the whole sky rather than this one object. */
      daylight: string;
      /** Lit, but nobody has recorded how reflective this object is. */
      unknown: string;
      /**
       * The brightness itself, appended to the three cases that have one.
       * `{value}`, and smaller means brighter — the scale runs backwards.
       */
      magnitude: string;
      /**
       * The same where the figure is inferred from the size and class of the
       * spacecraft rather than measured. `{value}`.
       *
       * A separate string rather than a word bolted onto the one above, because
       * hedging a number is not a prefix in every language. See
       * `src/satellite/standardMagnitude.ts` for which objects get which.
       */
      aboutMagnitude: string;
      /**
       * The same question about a pass that has not begun. `{time}`, `{verdict}`.
       *
       * Every other line on the card is resolved at the instant it is drawn,
       * which is the right tense for an object on the frame and the wrong one
       * for an object still under the horizon — and between now and a pass
       * three hours out, the sun is what moves most. So a card opened from the
       * upcoming-passes list answers about the pass instead, and names the
       * clock time it is answering about, which is what makes the tense
       * readable rather than merely correct.
       *
       * `{verdict}` is filled from `scene.passes.seeing` — those are fragments
       * with no tense of their own, which is exactly what a clause about half
       * past nine needs. The card's own six above are present-tense sentences
       * and cannot go here. See `seeingOnPass`.
       */
      onPass: string;
    };
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
   * The catalog tab, which is a promise rather than a feature.
   *
   * The sky view answers "what is above me now", and the question it cannot
   * answer is "where is the thing I came looking for" — an object below the
   * horizon has no mark to tap. That is what the tab is for, and this is the
   * line it carries until it is built. Its title is `tabs.catalog`.
   */
  catalog: {
    /** What will be there, and that it is not there yet. */
    soon: string;
  };
  /**
   * The language row in the settings tab.
   *
   * One word, because the languages themselves are not translated — a list of
   * endonyms is the one list that reads the same whichever language it is
   * currently in (`LANGUAGE_NAMES`). This is what says what the list is *for*.
   */
  language: {
    /** Names the settings row, and heads the list it opens. */
    title: string;
  };
  /** The line under the console's row in settings. The console itself is English only. */
  console: {
    detail: string;
  };
};

type Notice = { title: string; detail: string };

/**
 * The verdicts a row about a pass can carry.
 *
 * `NakedEyeVerdict` itself, spelled out here rather than imported, for the same
 * reason `SatelliteCategory` is imported and this is not: the categories are a
 * list the app draws from, and this is the app's own answer to one question. A
 * verdict added there and not here fails to compile, which is the check worth
 * having either way.
 */
type PassSeeing = "visible" | "binoculars" | "tooFaint" | "eclipsed" | "daylight" | "unknown";

export type TourStrings = {
  /** The settings row that opens the tour again, and the line under it. */
  open: string;
  about: string;
  /** Which step this is. `{step}`, `{count}`. */
  step: string;
  next: string;
  skip: string;
  /** The last step's button. */
  done: string;
  /**
   * The one step with nothing to point at: the marks are wherever the sky puts
   * them. So it is a key instead, each kind of mark drawn by the sky's own
   * renderer beside what it means (`MarkTile`).
   */
  marks: {
    title: string;
    body: string;
    /** A body and its tail, near and far. */
    moving: TourKeyStrings;
    /** The geostationary belt: rings that never move. */
    parked: TourKeyStrings;
    /** The same mark in sunlight and in the Earth's shadow. */
    shadow: TourKeyStrings;
    /** A landmark: the halo, the name, and the dashed line of its pass. */
    landmark: TourKeyStrings;
  };
  /** The count under the app's name, which opens into what those marks are. */
  count: TourStepStrings;
  /** The layers button in the header. */
  filter: TourStepStrings;
  /** The passes card over the tab bar. Skipped when there is none on screen. */
  passes: TourStepStrings;
  /** The settings tab. */
  settings: TourStepStrings;
};

export type TourStepStrings = {
  /** A word or two. */
  title: string;
  /** One sentence, two at most. */
  body: string;
};

export type TourKeyStrings = {
  /** A word or two for the kind of mark. It heads a row beside a drawing. */
  name: string;
  /** What that kind of mark means. */
  meaning: string;
};
