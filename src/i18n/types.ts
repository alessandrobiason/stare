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
   * The boot screen's own two pages, shown once on the very first launch
   * before anything else: what the app does, and the three permissions the
   * phone is about to ask for — two it cannot open without, and the
   * notifications it can. See `IntroScreen`.
   */
  intro: IntroStrings;
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
    /** The catalogue as a list, to look things up in by name. */
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
     * The small line under a notable satellite's name on the sky, saying which
     * category it is standing in for — one satellite is named per category
     * currently on the frame (`NotableSatellites`).
     *
     * Short: it is set in the box a label is drawn in, under a name that
     * already fills it. A navigation satellite says which system it belongs to
     * instead where that has a name (GPS, Galileo), so `NAVIGATION` here is
     * only the fallback for the ones that do not.
     */
    notable: Record<Exclude<SatelliteCategory, "LANDMARK">, string>;
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
    /**
     * The button beside the filter that holds the view still, so a sky overhead
     * can be read with the phone lowered (`SceneControls.frozen`).
     */
    freeze: {
      /** What the button does while the view is live, for a screen reader. */
      freeze: string;
      /** And while it is frozen. */
      resume: string;
      /**
       * The small line under the count while the view is held, so a still sky
       * is not taken for a hung app. `{time}`, a clock time. Short: it is a pill
       * over the sky.
       */
      frozenAt: string;
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
    /**
     * The next pass that can be seen with the naked eye, within the next day.
     * `{time}`, the clock time it is highest.
     *
     * A line of its own under the seeing line, which answers about now; this
     * answers whether the object is worth going outside for later. Where to
     * stand and how bright it will be are appended to it, in the words the
     * passes panel uses for the same pass. See `sightingLine`.
     */
    sighting: string;
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
   * The catalog tab: the whole catalogue as something to look things up in.
   *
   * The sky view answers "what is above me now", and the question it cannot
   * answer is "where is the thing I came looking for" — an object below the
   * horizon has no mark to tap, and at any moment most of the catalogue is
   * below it. So the tab is a list rather than a picture: the fleets under the
   * six headings the sky is coloured by, a search across every name, and one
   * line per object saying which way to turn to face it.
   *
   * Most of what it says is not here. The headings are the filter's own
   * category names, a row's position is `lookDirection`, and the fleet names
   * are the names their operators gave them and are not translated — see
   * `src/satellite/fleets.ts`. What is here is the screen's own handful of
   * sentences. Its title is `tabs.catalog`.
   */
  catalog: {
    /** The line under the title: what this list is, and what tapping does. */
    about: string;
    /** The search field, when nothing has been typed into it. */
    search: string;
    /**
     * How many objects a fleet has, at the end of its row. `{count}`.
     *
     * A phrase rather than a noun that would have to agree with the number:
     * this table has no plural forms in it and is not the place to start — see
     * `fill`. "1 in orbit" and "7,914 in orbit" are both right.
     */
    objects: string;
    /**
     * How much of an opened fleet is up. `{count}`, `{total}`.
     *
     * The answer the screen exists to give about a fleet: the list underneath
     * is what is over the horizon, and this is what that is out of.
     */
    above: string;
    /** A fleet with nothing over the horizon, which is the common case. */
    noneAbove: string;
    /** Said when a fleet has more up than the list will show. `{count}`. */
    highest: string;
    /** While the first scan of a list is still running. See `locateAll`. */
    working: string;
    /** A search that matched nothing at all. */
    noMatch: string;
    /** The way back out of a fleet, for a screen reader. */
    back: string;
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
  /**
   * The alerts row in settings, and the words a notification carries.
   *
   * The one thing the app says when nobody is looking at it — a pass that can
   * be seen, ten minutes before it comes up (`src/satellite/passAlerts.ts`).
   * The row's line under it says something different in each of the three
   * states the permission can be in, because what somebody needs to be told
   * differs: what they would get, that they are getting it, or that the phone
   * is holding it back and where to change that.
   *
   * The figures in the notification itself are not here. A bearing is a compass
   * point, a height is `units.up` and the verdict is `scene.passes.seeing` —
   * all of them already written, and all meaning the same thing on a lock
   * screen as in the row about the same pass.
   */
  alerts: {
    /** Names the settings row. */
    title: string;
    /** What the row says it is worth, at the right-hand end: on, or off. */
    on: string;
    off: string;
    /** The line under the row, once the phone is letting the alerts through. */
    granted: string;
    /** The same line before anyone has been asked: what turning it on gets. */
    undetermined: string;
    /** And once it has been refused, which is a trip to the phone's settings. */
    denied: string;
    /** What a notification says. `{name}` and `{minutes}` until it comes up. */
    notification: {
      title: string;
    };
  };
  /**
   * The last row in settings, and the list it opens: who made the app, where
   * its source is, and which version this is. The name and the address
   * themselves are not words and are not here (`SettingsScreen`).
   */
  about: {
    title: string;
    /** The line under the row, saying what is behind it. */
    detail: string;
    author: string;
    project: string;
    version: string;
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
    /** A landmark: the halo, the name, and the dashed line of its pass. */
    landmark: TourKeyStrings;
  };
  /** The count under the app's name, which opens into what those marks are. */
  count: TourStepStrings;
  /** The layers button in the header. */
  filter: TourStepStrings;
  /** The freeze button beside it, which a pause sign alone does not explain. */
  freeze: TourStepStrings;
  /** The passes card over the tab bar. Skipped when there is none on screen. */
  passes: TourStepStrings;
  /** The catalog tab: any object looked up by name, risen or not. */
  catalog: TourStepStrings;
  /**
   * The settings tab, which ends the tour. Said in general terms rather than
   * as a list of its rows, which grow and would leave this sentence behind.
   */
  settings: TourStepStrings;
};

export type TourStepStrings = {
  /** A word or two. */
  title: string;
  /** One sentence, two at most. */
  body: string;
};

export type IntroStrings = {
  /** The first page, under the app's name: what it does, in a sentence or two. */
  what: {
    body: string;
  };
  /** The second page: the three things the phone is about to ask permission for. */
  access: {
    title: string;
    body?: string;
    camera: IntroAccessStrings;
    location: IntroAccessStrings;
    /**
     * The one of the three the app opens without, and the only one worth
     * anything while the app is shut: a notification before a pass that can
     * actually be seen. Said to be optional in the same breath, because it is —
     * a refusal costs the alerts and nothing else. See `src/notifications/`.
     */
    notifications: IntroAccessStrings;
    /** A short line under all three, on where the location goes. */
    footnote: string;
  };
  /** The button on every page but the last. */
  next: string;
  /** The last page's button: accepting it is what lets boot begin. */
  allowAccess: string;
};

/** One thing the operating system will ask about, and why the app needs it. */
export type IntroAccessStrings = {
  name: string;
  reason: string;
};

export type TourKeyStrings = {
  /** A word or two for the kind of mark. It heads a row beside a drawing. */
  name: string;
  /** What that kind of mark means. */
  meaning: string;
};
