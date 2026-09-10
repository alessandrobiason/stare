import * as fs from "fs";
import * as path from "path";
import { SATELLITE_TRACKING } from "../src/constants";
import {
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt,
  rangeKm
} from "../src/coordinates/transform";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { SatelliteCatalog } from "../src/satellite/catalog";
import * as propagator from "../src/satellite/propagator";
import { SkyTracker } from "../src/satellite/skyTracker";
import { standardMagnitudeFor } from "../src/satellite/standardMagnitude";
import { EnuPosition, ObserverLocation } from "../src/types";

const observer: ObserverLocation = { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 };
const WHEN = new Date("2026-08-29T21:00:00Z");
const MASK_DEG = 20;

/**
 * A real slice of CelesTrak's active catalog. The tracker exists to spread the
 * cost of a catalog this shape across frames, so the fixture has to be big
 * enough that a full pass genuinely takes more than one of them.
 */
const catalog = new SatelliteCatalog(
  parseTleCatalog(
    fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
  ).slice(0, 2000)
);

/**
 * Elevation from a full SGP4 propagation: what the tracker is measured against.
 *
 * `NaN` for the decaying entries the live catalog always carries a few of, so
 * that every comparison against it fails the same way the tracker's own
 * positive elevation test does — by leaving the satellite out.
 */
function trueElevationDeg(name: string, when: Date): number {
  const entry = catalog.entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`${name} is not in the fixture`);
  const eci = propagator.propagateAt(entry.satrec, when);
  if (!eci) return Number.NaN;
  return elevationDeg(eciToEnuInFrame(eci, gmstAt(when), createObserverFrame(observer)));
}

/** A tracker whose opening sweep has run, as it is on the first display frame. */
function primedTracker(): SkyTracker {
  const tracker = new SkyTracker(catalog, MASK_DEG);
  tracker.sweep(WHEN, observer, 0);
  return tracker;
}

