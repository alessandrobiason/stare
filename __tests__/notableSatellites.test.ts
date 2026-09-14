import { NOTABLE_SATELLITES } from "../src/constants";
import { NotableCandidate, NotableSatellites } from "../src/satellite/notable";

function sat(overrides: Partial<NotableCandidate> & { name: string }): NotableCandidate {
  return { category: "COMMS", rangeKm: 1500, elevationDeg: 30, ...overrides };
}

const SECOND = 1000;
const HOLD_MS = NOTABLE_SATELLITES.holdSeconds * SECOND;

/** A sky with one of everything worth naming. */
const SKY: NotableCandidate[] = [
  sat({ name: "ISS", category: "LANDMARK", rangeKm: 450 }),
  sat({ name: "STARLINK-1007", rangeKm: 700 }),
  sat({ name: "ONEWEB-0012", rangeKm: 1400 }),
  sat({ name: "INTELSAT 33E", rangeKm: 38500, elevationDeg: 25 }),
  sat({ name: "NAVSTAR 81 (USA 319)", category: "NAVIGATION", rangeKm: 21000, elevationDeg: 60 }),
  sat({ name: "GALILEO 23 (2C5)", category: "NAVIGATION", rangeKm: 24000, elevationDeg: 20 })
];

function chosen(notable: NotableSatellites, sky: readonly NotableCandidate[]) {
  return Object.fromEntries(
    sky.flatMap((one) => {
      const role = notable.roleOf(one.name);
      return role ? [[role, one.name]] : [];
    })
  );
}

test("names the nearest, the farthest and the highest navigation satellite", () => {
  const notable = new NotableSatellites();
  notable.choose(SKY, 0);

  expect(chosen(notable, SKY)).toEqual({
    closest: "STARLINK-1007",
    farthest: "INTELSAT 33E",
    navigation: "NAVSTAR 81 (USA 319)"
  });
});

test("never gives a landmark a role: it is named anyway", () => {
  const notable = new NotableSatellites();
  notable.choose(SKY, 0);
  expect(notable.roleOf("ISS")).toBeUndefined();
});

test("gives one satellite one role, the earlier one", () => {
  // The only satellite up is both the nearest and the farthest.
  const lonely = [sat({ name: "ALONE" })];
  const notable = new NotableSatellites();
  notable.choose(lonely, 0);

  expect(notable.roleOf("ALONE")).toBe("closest");
});

test("chooses the same names in whatever order the sky is handed over", () => {
  // Nothing about the phone reaches the choice, and the order the tracker
  // walks its catalogue in is not something a name should depend on either.
  const forwards = new NotableSatellites();
  const backwards = new NotableSatellites();
  forwards.choose(SKY, 0);
  backwards.choose([...SKY].reverse(), 0);

  expect(chosen(backwards, SKY)).toEqual(chosen(forwards, SKY));
});

describe("holding a role", () => {
  test("keeps it against a challenger that is only a little better", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    // Nearer, but not by the margin, and long after the hold has run out.
    const sky = [...SKY, sat({ name: "STARLINK-2000", rangeKm: 600 })];
    notable.choose(sky, 10 * HOLD_MS);

    expect(notable.roleOf("STARLINK-1007")).toBe("closest");
  });

  test("gives it up to one clearly better, once it has been held long enough", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    const sky = [...SKY, sat({ name: "STARLINK-2000", rangeKm: 400 })];

    notable.choose(sky, HOLD_MS - SECOND);
    expect(notable.roleOf("STARLINK-1007")).toBe("closest");

    notable.choose(sky, HOLD_MS);
    expect(notable.roleOf("STARLINK-2000")).toBe("closest");
    expect(notable.roleOf("STARLINK-1007")).toBeUndefined();
  });

  test("hands it on at once when the holder sets", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    notable.choose(SKY.filter((one) => one.name !== "STARLINK-1007"), SECOND);

    expect(notable.roleOf("ONEWEB-0012")).toBe("closest");
  });

  test("hands it on at once when the holder is filtered out", () => {
    // The loop hands over only what the filters let through, so a hidden
    // satellite is one that is not in the list.
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    notable.choose(SKY.filter((one) => one.category !== "NAVIGATION"), SECOND);

    expect(chosen(notable, SKY).navigation).toBeUndefined();
  });

  test("keeps the navigation satellite until another is clearly higher", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    const rising = (elevationDeg: number) =>
      SKY.map((one) => (one.name.startsWith("GALILEO") ? { ...one, elevationDeg } : one));

    notable.choose(rising(70), HOLD_MS);
    expect(notable.roleOf("NAVSTAR 81 (USA 319)")).toBe("navigation");

    notable.choose(rising(60 + NOTABLE_SATELLITES.navigationMarginDeg), 2 * HOLD_MS);
    expect(notable.roleOf("GALILEO 23 (2C5)")).toBe("navigation");
  });
});

describe("when to choose", () => {
  test("once a second of sky time", () => {
    const notable = new NotableSatellites();
    expect(notable.due(0)).toBe(true);
    notable.choose(SKY, 0);
    expect(notable.due(NOTABLE_SATELLITES.intervalSeconds * SECOND - 1)).toBe(false);
    expect(notable.due(NOTABLE_SATELLITES.intervalSeconds * SECOND)).toBe(true);
  });

  test("at once after a seek backwards", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 10 * SECOND);
    expect(notable.due(5 * SECOND)).toBe(true);
  });

  test("afresh after a reset", () => {
    const notable = new NotableSatellites();
    notable.choose(SKY, 0);
    const sky = [...SKY, sat({ name: "STARLINK-2000", rangeKm: 690 })];
    notable.reset();
    expect(notable.roleOf("STARLINK-1007")).toBeUndefined();

    notable.choose(sky, SECOND);
    expect(notable.roleOf("STARLINK-2000")).toBe("closest");
  });
});
