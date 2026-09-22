import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Metrics, SafeAreaProvider } from "react-native-safe-area-context";
import { CatalogScreen } from "../src/components/CatalogScreen";
import { CatalogNotice } from "../src/components/CatalogNotice";
import { CategoryLegend } from "../src/components/CategoryLegend";
import { CompassNotice } from "../src/components/CompassNotice";
import { FindInSky } from "../src/components/FindInSky";
import { compassMarks, nearestPoint } from "../src/components/HorizonCompass";
import { SatelliteCard } from "../src/components/SatelliteCard";
import { SkyHeader } from "../src/components/SkyHeader";
import { TabBar } from "../src/components/TabBar";
import { introPages } from "../src/components/IntroScreen";
import { SettingsScreen } from "../src/components/SettingsScreen";
import { CONSOLE_LABEL } from "../src/components/consoleLabel";
import { UpcomingPasses } from "../src/components/UpcomingPasses";
import { fill, setLocaleForTesting, strings } from "../src/i18n";
import { setPassAlertAccessForTesting } from "../src/notifications/alertAccess";
import { UpcomingPass } from "../src/satellite/upcomingPasses";
import {
  clearLandmarkPhotosForTesting,
  loadLandmarkPhoto
} from "../src/satellite/landmarkPhotos";
import { SkySummary } from "../src/hooks/useAnimatedMarkers";
import { GroundTrackPlan } from "../src/hooks/useGroundTrack";
import { groundTrackFor } from "../src/satellite/groundTrack";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { BREAKDOWN_ROWS, FleetBreakdown, tallyFleets } from "../src/satellite/fleets";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import { SatelliteCatalog } from "../src/satellite/catalog";
import {
  allCategories,
  allSubcategories,
  SatelliteCategory
} from "../src/satellite/categories";
import { SatelliteDetail, Tle } from "../src/types";

/** A phone with nothing to inset, for the pieces that read the safe area. */
const NO_INSETS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 }
};

/** The rendered overlay as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function legend(enabled = allCategories(), subcategories = allSubcategories(), open = true) {
  return (
    <CategoryLegend
      open={open}
      enabledCategories={enabled}
      onToggleCategory={() => undefined}
      enabledSubcategories={subcategories}
      onToggleSubcategory={() => undefined}
      onEnableAll={() => undefined}
    />
  );
}

describe("the category filter", () => {
  test("is not on the screen until its button is pressed", () => {
    // The sky is what the screen is for; the list hangs off an icon in the
    // header, and until that is pressed there is nothing of it over the
    // picture at all — not even the word FILTER, which used to sit there.
    const text = textOf(legend(allCategories(), allSubcategories(), false));

    expect(text).toBe("");
  });

  test("opens onto the list, under its own title", () => {
    const text = textOf(legend());

    expect(text).toContain("FILTER");
    expect(text).toContain("NAVIGATION");
    expect(text).toContain("SHOW ALL");
  });

  test("says so when it is hiding something, so a thin sky reads as a setting", () => {
    const some = allCategories();
    some.delete("INTERNET");
    some.delete("OTHER");

    // Twelve switches, not six: every subcategory has one of its own in the
    // list, and the two under a category that is off count as off with it.
    expect(textOf(legend(some))).toContain("8/12");
    // Nothing to report while everything is drawn.
    expect(textOf(legend())).not.toContain("12/12");
  });

  test("counts Starlink among what it is hiding, since it is half the sky", () => {
    // A sky with every category on but Starlink off is still an edited sky,
    // and the panel has to say so or the missing half looks like a bug rather
    // than a setting.
    const subcategories = allSubcategories();
    subcategories.delete("STARLINK");
    expect(textOf(legend(allCategories(), subcategories))).toContain("11/12");
  });

  test("lists each split category's parts under it", () => {
    const text = textOf(legend());
    expect(text.indexOf("INTERNET")).toBeLessThan(text.indexOf("STARLINK"));
    expect(text.indexOf("STARLINK")).toBeLessThan(text.indexOf("OTHER NETWORKS"));
    expect(text.indexOf("OTHER NETWORKS")).toBeLessThan(text.indexOf("TV &amp; PHONES"));
    expect(text).toContain("PHONES &amp; IOT");
    expect(text).toContain("WEATHER");
  });

  test("says what it is to anyone not seeing it", () => {
    expect(renderToStaticMarkup(legend())).toContain('aria-label="Category filter"');
  });
});

/** A sky of `count` marks, all lit, under a dark sky unless told otherwise. */
const sky = (
  count: number,
  fleets: FleetBreakdown = { rows: [], other: 0 },
  over: Partial<SkySummary> = {}
): SkySummary => ({ count, fleets, sunlit: count, darkness: "dark", ...over });

