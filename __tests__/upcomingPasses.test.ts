import * as fs from "fs";
import * as path from "path";
import { LANDMARK_PATHS } from "../src/constants";
import { azimuthDeg } from "../src/coordinates/transform";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { wrapDegrees360 } from "../src/math/angles";
import { SatelliteCatalog } from "../src/satellite/catalog";
import { planSkyPaths, SkyPass } from "../src/satellite/orbitPath";
import { upcomingPasses } from "../src/satellite/upcomingPasses";
import { startSlicing } from "../src/timeSlice";
import { ObserverLocation } from "../src/types";

/**
 * The same place and clock the paths' own suite uses: Helsinki, a few days past
 * the committed catalog's epoch. At sixty degrees north the landmark tier is a
 * handful of objects, which is exactly the sky a list of what is coming has to
 * be worth reading on.
 */
const observer: ObserverLocation = { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 };
const MIDNIGHT = Date.UTC(2026, 7, 29, 0, 0, 0);

const catalog = new SatelliteCatalog(
  parseTleCatalog(
    fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
  )
);

/** The plan the sky is drawing, which is the only thing the list reads. */
async function plan(fromMs = MIDNIGHT): Promise<SkyPass[]> {
  return planSkyPaths(catalog, fromMs, observer, startSlicing());
}

test("says something about every pass the sky is drawing", async () => {
  const passes = await plan();
  const listed = upcomingPasses(passes, catalog, observer);

  // Not a selection of them: every line on the frame is a row, or the list is
  // offering a subset of the sky with nothing to say which subset.
  expect(listed).toHaveLength(passes.length);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.length).toBeLessThanOrEqual(LANDMARK_PATHS.maximumPaths);
  expect(new Set(listed.map((one) => one.name)).size).toBeGreaterThan(0);
});

test("soonest first, whatever order the plan came in", async () => {
  const passes = await plan();
  expect(passes.length).toBeGreaterThan(1);

  // The plan is ordered breadth first across the landmarks — every object's
  // first pass before any object's second — which is the right order for
  // spending four lines and says nothing about what happens next. Handed the
  // same passes backwards, the list has to come out the same way round.
  const forwards = upcomingPasses(passes, catalog, observer);
  const backwards = upcomingPasses([...passes].reverse(), catalog, observer);

  const times = forwards.map((one) => one.startsAtMs);
  expect(times).toEqual([...times].sort((one, other) => one - other));
  expect(backwards.map((one) => one.startsAtMs)).toEqual(times);
});

test("carries where to stand: the point it comes up at, not where it ends", async () => {
  const passes = await plan();
  const listed = upcomingPasses(passes, catalog, observer);

  for (const pass of listed) {
    const source = passes.find(
      (one) => one.noradId === pass.noradId && one.startsAtMs === pass.startsAtMs
    );
    if (!source) throw new Error("a listed pass that is not in the plan");

    const rise = wrapDegrees360(azimuthDeg(source.samples[0].position));
    const set = wrapDegrees360(azimuthDeg(source.samples[source.samples.length - 1].position));
    expect(pass.riseAzimuthDeg).toBeCloseTo(rise, 6);
    expect(pass.setAzimuthDeg).toBeCloseTo(set, 6);
    // A bearing is read off a compass rather than signed: due west is 270.
    expect(pass.riseAzimuthDeg).toBeGreaterThanOrEqual(0);
    expect(pass.riseAzimuthDeg).toBeLessThan(360);
  }
});

test("the peak is inside the pass, and is what the verdict is taken at", async () => {
  const passes = await plan();

  for (const pass of passes) {
    expect(pass.peakAtMs).toBeGreaterThanOrEqual(pass.startsAtMs);
    expect(pass.peakAtMs).toBeLessThanOrEqual(pass.endsAtMs);
  }

  const listed = upcomingPasses(passes, catalog, observer);
  for (const pass of listed) {
    expect(pass.peakAtMs).toBeGreaterThanOrEqual(pass.startsAtMs);
    expect(pass.peakAtMs).toBeLessThanOrEqual(pass.endsAtMs);
  }
});

test("a landmark's brightness is known, so its passes are judged rather than shrugged at", async () => {
  const listed = upcomingPasses(await plan(), catalog, observer);

  // Every object in the landmark tier has a recorded standard magnitude
  // (`standardMagnitude.ts` holds the two lists together), so no row on this
  // panel should be falling through to "nobody wrote it down".
  expect(listed.length).toBeGreaterThan(0);
  for (const pass of listed) {
    expect(pass.apparentMagnitude).not.toBeNull();
    expect(pass.nakedEye).not.toBe("unknown");
  }
});

test("a countdown is not a promise: daylight is said rather than left out", async () => {
  // Noon in Helsinki. The geometry is unchanged — the same objects cross the
  // same sky — and not one of the passes is a sighting, which is the case the
  // verdict exists for. A list that said only "ISS, 14 min" here would be
  // sending somebody outside to look at a blue sky.
  const noon = await plan(Date.UTC(2026, 7, 29, 9, 0, 0));
  const listed = upcomingPasses(noon, catalog, observer);

  expect(listed.length).toBeGreaterThan(0);
  for (const pass of listed) {
    expect(pass.nakedEye).toBe("daylight");
  }
});

test("and says so when one is worth going outside for", async () => {
  // Five in the morning, local. The station comes over in sunlight while the
  // ground under it is still dark, which is the whole of what makes a satellite
  // visible — and at magnitude -2 it is brighter than anything else in the sky.
  const listed = upcomingPasses(
    await plan(Date.UTC(2026, 7, 29, 2, 0, 0)),
    catalog,
    observer
  );
  const station = listed.find((pass) => pass.name === "ISS");

  expect(station?.nakedEye).toBe("visible");
  expect(station?.apparentMagnitude).toBeLessThan(0);
  expect(station?.magnitudeMeasured).toBe(true);
});

test("the same station three hours earlier is in the Earth's shadow, and is told so", async () => {
  // The pass is as real as the one above and no part of it can be seen: the
  // geometry puts the station on the sky and the Earth between it and the sun.
  // The two rows differ in the one channel a countdown cannot carry.
  const listed = upcomingPasses(await plan(), catalog, observer);
  const station = listed.find((pass) => pass.name === "ISS");

  expect(station?.nakedEye).toBe("eclipsed");
  // Reflecting nothing, so the arithmetic runs off rather than returning a
  // figure the panel could print. See `apparentMagnitude`.
  expect(station?.apparentMagnitude).toBe(Number.POSITIVE_INFINITY);
});

test("a pass whose object has left the catalog is dropped rather than half-described", async () => {
  const passes = await plan();
  // The catalog reloaded underneath a plan made against the last one: the
  // arithmetic behind a row needs the elements, and there is nothing to say
  // about an object that is no longer there.
  const empty = new SatelliteCatalog([]);

  expect(upcomingPasses(passes, empty, observer)).toEqual([]);
});

test("nothing planned is nothing said", () => {
  expect(upcomingPasses([], catalog, observer)).toEqual([]);
});
