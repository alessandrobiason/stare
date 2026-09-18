import * as fs from "fs";
import * as path from "path";
import { NAKED_EYE_PASSES, SKY_VISIBILITY } from "../src/constants";
import { sunAltitudeDeg } from "../src/coordinates/sunAltitude";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { SatelliteCatalog } from "../src/satellite/catalog";
import {
  brightestMagnitude,
  darkSpans,
  isSighting,
  nakedEyeCandidates,
  passesAheadFor,
  planSightings
} from "../src/satellite/nakedEyePasses";
import { passesOf } from "../src/satellite/orbitPath";
import { perigeeAltitudeKm } from "../src/satellite/propagator";
import { upcomingPasses } from "../src/satellite/upcomingPasses";
import { startSlicing } from "../src/timeSlice";
import { ObserverLocation } from "../src/types";

/**
 * What the passes panel and the alerts are made from: every pass that can be
 * seen with the naked eye, whatever object makes it.
 *
 * Milan, the day after the committed catalogue's elements were cut: late
 * August, with the station coming over before dawn.
 */
const observer: ObserverLocation = { latitudeDeg: 45.46, longitudeDeg: 9.19, heightM: 120 };
const NOON = Date.UTC(2026, 7, 24, 12, 0, 0);
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

const ISS = 25544;
const TIANGONG = 48274;
const HUBBLE = 20580;

const catalog = new SatelliteCatalog(
  parseTleCatalog(
    fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
  )
);

describe("which objects are searched", () => {
  const candidates = nakedEyeCandidates(catalog);
  const ids = new Set(candidates.map((entry) => entry.noradId));

  test("the ones everybody goes outside for", () => {
    expect(ids).toContain(ISS);
    expect(ids).toContain(TIANGONG);
    expect(ids).toContain(HUBBLE);
  });

  test("and not only the landmarks", () => {
    // A constellation's satellites while they are still low are the string of
    // lights people do go out for.
    expect(candidates.some((entry) => entry.category !== "LANDMARK")).toBe(true);
  });

  test("but not a constellation at its working altitude", () => {
    // Ten thousand of them at magnitude four on the best night of the year
    // would be a list nobody could read and a search nobody could afford.
    const working = catalog.entries.filter(
      (entry) => /^STARLINK/.test(entry.name) && perigeeAltitudeKm(entry.satrec) > 400
    );
    expect(working.length).toBeGreaterThan(1000);
    for (const entry of working) expect(ids.has(entry.noradId)).toBe(false);
    expect(candidates.length).toBeLessThan(200);
  });

  test("only objects that could clear the bar, and each of them once", () => {
    for (const entry of candidates) {
      expect(brightestMagnitude(entry)).toBeLessThanOrEqual(NAKED_EYE_PASSES.candidateMagnitude);
    }
    expect(ids.size).toBe(candidates.length);
  });

  test("a brightness nobody recorded is not a candidate", () => {
    const unrecorded = catalog.entries.find((entry) => brightestMagnitude(entry) === null);
    if (!unrecorded) throw new Error("the fixture has no object without a brightness");
    expect(ids.has(unrecorded.noradId)).toBe(false);
  });
});

describe("the hours worth searching", () => {
  const untilMs = NOON + 24 * MS_PER_HOUR;
  const spans = darkSpans(NOON, untilMs, observer);

  test("one night in a day, inside the window", () => {
    expect(spans).toHaveLength(1);
    expect(spans[0].fromMs).toBeGreaterThanOrEqual(NOON);
    expect(spans[0].untilMs).toBeLessThanOrEqual(untilMs);
  });

  test("every minute dark enough to see anything is inside one", () => {
    for (let atMs = NOON; atMs < untilMs; atMs += MS_PER_MINUTE) {
      if (sunAltitudeDeg(observer, new Date(atMs)) > SKY_VISIBILITY.daylightAboveDeg) continue;
      const padMs = NAKED_EYE_PASSES.darknessPadMinutes * MS_PER_MINUTE;
      // With the pad either side, so a pass peaking at dusk still has its rise.
      expect(
        spans.some((span) => span.fromMs <= atMs - padMs && atMs + padMs <= span.untilMs)
      ).toBe(true);
    }
  });

  test("and the middle of the day is not", () => {
    const midday = Date.UTC(2026, 7, 25, 11, 0, 0);
    expect(spans.some((span) => span.fromMs <= midday && midday <= span.untilMs)).toBe(false);
  });
});

describe("the day's sightings", () => {
  let sightings: Awaited<ReturnType<typeof planSightings>> = [];
  beforeAll(async () => {
    sightings = await planSightings(catalog, NOON, observer, startSlicing());
  }, 60_000);

  test("are all ones the naked eye can see, soonest first", () => {
    expect(sightings.length).toBeGreaterThan(0);
    for (const pass of sightings) expect(pass.nakedEye).toBe("visible");
    const times = sightings.map((pass) => pass.startsAtMs);
    expect(times).toEqual([...times].sort((one, other) => one - other));
  });

  test("and are the ones a search through the whole day would find", async () => {
    // Searching the dark hours alone is a saving, not a filter: nothing that
    // can be seen is ever in the daylight left out.
    const whole = await passesOf(nakedEyeCandidates(catalog), NOON, observer, startSlicing(), [
      { fromMs: NOON, untilMs: NOON + 24 * MS_PER_HOUR }
    ]);
    const everything = upcomingPasses(whole, catalog, observer).filter(isSighting);

    expect(sightings.map((pass) => pass.noradId)).toEqual(
      everything.map((pass) => pass.noradId)
    );
    sightings.forEach((pass, index) => {
      expect(Math.abs(pass.peakAtMs - everything[index].peakAtMs)).toBeLessThan(5000);
    });
  }, 60_000);

  test("and the card finds the same pass for the object it is showing", async () => {
    const [first] = sightings;
    const entry = catalog.entries.find((one) => one.noradId === first.noradId);
    if (!entry) throw new Error("a sighting of an object that is not in the catalog");

    const ahead = await passesAheadFor(entry, NOON, observer, startSlicing());
    const same = ahead.find((pass) => Math.abs(pass.peakAtMs - first.peakAtMs) < 5000);
    expect(same?.nakedEye).toBe("visible");
  }, 60_000);
});
