import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryLegend } from "../src/components/CategoryLegend";
import { NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteCard } from "../src/components/SatelliteCard";
import { SceneStatus } from "../src/components/SceneStatus";
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

describe("the marker count", () => {
  test("is the number and nothing else", () => {
    expect(textOf(<SceneStatus markerCount={17} />)).toBe("17");
  });

  test("still says what it counts, for anyone not reading the screen", () => {
    expect(renderToStaticMarkup(<SceneStatus markerCount={17} />)).toContain(
      'aria-label="17 visible satellites"'
    );
  });

  test("a degraded boot tints the number rather than printing the warning", () => {
    const warned = renderToStaticMarkup(<SceneStatus markerCount={0} warned />);

    expect(textOf(<SceneStatus markerCount={0} warned />)).toBe("0");
    expect(warned).not.toBe(renderToStaticMarkup(<SceneStatus markerCount={0} />));
  });
});

describe("the tapped satellite's card", () => {
  function detail(overrides: Partial<SatelliteDetail> = {}): SatelliteDetail {
    return {
      name: "STARLINK-1234",
      category: "COMMS",
      parked: false,
      rangeKm: 1240.4,
      altitudeKm: 547.8,
      speedKmPerSecond: 7.58,
      azimuthDeg: 143.2,
      elevationDeg: 27.4,
      orbitPeriodMinutes: 95.6,
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
        ISS: detail({ name: "ISS", category: "LANDMARK" }),
        "PROGRESS-MS 27": detail({ name: "PROGRESS-MS 27", category: "LANDMARK" }),
        "SOYUZ-MS 26": detail({ name: "SOYUZ-MS 26", category: "LANDMARK" })
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
      ISS: detail({ name: "ISS", category: "LANDMARK", rangeKm: 431 }),
      "SOYUZ-MS 26": detail({ name: "SOYUZ-MS 26", category: "LANDMARK", rangeKm: 433 })
    };

    expect(textOf(card(details, names, "SOYUZ-MS 26"))).toContain("433 km");
    expect(textOf(card(details, names, "ISS"))).toContain("431 km");
  });

  test("can be put away again", () => {
    expect(renderToStaticMarkup(card({ "STARLINK-1234": detail() }))).toContain(
      'aria-label="Close satellite details"'
    );
  });

  test("says so when the catalog no longer carries what was tapped", () => {
    // Objects leave the active catalog, and it is reloaded every couple of
    // hours underneath a card that is still open.
    const text = textOf(card({ "STARLINK-1234": null }));

    expect(text).toContain("left the catalog");
    expect(text).not.toContain("km");
  });
});
