import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryLegend } from "../src/components/CategoryLegend";
import { CompassNotice } from "../src/components/CompassNotice";
import { DebugToggle } from "../src/components/DebugToggle";
import { NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteCard } from "../src/components/SatelliteCard";
import { SceneStatus } from "../src/components/SceneStatus";
import {
  clearLandmarkPhotosForTesting,
  loadLandmarkPhoto
} from "../src/satellite/landmarkPhotos";
import { SkySummary } from "../src/hooks/useAnimatedMarkers";
import { BREAKDOWN_ROWS, FleetBreakdown, tallyFleets } from "../src/satellite/fleets";
import { allCategories } from "../src/satellite/categories";
import { SatelliteDetail } from "../src/types";

/** The rendered overlay as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function legend(enabled = allCategories()) {
  return (
    <CategoryLegend
      enabledCategories={enabled}
      onToggleCategory={() => undefined}
      onEnableAll={() => undefined}
      palette={NIGHT_PALETTE}
    />
  );
}

describe("the category filter", () => {
  test("opens closed: its own title, and none of the list", () => {
    const text = textOf(legend());

    expect(text).toContain("FILTER");
    // The sky is what the screen is for; the list is a tap away, not in the way.
    expect(text).not.toContain("NAVIGATION");
    expect(text).not.toContain("SHOW ALL");
    expect(text).not.toContain("PARKED");
  });

  test("says so when it is hiding something, so a thin sky reads as a setting", () => {
    const some = allCategories();
    some.delete("COMMS");
    some.delete("OTHER");

    expect(textOf(legend(some))).toContain("3/5");
    // Nothing to report while everything is drawn.
    expect(textOf(legend())).not.toContain("5/5");
  });

  test("the title is the control that opens it", () => {
    const markup = renderToStaticMarkup(legend());

    expect(markup).toContain('aria-label="Category filter"');
    expect(markup).toContain('aria-expanded="false"');
  });
});

/** A sky of `count` marks, all lit, under a dark sky unless told otherwise. */
const sky = (
  count: number,
  fleets: FleetBreakdown = { rows: [], other: 0 },
  over: Partial<SkySummary> = {}
): SkySummary => ({ count, fleets, sunlit: count, darkness: "dark", ...over });

describe("the marker count", () => {
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

  test("is the number, and the chevron that says it opens", () => {
    // Everything else is behind the tap: the panel sits over a photograph of
    // the sky, and closed it is worth exactly the space a two-digit number takes.
    const text = textOf(<SceneStatus sky={sky(17)} />);

    expect(text).toContain("17");
    expect(text).not.toContain("Starlink");
    expect(text).not.toContain("IN VIEW");
  });

  test("still says what it counts, for anyone not reading the screen", () => {
    // And on the control rather than the panel, so the label the replay suite
    // waits on is still the thing that announces itself.
    expect(renderToStaticMarkup(<SceneStatus sky={sky(17, NOTHING)} />)).toContain(
      'aria-label="17 visible satellites"'
    );
    expect(renderToStaticMarkup(<SceneStatus sky={sky(17, NOTHING)} />)).toContain(
      'aria-expanded="false"'
    );
  });
});

describe("the console toggle", () => {
  test("a degraded boot tints the pill rather than printing the warning", () => {
    // On the control that opens the page saying what was degraded, rather than
    // on the marker count, which is about the sky and not about the phone.
    const warned = renderToStaticMarkup(
      <DebugToggle on={false} onToggle={() => undefined} warned />
    );

    expect(textOf(<DebugToggle on={false} onToggle={() => undefined} warned />)).toBe("CONSOLE");
    expect(warned).not.toBe(
      renderToStaticMarkup(<DebugToggle on={false} onToggle={() => undefined} />)
    );
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

  test("the panel opens onto the same style as the filter opposite it", () => {
    const open = renderToStaticMarkup(
      <SceneStatus sky={sky(17, { rows: [{ name: "Starlink", count: 10 }], other: 7 })} />
    );

    // Rendered shut, since that is how it lands on the screen: what the markup
    // has to carry is the control that opens it and nothing of the list.
    expect(open).toContain('aria-expanded="false"');
    expect(open).not.toContain("Starlink");
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

describe("the tapped satellite's card", () => {
  function detail(overrides: Partial<SatelliteDetail> = {}): SatelliteDetail {
    return {
      name: "STARLINK-1234",
      noradId: 44714,
      category: "COMMS",
      parked: false,
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
    selected = names[0]
  ) {
    const describeRef = { current: (name: string) => details[name] ?? null };
    return (
      <SatelliteCard
        names={names}
        selected={selected}
        onSelect={() => undefined}
        onClose={() => undefined}
        describeRef={describeRef}
        palette={NIGHT_PALETTE}
      />
    );
  }

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

  test("says so when the catalog no longer carries what was tapped", () => {
    // Objects leave the active catalog, and it is reloaded every couple of
    // hours underneath a card that is still open.
    const text = textOf(card({ "STARLINK-1234": null }));

    expect(text).toContain("left the catalog");
    expect(text).not.toContain("km");
  });
});
