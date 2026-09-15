import { NOTABLE_SATELLITES } from "../src/constants";
import { NotableCandidate, NotableSatellites } from "../src/satellite/notable";

function sat(overrides: Partial<NotableCandidate> & { name: string }): NotableCandidate {
  return { category: "INTERNET", rangeKm: 1500, ...overrides };
}

const SECOND = 1000;
const HOLD_MS = NOTABLE_SATELLITES.holdSeconds * SECOND;

/** Everything the camera can currently see, one of each category. */
const FRAME: NotableCandidate[] = [
  sat({ name: "ISS", category: "LANDMARK", rangeKm: 450 }),
  sat({ name: "STARLINK-1007", rangeKm: 700 }),
  sat({ name: "ONEWEB-0012", rangeKm: 1400 }),
  sat({ name: "INTELSAT 33E", category: "TELECOM", rangeKm: 38500 }),
  sat({ name: "NAVSTAR 81 (USA 319)", category: "NAVIGATION", rangeKm: 21000 }),
  sat({ name: "GALILEO 23 (2C5)", category: "NAVIGATION", rangeKm: 24000 }),
  sat({ name: "SENTINEL-2C", category: "EARTH", rangeKm: 780 }),
  sat({ name: "COSMOS 2500", category: "OTHER", rangeKm: 900 })
];

function chosen(notable: NotableSatellites, frame: readonly NotableCandidate[]): string[] {
  return frame.filter((one) => notable.isRepresentative(one.name)).map((one) => one.name);
}

test("names the nearest satellite in each category on the frame", () => {
  const notable = new NotableSatellites();
  notable.choose(FRAME, 0);

  expect(chosen(notable, FRAME).sort()).toEqual(
    ["STARLINK-1007", "INTELSAT 33E", "NAVSTAR 81 (USA 319)", "SENTINEL-2C", "COSMOS 2500"].sort()
  );
});

test("never gives a landmark the job: it is named on its own", () => {
  const notable = new NotableSatellites();
  notable.choose(FRAME, 0);
  expect(notable.isRepresentative("ISS")).toBe(false);
});

test("chooses the same names in whatever order the frame is handed over", () => {
  // Nothing about the phone reaches the choice, and the order the tracker
  // walks its catalogue in is not something a name should depend on either.
  const forwards = new NotableSatellites();
  const backwards = new NotableSatellites();
  forwards.choose(FRAME, 0);
  backwards.choose([...FRAME].reverse(), 0);

  expect(chosen(backwards, FRAME).sort()).toEqual(chosen(forwards, FRAME).sort());
});

describe("holding a name", () => {
  test("keeps it against a challenger that is only a little nearer", () => {
    const notable = new NotableSatellites();
    notable.choose(FRAME, 0);
    // Nearer, but not by the margin, and long after the hold has run out.
    const frame = [...FRAME, sat({ name: "STARLINK-2000", rangeKm: 600 })];
    notable.choose(frame, 10 * HOLD_MS);

    expect(notable.isRepresentative("STARLINK-1007")).toBe(true);
    expect(notable.isRepresentative("STARLINK-2000")).toBe(false);
  });

  test("gives it up to one clearly nearer, once it has been held long enough", () => {
    const notable = new NotableSatellites();
    notable.choose(FRAME, 0);
    const frame = [...FRAME, sat({ name: "STARLINK-2000", rangeKm: 400 })];

    notable.choose(frame, HOLD_MS - SECOND);
    expect(notable.isRepresentative("STARLINK-1007")).toBe(true);

    notable.choose(frame, HOLD_MS);
    expect(notable.isRepresentative("STARLINK-2000")).toBe(true);
    expect(notable.isRepresentative("STARLINK-1007")).toBe(false);
  });

  test("hands it on at once when the holder leaves the frame", () => {
    const notable = new NotableSatellites();
    notable.choose(FRAME, 0);
    notable.choose(
      FRAME.filter((one) => one.name !== "STARLINK-1007"),
      SECOND
    );

    expect(notable.isRepresentative("ONEWEB-0012")).toBe(true);
  });

  test("leaves a category unnamed once nothing of it is on the frame", () => {
    const notable = new NotableSatellites();
    notable.choose(FRAME, 0);
    notable.choose(
      FRAME.filter((one) => one.category !== "NAVIGATION"),
      SECOND
    );

    expect(notable.isRepresentative("NAVSTAR 81 (USA 319)")).toBe(false);
    expect(notable.isRepresentative("GALILEO 23 (2C5)")).toBe(false);
  });

  test("holds a navigation satellite by range, the same rule as any other category", () => {
    const notable = new NotableSatellites();
    notable.choose(FRAME, 0);
    expect(notable.isRepresentative("NAVSTAR 81 (USA 319)")).toBe(true);

    const frame = FRAME.map((one) =>
      one.name === "GALILEO 23 (2C5)" ? { ...one, rangeKm: 15000 } : one
    );
    notable.choose(frame, HOLD_MS);
    expect(notable.isRepresentative("GALILEO 23 (2C5)")).toBe(true);
  });
});

test("a single satellite on the frame represents its category at once", () => {
  const notable = new NotableSatellites();
  notable.choose([sat({ name: "STARLINK-1007" })], 0);
  expect(notable.isRepresentative("STARLINK-1007")).toBe(true);
});

test("forgets every hold on a reset", () => {
  const notable = new NotableSatellites();
  notable.choose(FRAME, 0);
  notable.reset();
  expect(notable.isRepresentative("STARLINK-1007")).toBe(false);

  const frame = [...FRAME, sat({ name: "STARLINK-2000", rangeKm: 690 })];
  notable.choose(frame, SECOND);
  expect(notable.isRepresentative("STARLINK-2000")).toBe(true);
});