describe("the header", () => {
  const NOTHING = { rows: [], other: 0 };
  const SKY = {
    rows: [
      { name: "Starlink", count: 10 },
      { name: "ISS", count: 1 }
    ],
    other: 6
  };

  /** A sky of `count` marks, all lit, under a dark sky unless told otherwise. */
  const sky = (count: number, fleets = SKY, over: Partial<SkySummary> = {}): SkySummary => ({
    count,
    fleets,
    sunlit: count,
    darkness: "dark",
    ...over
  });

  const header = (summary: SkySummary, frozenAt: Date | null = null) => (
    <SkyHeader
      sky={summary}
      filterOpen={false}
      onToggleFilter={() => undefined}
      frozen={frozenAt !== null}
      frozenAt={frozenAt}
      onToggleFrozen={() => undefined}
    />
  );

  test("is the app's name and what is over you, and nothing else", () => {
    // The breakdown is behind the tap: the line sits over a photograph of the
    // sky, and the sky is what the screen is for.
    const text = textOf(header(sky(17)));

    expect(text).toContain("STARE");
    expect(text).toContain("17 visible satellites");
    expect(text).not.toContain("Starlink");
    expect(text).not.toContain("IN VIEW");
  });

  test("has a freeze button beside the filter, which says when it is holding the view", () => {
    const live = renderToStaticMarkup(header(sky(17)));
    expect(live).toContain('aria-label="Freeze the view"');
    expect(live).toContain('aria-pressed="false"');
    expect(live).not.toContain("Frozen at");
    // Before the filter, so the filter keeps the corner.
    expect(live.indexOf("Freeze the view")).toBeLessThan(live.indexOf("Category filter"));

    const held = renderToStaticMarkup(header(sky(17), new Date(2026, 8, 14, 21, 43)));
    expect(held).toContain('aria-label="Resume the live view"');
    expect(held).toContain('aria-pressed="true"');
    expect(held).toMatch(/Frozen at 21[:.]43|Frozen at 9:43/);
  });

  test("the count is the control that opens the breakdown", () => {
    // The label the replay suite waits on to know the app has booted, and the
    // one thing that says what the number counts to anyone not reading it.
    const markup = renderToStaticMarkup(header(sky(17, NOTHING)));

    expect(markup).toContain('aria-label="17 visible satellites"');
    expect(markup).toContain('aria-expanded="false"');
  });

  test("the filter is a button rather than a word over the sky", () => {
    // What it opens says what it is (`CategoryLegend`); the button carries the
    // name only for a screen reader.
    expect(renderToStaticMarkup(header(sky(17)))).toContain('aria-label="Category filter"');
    expect(textOf(header(sky(17)))).not.toContain("FILTER");
  });
});

describe("the tab bar", () => {
  afterEach(() => setLocaleForTesting(undefined));

  // The bar reaches under the home indicator, so it reads the safe area — and
  // the provider that supplies it is the app root's (`src/App.tsx`).
  const bar = (warned = false) => (
    <SafeAreaProvider initialMetrics={NO_INSETS}>
      <TabBar tab="sky" onSelect={() => undefined} warned={warned} />
    </SafeAreaProvider>
  );

  test("is three words, in the reader's own language", () => {
    expect(textOf(bar())).toBe("Sky Catalog Settings");
    setLocaleForTesting("it");
    expect(textOf(bar())).toBe("Cielo Catalogo Impostazioni");
  });

  test("says which one is showing to anyone not seeing it", () => {
    const markup = renderToStaticMarkup(bar());

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
  });

  test("a degraded boot is a dot on the settings tab, not a paragraph", () => {
    // Boot's warnings last the whole session, so spelling them out means a
    // permanent paragraph over the sky on any phone missing a sensor. The dot
    // points at the console, which is the page that says what was degraded.
    expect(textOf(bar(true))).toBe(textOf(bar()));
    expect(renderToStaticMarkup(bar(true))).not.toBe(renderToStaticMarkup(bar()));
  });
});

describe("the settings tab", () => {
  afterEach(() => setLocaleForTesting(undefined));

  const settings = (
    <SettingsScreen onOpenGuide={() => undefined} onOpenConsole={() => undefined} />
  );

  test("carries the two controls that used to sit on the camera picture", () => {
    const text = textOf(settings);

    expect(text).toContain("Help");
    // The one word in the app that is not translated. See `CONSOLE_LABEL`.
    expect(text).toContain(CONSOLE_LABEL);
    expect(text).toContain("English");
  });

  test("and says it in the reader's own language", () => {
    setLocaleForTesting("it");
    const text = textOf(settings);

    expect(text).toContain("Impostazioni");
    expect(text).toContain("Aiuto");
    expect(text).toContain(CONSOLE_LABEL);
  });

  /**
   * The row for the one permission the app asks for and can be refused.
   *
   * It is not a switch of the app's own — iOS raises its prompt once per
   * install and the switch afterwards is the phone's — so what this row has to
   * do is say which of three states the permission is in, and lead to the one
   * place it can be changed from. See `usePassAlertAccess`.
   */
  describe("the pass alerts row", () => {
    afterEach(() => setPassAlertAccessForTesting(null));

    test("says the alerts are on, once the phone is letting them through", () => {
      setPassAlertAccessForTesting("granted");
      const text = textOf(settings);

      expect(text).toContain(strings().alerts.title);
      expect(text).toContain(strings().alerts.on);
      // A fragment of the line rather than the whole of it: the markup escapes
      // the apostrophe in "You'll", and what is under test is which of the
      // three lines the row chose.
      expect(text).toContain("before a pass you can see");
    });

    test("offers them where nobody has been asked yet", () => {
      setPassAlertAccessForTesting("undetermined");
      const text = textOf(settings);

      expect(text).toContain(strings().alerts.off);
      expect(text).toContain(strings().alerts.undetermined);
    });

    test("and points at the phone's own settings once it has been refused", () => {
      // The only door left. An app cannot put that prompt back on the screen,
      // and a row that pretended otherwise would be a row that does nothing.
      setPassAlertAccessForTesting("denied");
      const text = textOf(settings);

      expect(text).toContain(strings().alerts.off);
      expect(text).toContain(strings().alerts.denied);
    });

    test("and is not drawn at all where there are no notifications to have", () => {
      // The replay harness in a browser, and the moment before the platform
      // has answered for the first time. A row saying "off" that does nothing
      // when tapped is worse than no row.
      setPassAlertAccessForTesting("unsupported");
      expect(textOf(settings)).not.toContain(strings().alerts.title);

      setPassAlertAccessForTesting(null);
      expect(textOf(settings)).not.toContain(strings().alerts.title);
    });
  });
});

/**
 * The pages the app opens on the very first time it is run, which are the only
 * warning anybody gets before the operating system starts asking.
 *
 * Checked as a list rather than as a rendered screen: the pager measures itself
 * before it draws anything, and there is no layout in a test runner. What is
 * worth pinning here is not the typography — it is that a prompt the phone is
 * about to raise cannot be added without a line on this page explaining it.
 */