/** How many SGP4 propagations a piece of work costs. */
function countPropagations(work: () => void): number {
  const spy = jest.spyOn(propagator, "propagateStateAt");
  try {
    work();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

test("the opening sweep covers the whole catalog, whatever it is charged for", () => {
  // Satellites fading in over the first pass would be worse than one slow frame
  // behind the boot screen, so the first sweep ignores its budget.
  const tracker = new SkyTracker(catalog, MASK_DEG);
  expect(countPropagations(() => tracker.sweep(WHEN, observer, 0))).toBe(catalog.size);
});

test("later sweeps take the slice that completes a pass in the configured period", () => {
  const tracker = primedTracker();
  const frameSeconds = 1 / 60;
  const share = frameSeconds / SATELLITE_TRACKING.sweepPeriodSeconds;

  expect(countPropagations(() => tracker.sweep(WHEN, observer, frameSeconds))).toBe(
    Math.ceil(share * catalog.size)
  );
});

test("a stalled frame cannot hand one sweep the whole catalog", () => {
  // A backgrounded tab comes back with a frame that lasted minutes. Sizing the
  // slice from that would freeze the view on the frame it returned on.
  const tracker = primedTracker();

  expect(countPropagations(() => tracker.sweep(WHEN, observer, 600))).toBe(
    Math.ceil(SATELLITE_TRACKING.maxSweepFraction * catalog.size)
  );
});

test("returns every satellite above the elevation mask, and only those", () => {
  const fixes = primedTracker().fixesAt(WHEN, observer);
  expect(fixes.length).toBeGreaterThan(0);
  for (const fix of fixes) expect(elevationDeg(fix.position)).toBeGreaterThan(MASK_DEG);

  const expected = catalog.entries.filter(
    (entry) => trueElevationDeg(entry.name, WHEN) > MASK_DEG
  );
  expect(fixes.map((fix) => fix.name).sort()).toEqual(expected.map((entry) => entry.name).sort());
});

test("positions carried forward across a whole pass stay well inside a pixel", () => {
  // A pixel is about 0.07 degrees at the replayed camera's field of view, and
  // the oldest state on screen is one sweep period old.
  const tracker = primedTracker();
  const later = new Date(WHEN.getTime() + SATELLITE_TRACKING.sweepPeriodSeconds * 1000);

  // No sweep in between: these fixes are the linear carry-forward alone.
  const fixes = tracker.fixesAt(later, observer);
  expect(fixes.length).toBeGreaterThan(0);
  for (const fix of fixes) {
    expect(Math.abs(elevationDeg(fix.position) - trueElevationDeg(fix.name, later))).toBeLessThan(
      0.01
    );
  }
});

test("markers move on every call, not once per sweep", () => {
  // This is the stutter the tracker exists to remove: the old pipeline held
  // every marker still between propagations, then jumped it forward.
  const tracker = primedTracker();
  const first = tracker.fixesAt(WHEN, observer)[0];
  const eastAt = (ms: number) =>
    tracker.fixesAt(new Date(WHEN.getTime() + ms), observer).find((fix) => fix.name === first.name)!
      .position.east;

  const oneFrame = eastAt(16);
  const twoFrames = eastAt(32);
  expect(oneFrame).not.toBe(first.position.east);
  expect(twoFrames).not.toBe(oneFrame);
});

test("a seek sweeps the whole catalog rather than serving a stale candidate set", () => {
  // Which objects are near the horizon is settled by the sweep, so ten minutes
  // on it is settled by nothing at all: the pass has to be redone at once.
  const tracker = primedTracker();
  const seeked = new Date(WHEN.getTime() + 10 * 60 * 1000);

  expect(countPropagations(() => tracker.sweep(seeked, observer, 1 / 60))).toBe(catalog.size);
});

test("a seek re-propagates rather than carrying a state across the gap", () => {
  const tracker = primedTracker();
  // Ten minutes on is far outside the carry-forward window, where the linear
  // term is meaningless. The tracker has to pay for SGP4 instead.
  const seeked = new Date(WHEN.getTime() + 10 * 60 * 1000);

  const fixes = tracker.fixesAt(seeked, observer);
  expect(fixes.length).toBeGreaterThan(0);
  for (const fix of fixes) {
    expect(elevationDeg(fix.position)).toBeCloseTo(trueElevationDeg(fix.name, seeked), 9);
  }
});

/** How far the object swings across the sky over the trail window, in degrees. */
function trailArcDeg(fix: { position: EnuPosition; nextPosition: EnuPosition }): number {
  const travelled = Math.hypot(
    fix.nextPosition.east - fix.position.east,
    fix.nextPosition.north - fix.position.north,
    fix.nextPosition.up - fix.position.up
  );
  const range = Math.hypot(fix.position.east, fix.position.north, fix.position.up);
  return (Math.atan2(travelled, range) * 180) / Math.PI;
}

test("the lookahead resolves the trail against its own sidereal time", () => {
  // A geostationary satellite appears motionless because Earth's rotation
  // exactly cancels its orbit. Hold the sidereal time still while advancing
  // the orbit and the cancellation is lost: the belt would draw a trail of
  // about 0.065 degrees, which is a thousand times the arc it really covers
  // and the longest thing on a southward frame.
  const tracker = primedTracker();
  const parked = tracker.fixesAt(WHEN, observer).filter((fix) => fix.parked);
  expect(parked.length).toBeGreaterThan(0);

  const arcs = parked.map(trailArcDeg).sort((first, second) => first - second);
  expect(arcs[arcs.length >> 1]).toBeLessThan(0.001);
});

test("parked objects draw no trail worth seeing, whatever their inclination", () => {
  // Not all of the geosynchronous belt sits over the equator — the inclined
  // BeiDou and IRNSS orbits trace a figure of eight through the day — so this
  // is the bound the ring actually depends on, not a claim of zero. A twentieth
  // of a degree is one pixel of this camera.
  const tracker = primedTracker();
  const parked = tracker.fixesAt(WHEN, observer).filter((fix) => fix.parked);
  for (const fix of parked) expect(trailArcDeg(fix)).toBeLessThan(0.05);
});

test("objects in low orbit draw a trail across a real part of the frame", () => {
  const tracker = primedTracker();
  const moving = tracker.fixesAt(WHEN, observer).filter((fix) => !fix.parked);
  // A degree is twenty pixels; the fastest low passes cover several.
  expect(Math.max(...moving.map(trailArcDeg))).toBeGreaterThan(1);
});

test("carries the parked flag from the catalogue onto the fix", () => {
  const tracker = primedTracker();
  for (const fix of tracker.fixesAt(WHEN, observer)) {
    const entry = catalog.entries.find((candidate) => candidate.name === fix.name);
    expect(fix.parked).toBe(entry?.parked);
  }
});

test("the candidate count the debug overlay reads is kept, not recounted", () => {
  // It is maintained as entries flip in and out of the candidate set, so the
  // figure has to agree with the set itself rather than drift away from it.
  const tracker = primedTracker();
  const stats = tracker.stats();

  const candidates = catalog.entries.filter(
    (entry) =>
      trueElevationDeg(entry.name, WHEN) >
      MASK_DEG - SATELLITE_TRACKING.candidateElevationMarginDeg
  );

  expect(stats.entries).toBe(catalog.size);
  expect(stats.candidates).toBe(candidates.length);
  expect(stats.candidates).toBeGreaterThanOrEqual(tracker.fixesAt(WHEN, observer).length);
  expect(stats.primed).toBe(true);
  expect(stats.sweepProgress).toBe(0);
});

test("the sweep's progress walks through the catalog between passes", () => {
  // What the overlay shows while the oldest states are being refreshed: a fresh
  // tracker has nothing swept yet, and a later sweep leaves the cursor part way.
  expect(new SkyTracker(catalog, MASK_DEG).stats().primed).toBe(false);

  const tracker = primedTracker();
  tracker.sweep(WHEN, observer, 1 / 60);
  const { sweepProgress } = tracker.stats();

  expect(sweepProgress).toBeGreaterThan(0);
  expect(sweepProgress).toBeLessThan(1);
});

describe("describing one tapped satellite", () => {
  /** A satellite the fixture can be relied on to place above the mask. */
  function anyVisibleName(): string {
    const [fix] = primedTracker().fixesAt(WHEN, observer);
    expect(fix).toBeDefined();
    return fix.name;
  }

  test("answers with figures the frame loop never computes", () => {
    const tracker = primedTracker();
    const name = anyVisibleName();
    const detail = tracker.describe(name, WHEN, observer)!;
    const fix = tracker.fixesAt(WHEN, observer).find((one) => one.name === name)!;

    expect(detail.name).toBe(name);
    expect(detail.category).toBe(fix.category);
    expect(detail.parked).toBe(fix.parked);
    // The same place the marker is drawn at, said in words: range, bearing and
    // height, all resolved from one propagation of that one object.
    expect(detail.rangeKm).toBeCloseTo(rangeKm(fix.position), 3);
    expect(detail.elevationDeg).toBeCloseTo(elevationDeg(fix.position), 3);
    expect(detail.elevationDeg).toBeGreaterThan(MASK_DEG);
    expect(detail.altitudeKm).toBeGreaterThan(150);
    expect(detail.altitudeKm).toBeLessThanOrEqual(detail.rangeKm);
    // Anything still in orbit is moving at a few kilometres a second.
    expect(detail.speedKmPerSecond).toBeGreaterThan(1);
    expect(detail.speedKmPerSecond).toBeLessThan(12);
    expect(detail.orbitPeriodMinutes).toBeGreaterThan(80);
  });

  test("reads a bearing off a compass rather than as a signed angle", () => {
    // Due west is 270 degrees. Handed on as atan2 gives it, the card would read
    // "-90°", which is not a direction anyone turns towards.
    const tracker = primedTracker();
    for (const fix of tracker.fixesAt(WHEN, observer)) {
      const { azimuthDeg: bearing } = tracker.describe(fix.name, WHEN, observer)!;
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    }
  });

  test("a parked object's orbit takes a day, which is why it holds station", () => {
    const tracker = primedTracker();
    const parked = tracker.fixesAt(WHEN, observer).find((fix) => fix.parked)!;
    const detail = tracker.describe(parked.name, WHEN, observer)!;

    expect(detail.parked).toBe(true);
    // A sidereal day, within the spread of the geosynchronous belt itself.
    expect(detail.orbitPeriodMinutes).toBeGreaterThan(1300);
    expect(detail.orbitPeriodMinutes).toBeLessThan(1600);
    expect(detail.altitudeKm).toBeGreaterThan(30000);
  });

  test("costs one propagation, and only when something is selected", () => {
    // The figures here are for the one object someone tapped, so they are
    // resolved on a card's own slow timer rather than carried by every marker
    // of every frame.
    const tracker = primedTracker();
    const name = anyVisibleName();

    expect(countPropagations(() => tracker.describe(name, WHEN, observer))).toBe(1);
  });

  test("says nothing about a name the catalog does not carry", () => {
    // A selection outlives the frame it was made on, and the catalog is
    // reloaded underneath it every couple of hours.
    expect(primedTracker().describe("NOT A SATELLITE", WHEN, observer)).toBeNull();
  });

  test("describes a satellite that has since set, rather than losing it", () => {
    // Nothing about the lookup depends on the object being on the frame: turn
    // the phone away, or wait for the pass to end, and the card still answers.
    const tracker = primedTracker();
    const below = catalog.entries.find(
      (entry) => trueElevationDeg(entry.name, WHEN) < -20
    )!;
    const detail = tracker.describe(below.name, WHEN, observer)!;

    expect(detail.elevationDeg).toBeLessThan(0);
  });
});

/**
 * Whether the sun is on the objects it places, which is the difference between
 * a marker somebody can go and look at and a marker over empty sky.
 *
 * The geometry itself is checked in `illumination.test.ts` against a sun put
 * where the test wants it. What is checked here is that the tracker asks the
 * question at all, asks it of the real sun, and gets the same answer on both of
 * the paths a satellite can reach the screen by.
 */
describe("whether what it places is in sunlight", () => {
  test("every fix says one way or the other", () => {
    const fixes = primedTracker().fixesAt(WHEN, observer);

    expect(fixes.length).toBeGreaterThan(0);
    for (const fix of fixes) {
      expect(["sunlit", "penumbra", "eclipsed"]).toContain(fix.sunlit);
    }
  });

  test("a night sky carries both answers", () => {
    // Late August at sixty north, an hour or so after sunset. Most of what this
    // fixture holds above twenty degrees is high orbit — the geostationary belt
    // and the navigation shells — which the Earth's shadow barely reaches, so
    // the lit share is the large one. What matters is that it is not all of it:
    // a run that is all one answer is a shadow that is not being computed.
    const fixes = primedTracker().fixesAt(WHEN, observer);
    const lit = fixes.filter((fix) => fix.sunlit === "sunlit");

    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThan(fixes.length);
  });

  test("and midwinter puts far more of them out than late summer does", () => {
    // The shadow is a fixed cone and what changes is how deeply the night side
    // of the Earth is turned into it. At sixty north in August the sun is a few
    // degrees down at midnight and the objects overhead stay lit — which is why
    // the northern summer is the season people see satellites in. At the
    // solstice it is fifty degrees down and the same sky is largely dark.
    const midwinter = new Date("2026-12-22T00:00:00Z");
    const winter = new SkyTracker(catalog, MASK_DEG);
    winter.sweep(midwinter, observer, 0);

    const eclipsedShare = (fixes: { sunlit: string }[]) =>
      fixes.filter((fix) => fix.sunlit === "eclipsed").length / fixes.length;

    expect(eclipsedShare(winter.fixesAt(midwinter, observer))).toBeGreaterThan(
      3 * eclipsedShare(primedTracker().fixesAt(WHEN, observer))
    );
  });

  test("at local noon everything above the horizon is on the day side", () => {
    // Not a coincidence and not worth a special case: standing under the sun
    // means the sky you can see is the sky the sun is shining on. It is the
    // observer who is in the wrong place to see any of it, which is why the
    // shadow alone was never going to answer this question — see `nakedEye.ts`.
    const noon = new Date("2026-08-30T10:00:00Z");
    const tracker = new SkyTracker(catalog, MASK_DEG);
    tracker.sweep(noon, observer, 0);
    const fixes = tracker.fixesAt(noon, observer);

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.every((fix) => fix.sunlit === "sunlit")).toBe(true);
  });

  test("the card and the marker agree about the same object", () => {
    // Two different paths to the same fact: the frame loop carries a state it
    // has extrapolated forward, and `describe` propagates the object exactly.
    // They must not disagree about whether the sun is on it, or a mark drawn
    // hollow opens a card saying it is lit.
    const tracker = primedTracker();
    for (const fix of tracker.fixesAt(WHEN, observer).slice(0, 40)) {
      expect(tracker.describe(fix.name, WHEN, observer)?.sunlit).toBe(fix.sunlit);
    }
  });
});

describe("what the card is told about seeing it", () => {
  /** A lit satellite on this sky whose reflectivity is on record, and one whose is not. */
  const litFixes = () =>
    primedTracker()
      .fixesAt(WHEN, observer)
      .filter((fix) => fix.sunlit === "sunlit");
  const recorded = () =>
    litFixes().find((fix) => standardMagnitudeFor(noradOf(fix.name), fix.name) !== null);
  const unrecorded = () =>
    litFixes().find((fix) => standardMagnitudeFor(noradOf(fix.name), fix.name) === null);

  /** The fixture is a real catalogue slice, so say what is missing rather than crash. */
  function named(fix: { name: string } | undefined): string {
    if (!fix) throw new Error("this sky holds no satellite of that kind");
    return fix.name;
  }

  /** The catalogue number behind a placed marker's name. */
  function noradOf(name: string): number {
    const entry = catalog.entries.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`${name} is not in the fixture`);
    return entry.noradId;
  }

  test("an object with a recorded brightness is judged on it", () => {
    const tracker = primedTracker();
    const detail = tracker.describe(named(recorded()), WHEN, observer)!;

    expect(detail.apparentMagnitude).not.toBeNull();
    expect(Number.isFinite(detail.apparentMagnitude!)).toBe(true);
    expect(["visible", "binoculars", "tooFaint"]).toContain(detail.nakedEye);
  });

  test("one nobody has recorded a brightness for says so instead of guessing", () => {
    // Most of the catalogue, and the honest answer for it: the app knows where
    // the object is and knows the sun is on it, and stops there.
    const tracker = primedTracker();
    const detail = tracker.describe(named(unrecorded()), WHEN, observer)!;

    expect(detail.apparentMagnitude).toBeNull();
    expect(detail.magnitudeMeasured).toBe(false);
    expect(detail.nakedEye).toBe("unknown");
  });

  test("and at noon the sky rules out everything, whatever is overhead", () => {
    // The sun's altitude travels with the detail so the card can say which of
    // the two things is missing — the light on the object, or the dark here.
    const noon = new Date("2026-08-30T10:00:00Z");
    const tracker = new SkyTracker(catalog, MASK_DEG);
    tracker.sweep(noon, observer, 0);
    const fixes = tracker.fixesAt(noon, observer);

    expect(fixes.length).toBeGreaterThan(0);
    for (const fix of fixes.slice(0, 30)) {
      const detail = tracker.describe(fix.name, noon, observer)!;
      expect(detail.sunAltitudeDeg).toBeGreaterThan(0);
      expect(detail.nakedEye).toBe("daylight");
    }
  });
});