describe("the intro's access page", () => {
  afterEach(() => setLocaleForTesting(undefined));

  const accessPage = () => introPages().find((page) => page.access)?.access ?? [];

  test("names all three permissions, in the order they are asked for", () => {
    const t = strings().intro.access;

    expect(accessPage()).toEqual([t.camera, t.location, t.notifications]);
  });

  test("each with a name and a reason for it", () => {
    for (const access of accessPage()) {
      expect(access.name.trim()).not.toBe("");
      expect(access.reason.trim()).not.toBe("");
    }
  });

  test("and says the notifications are the optional one", () => {
    // The two above it are what the view is made of; this one is an offer, and
    // the page it is read on is the only place that can say so before the
    // prompt arrives.
    expect(strings().intro.access.notifications.name.toLowerCase()).toContain("optional");
    setLocaleForTesting("it");
    expect(strings().intro.access.notifications.name.toLowerCase()).toContain("facoltativo");
  });
});

describe("the compass strip", () => {
  afterEach(() => setLocaleForTesting(undefined));

  test("lights the point the camera is nearest, halfway between one and the next", () => {
    // At 22.5° off north the phone is as near north-east as north, so that is
    // where the emphasis changes hands.
    expect(nearestPoint(0)).toBe(0);
    expect(nearestPoint(22)).toBe(0);
    expect(nearestPoint(23)).toBe(1);
    expect(nearestPoint(180)).toBe(4);
    // Round the back, and past it: a heading is not promised to be wrapped.
    expect(nearestPoint(359)).toBe(0);
    expect(nearestPoint(-46)).toBe(7);
    expect(nearestPoint(405)).toBe(1);
  });

  test("lays the points out at their own bearings, three rings of them", () => {
    // One ring either side of the one in use, so a heading near north has
    // points on both sides of the marker rather than a gap where the track ran
    // out. Two points a right angle apart are twice the spacing of two
    // adjacent ones, whatever the scale.
    const marks = compassMarks(strings().compass, 2);

    expect(marks).toHaveLength(24);
    const middle = marks.filter((mark) => mark.key.startsWith("0:"));
    expect(middle.map((mark) => mark.label)).toEqual([...strings().compass]);
    expect(middle[2].x - middle[0].x).toBe(2 * (middle[1].x - middle[0].x));
    // The ring before and the ring after are a full turn away.
    expect(marks[0].x).toBe(middle[0].x - 360 * 2);
  });

  test("is the letters that language's compass uses", () => {
    // Italian turns west into O; the strip reads from the same table the
    // card's bearings do.
    setLocaleForTesting("it");
    expect(compassMarks(strings().compass, 1).map((mark) => mark.label)).toContain("O");
  });

  test("says which way the phone is pointing, for anyone not seeing it", () => {
    setLocaleForTesting("it");
    expect(fill(strings().scene.compass.facing, { point: strings().compass[6] })).toBe(
      "Direzione O"
    );
  });

  test("nothing at all is drawn before it has been laid out", () => {
    // No width, no scale, no marks: the strip is placed against its own width
    // and there is nothing to place until the first layout arrives.
    expect(compassMarks(strings().compass, 0)).toEqual([]);
  });
});

describe("what the count breaks down into", () => {
  test("names the fleets on the frame, largest first, and counts the rest", () => {
    // The question the number provokes and cannot answer on its own. A tally
    // that came to less than the count above it would read as a fault in one of
    // the two, so the unnamed remainder is a row rather than a silence.
    const breakdown = tallyFleets([
      { name: "STARLINK-1007" },
      { name: "ISS" },
      { name: "STARLINK-4123" },
      { name: "COSMOS 2251" },
      { name: "ONEWEB-0288" },
      { name: "GJZ 01" }
    ]);

    expect(breakdown.rows).toEqual([
      { name: "Starlink", count: 2 },
      { name: "ISS", count: 1 },
      { name: "Kosmos", count: 1 },
      { name: "OneWeb", count: 1 }
    ]);
    expect(breakdown.other).toBe(1);
  });

  test("equal fleets keep a stable order, so the list does not shuffle itself", () => {
    // The tally is rebuilt four times a second. Two fleets of one marker each
    // ordered by whatever came out of the loop first is a list that reorders
    // under the finger reading it.
    const names = [{ name: "ISS" }, { name: "ONEWEB-1" }, { name: "GPS BIIR-2" }];
    const forwards = tallyFleets(names).rows.map((row) => row.name);

    expect(forwards).toEqual(["GPS", "ISS", "OneWeb"]);
    expect(tallyFleets([...names].reverse()).rows.map((row) => row.name)).toEqual(forwards);
  });

  test("lumps the long tail rather than papering the sky with ones and twos", () => {
    const many = [
      ...Array.from({ length: 9 }, () => ({ name: "STARLINK-1" })),
      { name: "ONEWEB-1" },
      { name: "GPS BIIR-2" },
      { name: "GALILEO 5" },
      { name: "GLONASS 1" },
      { name: "BEIDOU-3 M1" },
      { name: "IRIDIUM 100" },
      { name: "LEMUR-2 A" },
      { name: "ICEYE-X1" },
      { name: "CAPELLA-3" },
      { name: "UMBRA-04" }
    ];
    const breakdown = tallyFleets(many);

    expect(breakdown.rows).toHaveLength(BREAKDOWN_ROWS);
    // Everything still adds up to the number the corner is showing.
    const counted = breakdown.rows.reduce((total, row) => total + row.count, 0);
    expect(counted + breakdown.other).toBe(many.length);
  });

  test("is behind the count rather than under it", () => {
    const header = renderToStaticMarkup(
      <SkyHeader
        sky={sky(17, { rows: [{ name: "Starlink", count: 10 }], other: 7 })}
        filterOpen={false}
        onToggleFilter={() => undefined}
        frozen={false}
        frozenAt={null}
        onToggleFrozen={() => undefined}
      />
    );

    // Rendered shut, since that is how it lands on the screen: what the markup
    // has to carry is the control that opens it and nothing of the list.
    expect(header).toContain('aria-expanded="false"');
    expect(header).not.toContain("Starlink");
  });
});

describe("what is coming", () => {
  const NOW = Date.UTC(2026, 7, 29, 21, 0, 0);
  const epochRef = {
    current: {
      time: new Date(NOW),
      observer: { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 }
    }
  };

  /** One planned pass, described — the shape `upcomingPasses` hands over. */
  function pass(over: Partial<UpcomingPass> = {}): UpcomingPass {
    return {
      name: "ISS",
      noradId: 25544,
      category: "LANDMARK",
      startsAtMs: NOW + 14 * 60_000,
      endsAtMs: NOW + 20 * 60_000,
      peakAtMs: NOW + 17 * 60_000,
      peakElevationDeg: 68,
      riseAzimuthDeg: 247,
      setAzimuthDeg: 51,
      started: false,
      nakedEye: "visible",
      apparentMagnitude: -1.8,
      magnitudeMeasured: true,
      ...over
    };
  }

  function panel(passes: UpcomingPass[], onSelect: (name: string) => void = () => undefined) {
    return <UpcomingPasses passes={passes} epochRef={epochRef} onSelect={onSelect} />;
  }

  test("shut, it is the next pass rather than a title", () => {
    // The difference between this pill and the two above it: a filter has
    // nothing to report until it is opened, and this has one fact worth more
    // than its own name.
    const text = textOf(panel([pass()]));

    expect(text).toContain("ISS");
    expect(text).toContain("14 min");
    expect(text).not.toContain("COMING UP");
  });

  test("and the soonest one, not whichever came first", () => {
    const text = textOf(
      panel([
        pass({ name: "Hubble", startsAtMs: NOW + 5 * 60_000 }),
        pass({ startsAtMs: NOW + 90 * 60_000 })
      ])
    );

    expect(text).toContain("Hubble");
    expect(text).toContain("5 min");
  });

  test("a pass already under way has nothing to wait for", () => {
    // The plan is made once a minute, so a pass that began between plans has a
    // rise time in the past — counting down to it would count the wrong way.
    const text = textOf(panel([pass({ startsAtMs: NOW - 30_000, started: true })]));

    expect(text).toContain("now");
    expect(text).not.toContain("min");
  });

  test("nothing coming is nothing on screen, rather than a pill saying so", () => {
    // The landmark tier filtered off, or a sky where nothing clears the
    // roofline for three hours. A permanent pill over the picture in exchange
    // for the absence of news is a word too many.
    expect(renderToStaticMarkup(panel([]))).toBe("");
  });

  test("the card is the control that opens it, and the rest is behind it", () => {
    const markup = renderToStaticMarkup(panel([pass(), pass({ name: "Tiangong" })]));

    expect(markup).toContain('aria-label="Upcoming passes"');
    expect(markup).toContain('aria-expanded="false"');
    // Rendered shut, since that is how it lands on the screen. Shut it is the
    // next pass and everything about it — the object, the countdown, where to
    // stand and whether it can be seen — and nothing about the pass after it.
    const text = textOf(panel([pass(), pass({ name: "Tiangong" })]));
    expect(text).toContain("ISS");
    expect(text).toContain("68° up");
    expect(text).not.toContain("Tiangong");
  });
});

describe("the compass notice", () => {
  /** What the notice says for a compass at `accuracy`, with a declination in hand. */
  const at = (accuracy: number | undefined) =>
    textOf(<CompassNotice accuracy={accuracy} declinationKnown skyFixStanding={false} />);

  test("says nothing before the compass has reported", () => {
    // Silence here is the seconds before the first heading, not a verdict.
    expect(at(undefined)).toBe("");
  });

  test("says nothing about a compass the platform vouches for", () => {
    expect(at(3)).toBe("");
  });

  test("asks for the one fix the person holding the phone can make", () => {
    // A magnetometer captured by a magnet reports a field like any other and
    // the sky is simply drawn somewhere else — so the notice has to name the
    // action, not the fault.
    expect(at(0)).toContain("figure eight");
    expect(at(0)).toContain("Compass needs calibrating");
  });

  test("warns at medium too, since 35° is most of the frame", () => {
    // The platform's own band for level 2 is wider than half the camera's field
    // of view: a satellite drawn under it can be off the picture entirely,
    // which is a wrong view rather than a degraded one.
    expect(at(2)).toContain("Compass needs calibrating");
  });

  test("a missing declination is said instead, and only when nothing worse is", () => {
    const magnetic = textOf(
      <CompassNotice accuracy={3} declinationKnown={false} skyFixStanding={false} />
    );
    expect(magnetic).toContain("magnetic north");

    // A compass that may be forty degrees out makes the true-versus-magnetic
    // question moot, so the graver of the two is the one shown.
    const uncalibrated = textOf(
      <CompassNotice accuracy={0} declinationKnown={false} skyFixStanding={false} />
    );
    expect(uncalibrated).toContain("Compass needs calibrating");
    expect(uncalibrated).not.toContain("magnetic north");
  });

  test("and nothing at all while the sun is aiming the view", () => {
    // Both notices are about the magnetic bearing, and a sighting of the sun
    // replaces it outright — including the declination, since what a sighting
    // measures is the bearing to true north. Asking for a figure-eight here
    // would be asking for work that changes nothing on screen.
    expect(
      textOf(<CompassNotice accuracy={0} declinationKnown={false} skyFixStanding />)
    ).toBe("");
    expect(textOf(<CompassNotice accuracy={3} declinationKnown={false} skyFixStanding />)).toBe(
      ""
    );
  });
});

describe("the out-of-date orbits notice", () => {
  afterEach(() => setLocaleForTesting(undefined));

  test("says nothing while the orbits are current", () => {
    expect(textOf(<CatalogNotice staleDays={null} />)).toBe("");
  });

  test("says how old the orbits are, and that CelesTrak is being tried", () => {
    const text = textOf(<CatalogNotice staleDays={30} />);
    expect(text).toContain("Satellite orbits are out of date");
    expect(text).toContain("30 days ago");
    expect(text).toContain("CelesTrak");
    expect(textOf(<CatalogNotice staleDays={1} />)).toContain("a day ago");
  });

  test("in the reader's language", () => {
    setLocaleForTesting("it");
    const text = textOf(<CatalogNotice staleDays={4} />);
    expect(text).toContain("Orbite dei satelliti non aggiornate");
    expect(text).toContain("4 giorni fa");
  });
});

describe("the tapped satellite's card", () => {
  function detail(overrides: Partial<SatelliteDetail> = {}): SatelliteDetail {
    return {
      name: "STARLINK-1234",
      noradId: 44714,
      category: "INTERNET",
      subcategory: "STARLINK",
      parked: false,
      launchYear: 2019,
      rangeKm: 1240.4,
      altitudeKm: 547.8,
      speedKmPerSecond: 7.58,
      azimuthDeg: 143.2,
      elevationDeg: 27.4,
      orbitPeriodMinutes: 95.6,
      sunlit: "sunlit",
      apparentMagnitude: 4.6,
      magnitudeMeasured: false,
      nakedEye: "binoculars",
      sunAltitudeDeg: -20,
      ...overrides
    };
  }

  /** The card as it is rendered for a tap, with the figures it would read. */
  function card(
    details: Record<string, SatelliteDetail | null>,
    names = Object.keys(details),
    selected = names[0],
    sighting: UpcomingPass | null = null,
    groundTrack: GroundTrackPlan | null = null
  ) {
    const describeRef = { current: (name: string) => details[name] ?? null };
    return (
      <SatelliteCard
        names={names}
        selected={selected}
        onSelect={() => undefined}
        onClose={() => undefined}
        describeRef={describeRef}
        sighting={sighting}
        groundTrack={groundTrack}
        />
    );
  }

  /** One orbit planned for the card's map, from the fixture's own elements. */
  function plan(name = "ISS"): GroundTrackPlan {
    const tles = parseTleCatalog(
      fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
    ).filter((tle) => tle.name === name);
    const entry = new SatelliteCatalog(tles).entries[0];
    return {
      track: groundTrackFor(entry, Date.UTC(2026, 7, 23, 12, 0, 0)),
      observer: { latitudeDeg: 45.46, longitudeDeg: 9.19, heightM: 120 }
    };
  }

  describe("whether it can be seen", () => {
    test("is about the sky right now, whatever the object has ahead of it", () => {
      const overhead = detail({
        name: "ISS",
        noradId: 25544,
        category: "LANDMARK",
        elevationDeg: 41.2,
        nakedEye: "visible",
        apparentMagnitude: -2.4,
        magnitudeMeasured: true,
        sunAltitudeDeg: -14
      });
      const text = textOf(card({ ISS: overhead }, ["ISS"], "ISS"));

      expect(text).toContain("Visible to the eye · magnitude -2.4");
      // No line in the future tense: the card is about now, like every figure
      // under it, and the next sighting has a line of its own.
      expect(text).not.toContain("When it comes over");
    });

    test("says nothing by day, when the sun has already given the answer", () => {
      // True of every object overhead at once, so a line saying it on every
      // card tells nobody anything. The figures are still there.
      const daylit = detail({ nakedEye: "daylight", sunAltitudeDeg: 24 });
      const text = textOf(card({ "STARLINK-1234": daylit }));

      expect(text).not.toContain(strings().card.seeing.daylight);
      expect(text).toContain("1,240 km");
    });

    test("still says it at night, in shadow or not", () => {
      const eclipsed = detail({ nakedEye: "eclipsed", apparentMagnitude: null });
      // A fragment, because the markup escapes the apostrophe in "Earth's".
      expect(textOf(card({ "STARLINK-1234": eclipsed }))).toContain("Not visible (in the Earth");
    });

    test("and distance is said as distance, not as faintness", () => {
      // A navigation or television satellite is not dim, it is far, and the
      // difference is whether coming back after dark would help. See
      // `SKY_VISIBILITY.tooFarKm`.
      const far = detail({ nakedEye: "tooFar", rangeKm: 36_200, apparentMagnitude: null });
      const text = textOf(card({ "GSAT-30": far }, ["GSAT-30"], "GSAT-30"));

      expect(text).toContain(strings().card.seeing.tooFar);
      expect(text).not.toContain(strings().card.seeing.tooFaint);
    });
  });

  describe("the year it went up", () => {
    test("is on the card, under the figures that are about this second", () => {
      // The one row here that is a fact about the object rather than a reading
      // off the sky. See `SatelliteDetail.launchYear`.
      const text = textOf(card({ "STARLINK-1234": detail({ launchYear: 2019 }) }));

      expect(text).toContain(strings().card.facts.launched);
      // Bare digits: a year is a label, not a quantity, so no thousands
      // separator — `2.019` would read as a measurement of something.
      expect(text).toContain("2019");
      expect(text).not.toContain("2,019");
    });

    test("and is simply absent where the elements carry no designator", () => {
      // A dash in its place would be a row spent saying the catalogue is
      // missing a field.
      const text = textOf(card({ "STARLINK-1234": detail({ launchYear: null }) }));

      expect(text).not.toContain(strings().card.facts.launched);
    });
  });

  describe("a naked-eye pass in the next day", () => {
    const sighting: UpcomingPass = {
      name: "ISS",
      noradId: 25544,
      category: "LANDMARK",
      startsAtMs: Date.UTC(2026, 7, 29, 19, 24, 0),
      endsAtMs: Date.UTC(2026, 7, 29, 19, 34, 0),
      peakAtMs: Date.UTC(2026, 7, 29, 19, 31, 0),
      peakElevationDeg: 68,
      riseAzimuthDeg: 247,
      setAzimuthDeg: 51,
      started: false,
      nakedEye: "visible",
      apparentMagnitude: -2.2,
      magnitudeMeasured: true
    };
    const overhead = detail({
      name: "ISS",
      noradId: 25544,
      category: "LANDMARK",
      elevationDeg: 41.2,
      nakedEye: "daylight",
      sunAltitudeDeg: 2
    });

    test("is said on a line of its own, beside what is true now", () => {
      const text = textOf(card({ ISS: overhead }, ["ISS"], "ISS", sighting));

      expect(text).toMatch(/Visible to the eye at \d{1,2}:31/);
      // Where to stand and how bright, as the passes panel says it.
      expect(text).toContain("68° up");
      expect(text).toContain("magnitude -2.2");
      // And nothing about the sky overhead now, which is a daylit one.
      expect(text).not.toContain("Not visible (daylight)");
    });

    test("and nothing is said without one", () => {
      const text = textOf(card({ ISS: overhead }, ["ISS"], "ISS", null));

      expect(text).not.toMatch(/Visible to the eye at/);
    });
  });

  test("says what the satellite is, where it is and where to look for it", () => {
    const text = textOf(card({ "STARLINK-1234": detail() }));

    expect(text).toContain("STARLINK-1234");
    // What it is for, in the legend's own words rather than a category code.
    expect(text).toContain("INTERNET");
    // How far away, how high, how fast — and grouped, because the belt is five
    // figures out.
    expect(text).toContain("1,240 km");
    expect(text).toContain("548 km");
    expect(text).toContain("7.6 km/s");
    // Where to point yourself: a compass point as well as a bearing, since a
    // number alone is only useful to someone already holding a compass.
    expect(text).toContain("SE 143° · 27° up");
    expect(text).toContain("96 min");
  });

  test("says what the satellite is before it says how far away it is", () => {
    // Someone who has just tapped a light in the sky is asking what it is; the
    // figures only mean something once the object has a name and a job.
    const text = textOf(card({ "STARLINK-1234": detail() }));

    expect(text).toContain("SpaceX");
    // And where to read more, labelled with the site it opens rather than with
    // the words "official site".
    expect(text).toContain("starlink.com");
  });

  test("a landmark is described in its own right, not as one of a fleet", () => {
    const text = textOf(
      card({
        ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK" })
      })
    );

    expect(text).toContain("International Space Station");
    expect(text).toContain("nasa.gov");
  });

  test("the link is a link, and opens the operator's own page", () => {
    const markup = renderToStaticMarkup(card({ "STARLINK-1234": detail() }));

    expect(markup).toContain('role="link"');
    expect(markup).toContain('aria-label="Open starlink.com"');
  });

  test("an object with no page to open says its piece without a dead link", () => {
    // A link is worth a tap only if it lands on the people who fly the thing.
    const text = textOf(
      card({ "GJZ 01": detail({ name: "GJZ 01", noradId: 57489, category: "EARTH" }) })
    );

    expect(text).toContain("remote-sensing");
    expect(text).not.toContain("↗");
  });

  test("a satellite that has set is below the horizon, not at a negative angle", () => {
    // The card outlives the pass it was opened on, and keeps answering.
    const text = textOf(
      card({ "STARLINK-1234": detail({ azimuthDeg: 271, elevationDeg: -8.2 }) })
    );

    expect(text).toContain("W 271° · 8° below");
  });

  test("a parked object holds station, and takes a day to come round", () => {
    const text = textOf(
      card({
        ASTRA: detail({
          name: "ASTRA",
          noradId: 28526,
          parked: true,
          rangeKm: 38200,
          altitudeKm: 35786,
          orbitPeriodMinutes: 1436,
          speedKmPerSecond: 3.07
        })
      })
    );

    expect(text).toContain("HOLDS STATION");
    expect(text).toContain("35,786 km");
    // Minutes stop being readable somewhere short of a day.
    expect(text).toContain("23h 56m");
  });

  test("one satellite under the finger is not a choice to make", () => {
    const markup = renderToStaticMarkup(card({ "STARLINK-1234": detail() }));

    // The name appears once — as the card's title, not also as a chip to pick.
    expect(markup.match(/STARLINK-1234/g)).toHaveLength(1);
    expect(markup).not.toContain('role="tab"');
  });

  test("a tap over a cluster offers every satellite it covered", () => {
    // Arrows through them would hide what is being chosen between, and a list
    // to drill into would charge every tap for the case where two overlapped.
    const markup = renderToStaticMarkup(
      card({
        ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK" }),
        "PROGRESS-MS 27": detail({
          name: "PROGRESS-MS 27",
          noradId: 61454,
          category: "LANDMARK"
        }),
        "SOYUZ-MS 26": detail({ name: "SOYUZ-MS 26", noradId: 61443, category: "LANDMARK" })
      })
    );

    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    for (const name of ["ISS", "PROGRESS-MS 27", "SOYUZ-MS 26"]) {
      expect(markup).toContain(`>${name}<`);
    }
    // And says which of them the sky is ringing.
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
  });

  test("describes whichever of the cluster is selected", () => {
    const names = ["ISS", "SOYUZ-MS 26"];
    const details = {
      ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK", rangeKm: 431 }),
      "SOYUZ-MS 26": detail({
        name: "SOYUZ-MS 26",
        noradId: 61443,
        category: "LANDMARK",
        rangeKm: 433
      })
    };

    expect(textOf(card(details, names, "SOYUZ-MS 26"))).toContain("433 km");
    expect(textOf(card(details, names, "ISS"))).toContain("431 km");
  });

  test("can be put away again", () => {
    expect(renderToStaticMarkup(card({ "STARLINK-1234": detail() }))).toContain(
      'aria-label="Close satellite details"'
    );
  });

  describe("the photograph", () => {
    /** The file's entry on Commons, as the API answers for it. */
    const IMAGE_INFO = JSON.stringify({
      query: {
        pages: [
          {
            imageinfo: [
              {
                thumburl:
                  "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/ISS-56.jpg/960px-ISS-56.jpg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:ISS-56.jpg",
                mime: "image/jpeg",
                extmetadata: {
                  Artist: { value: "NASA/Roscosmos" },
                  LicenseShortName: { value: "Public domain" }
                }
              }
            ]
          }
        ]
      }
    });

    beforeEach(() => clearLandmarkPhotosForTesting());
    afterEach(() => jest.restoreAllMocks());

    /**
     * Renders with the picture already resolved.
     *
     * The fetch is what the card starts on mount, and `renderToStaticMarkup`
     * runs no effects — so the lookup is done here, which is also the case that
     * matters most on a phone: a card reopened on an object whose picture is
     * already in hand draws it on the first frame.
     */
    async function withPhotoResolved(): Promise<void> {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(IMAGE_INFO, { status: 200 }));
      await loadLandmarkPhoto("ISS-56 International Space Station fly-around (07).jpg");
    }

    test("a landmark is shown, not only described", async () => {
      await withPhotoResolved();

      const markup = renderToStaticMarkup(
        card({ ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK" }) })
      );

      // What is on screen is a picture, so what is asserted is what a screen
      // reader is told it is: react-native-web paints the file itself as a
      // background once it has loaded, and renders nothing of it server-side.
      expect(markup).toContain('aria-label="Photograph of ISS"');
      expect(markup).toContain('role="img"');
    });

    test("the picture is credited, because most of these licences ask for it", async () => {
      await withPhotoResolved();

      const text = textOf(
        card({ ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK" }) })
      );

      // The author and the licence, over a link to the page carrying both in
      // full — not a bare domain, which credits nobody.
      expect(text).toContain("NASA/Roscosmos · Public domain");
    });

    test("the rest of the catalogue keeps its card the size it was", async () => {
      await withPhotoResolved();

      const markup = renderToStaticMarkup(card({ "STARLINK-1234": detail() }));

      expect(markup).not.toContain('role="img"');
      expect(markup).not.toContain("Public domain");
    });

    test("a card whose picture never arrives reads exactly as it did before", () => {
      // No lookup has resolved, which is every card's first frame and every
      // card's only frame on a phone with no signal.
      const text = textOf(
        card({ ISS: detail({ name: "ISS", noradId: 25544, category: "LANDMARK" }) })
      );

      expect(text).toContain("International Space Station");
      expect(text).not.toContain("Public domain");
    });
  });

  describe("the map of where it goes", () => {
    test("is drawn under the figures, with the circle explained", () => {
      const text = textOf(card({ "STARLINK-1234": detail() }, undefined, undefined, null, plan()));

      expect(text).toContain(strings().card.map.title);
      expect(text).toContain(strings().card.map.footprint);
      // Under the figures rather than over them: the card still opens on what
      // the object is, and the map is what a scroll gets you.
      expect(text.indexOf(strings().card.facts.orbit)).toBeLessThan(
        text.indexOf(strings().card.map.title)
      );
    });

    test("names the object it is a map of, for a screen reader", () => {
      const markup = renderToStaticMarkup(
        card({ "STARLINK-1234": detail() }, undefined, undefined, null, plan())
      );

      expect(markup).toContain(fill(strings().card.map.label, { name: "STARLINK-1234" }));
    });

    test("is absent until the orbit has been worked out", () => {
      // The plan lands a moment after the tap, and an object whose elements
      // will not make an orbit never gets one at all. Either way the card is
      // the card it was, rather than a card with an empty world on it.
      expect(textOf(card({ "STARLINK-1234": detail() }))).not.toContain(
        strings().card.map.title
      );

      const noOrbit: GroundTrackPlan = { ...plan(), track: null };
      expect(
        textOf(card({ "STARLINK-1234": detail() }, undefined, undefined, null, noOrbit))
      ).not.toContain(strings().card.map.title);
    });

    test("is not drawn for an object the catalog has dropped", () => {
      // No category to colour it with and no figures to sit under: what is
      // left is the line saying the object has gone.
      const text = textOf(card({ "STARLINK-1234": null }, undefined, undefined, null, plan()));

      expect(text).toContain("left the catalog");
      expect(text).not.toContain(strings().card.map.title);
    });
  });

  describe("the arrow at the foot of a card that goes on below it", () => {
    test("is a control, and says what it does to anyone not seeing it", () => {
      // The fade is the sign and the arrow is the instruction, but it is also
      // pressable — it takes the body down to the map — so it has to say so.
      const markup = renderToStaticMarkup(
        card({ "STARLINK-1234": detail() }, undefined, undefined, null, plan())
      );

      expect(markup).toContain(`aria-label="${strings().card.more}"`);
    });

    test("leaves everything the card says still on the card", () => {
      // A cue that covered the reading would be worse than no cue: it is a
      // strip at the foot of the sheet rather than a layer over it, and the
      // only part of it that takes a touch is the arrow.
      const text = textOf(card({ "STARLINK-1234": detail() }, undefined, undefined, null, plan()));

      // Everything the card says is still said.
      expect(text).toContain("1,240 km");
      expect(text).toContain(strings().card.map.title);
      // And the cue itself says nothing: it is an arrow, not a sentence over a
      // camera picture.
      expect(text).not.toContain(strings().card.more);
    });
  });

  test("says so when the catalog no longer carries what was tapped", () => {
    // Objects leave the active catalog, and it is reloaded every couple of
    // hours underneath a card that is still open.
    const text = textOf(card({ "STARLINK-1234": null }));

    expect(text).toContain("left the catalog");
    expect(text).not.toContain("km");
  });
});

/**
 * The sign over the middle of the picture, raised when a pass is picked out of
 * the list rather than tapped on the sky.
 *
 * What it is for is the one thing a card at the foot of the screen cannot do:
 * get somebody to look up. See `FindInSky`.
 */
describe("the sign saying to look for it", () => {
  test("says which way to point the phone for an object that is up", () => {
    const text = textOf(
      <FindInSky
        aim={{ id: 1, direction: "SE 143\u00b0 \u00b7 27\u00b0 up", risen: true }}
        onDone={() => undefined}
      />
    );

    expect(text).toContain(strings().scene.findIt.title);
    // The bearing the card gives, in the same words: one answer, said twice
    // rather than two answers to compare.
    expect(text).toContain("SE 143\u00b0 \u00b7 27\u00b0 up");
  });

  test("and gives no bearing at all for one that has not risen", () => {
    // Where a satellite sits under the horizon is not where it comes up, and a
    // list of upcoming passes is mostly objects that have not risen: a bearing
    // here would be the one figure on this screen that sends somebody out to
    // face the wrong way. The heading is the same either way \u2014 there is
    // something to find in the sky in both cases \u2014 and it is the one sentence
    // under it that carries the qualification, rather than a second heading
    // seeming to contradict the first.
    const text = textOf(
      <FindInSky
        aim={{ id: 2, direction: "NW 312\u00b0 \u00b7 24\u00b0 below", risen: false }}
        onDone={() => undefined}
      />
    );

    expect(text).toContain(strings().scene.findIt.title);
    // A fragment either side of the apostrophe, which the markup escapes —
    // the same reason the seeing-verdict tests below match on "Earth" rather
    // than "Earth's".
    expect(text).toContain("risen yet, but its path is already drawn");
    expect(text).toContain("raise the phone and follow the line to find it");
    expect(text).not.toContain("312");
  });

  test("is nothing at all with nothing to say", () => {
    // Which is the state the view spends all but a few seconds of its life in.
    expect(renderToStaticMarkup(<FindInSky aim={null} onDone={() => undefined} />)).toBe("");
  });
});

/**
 * The catalog tab: the whole catalogue as something to look things up in.
 *
 * What is checked here is the screen rather than the arithmetic behind it —
 * `catalogDirectory.test.ts` has the index, the search and the propagation. The
 * scans themselves never land in a server render, which is exactly the state
 * this screen has to be legible in: a fleet-sized scan runs in slices, and on a
 * phone the first frame of an opened fleet is always the one before it arrives.
 */
describe("the catalog tab", () => {
  /** A few objects from the fleets the index is built out of. */
  function fakeCatalog(): SatelliteCatalog {
    const named = (name: string, category: SatelliteCategory): Tle => ({
      ...SAMPLE_TLE,
      name,
      category
    });
    return new SatelliteCatalog([
      named("ISS", "LANDMARK"),
      named("Hubble", "LANDMARK"),
      named("STARLINK-1007", "INTERNET"),
      named("STARLINK-1008", "INTERNET"),
      named("STARLINK-1009", "INTERNET"),
      named("GPS BIIR-2", "NAVIGATION"),
      named("NOAA 19", "EARTH"),
      named("SOMETHING UNRECOGNISED", "OTHER"),
      named("ANOTHER ODDITY", "OTHER")
    ]);
  }

  function screen(catalog = fakeCatalog()) {
    const epochRef = {
      current: {
        time: new Date(Date.UTC(2026, 7, 29, 0, 0, 0)),
        observer: { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 }
      }
    };
    return <CatalogScreen catalog={catalog} epochRef={epochRef} onSelect={() => undefined} />;
  }

  test("opens on the whole catalogue, sorted the way the sky is coloured", () => {
    const text = textOf(screen());

    // The tab's own label, so the bar and the page cannot disagree, and the
    // legend's own headings, so the catalog and the filter sort the sky alike.
    expect(text).toContain("Catalog");
    expect(text).toContain("HIGHLIGHTS");
    expect(text).toContain("NAVIGATION");
    expect(text).toContain("INTERNET");
  });

  test("lists fleets with how many of each there are, not objects one by one", () => {
    // The shape of what is up there, legible before anything is tapped: the
    // single most surprising fact about the modern sky is how much of it is
    // one constellation.
    const text = textOf(screen());

    expect(text).toContain("Starlink");
    expect(text).toContain("3 in orbit");
    expect(text).not.toContain("STARLINK-1007");
  });

  test("but names the landmarks, because each of them is what somebody wants", () => {
    const text = textOf(screen());

    expect(text).toContain("ISS");
    expect(text).toContain("Hubble");
  });

  test("calls the objects it cannot name what the marker count calls them", () => {
    // Not an untranslated English phrase in the middle of an Italian list.
    // See `src/satellite/fleets.ts`.
    expect(textOf(screen())).toContain("Others");
  });

  test("a fleet with one object in it is that object, not a way in to a list of one", () => {
    const text = textOf(screen());

    // `GPS BIIR-2` is the only GPS satellite in this catalog, so its row goes to
    // the sky like the landmarks' do rather than opening a page that would say
    // "0 of 1 above your horizon" and stop.
    expect(text).toContain("GPS BIIR-2");
    expect(text).not.toContain("1 in orbit");
  });

  test("draws the names it already knows without waiting for any arithmetic", () => {
    // No scan has landed here — no effects run in a server render, which is
    // also every one of these lists' first frame on a phone. The names are
    // settled before the propagation runs, so they are on screen; only the line
    // saying which way to turn waits for it.
    const text = textOf(screen());

    expect(text).toContain("Hubble");
    expect(text).not.toContain("Working out where these are");
  });

  test("carries the search field it exists for", () => {
    // The browse answers "what is up there"; only a name answers "where is the
    // thing I came looking for", which is the question the tab is for.
    expect(renderToStaticMarkup(screen())).toContain('placeholder="Search by name"');
  });

  test("and says all of it in the reader's own language", () => {
    setLocaleForTesting("it");
    const text = textOf(screen());

    expect(text).toContain("Catalogo");
    expect(text).toContain("IMPORTANTI");
    expect(text).toContain("3 in orbita");
    // The fleet names are the names their operators gave them, in every
    // language: there is no Italian for "Starlink".
    expect(text).toContain("Starlink");
    setLocaleForTesting(undefined);
  });
});
