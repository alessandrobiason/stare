import * as fs from "fs";
import * as path from "path";
import { MINIMUM_SATELLITE_ELEVATION_DEG } from "../src/constants";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { SatelliteCatalog } from "../src/satellite/catalog";
import { SATELLITE_CATEGORIES } from "../src/satellite/categories";
import {
  buildDirectory,
  DIRECTORY_HORIZON_DEG,
  DirectorySection,
  locateAll,
  searchDirectory
} from "../src/satellite/directory";
import { fleetOf } from "../src/satellite/fleets";
import { startSlicing } from "../src/timeSlice";
import { ObserverLocation } from "../src/types";

/**
 * The committed catalog, a real place and a real clock.
 *
 * The directory is a thing to find satellites in, so every check below is made
 * against the catalogue as it actually is — sixteen thousand names, most of
 * them Starlink — rather than against a fixture shaped to pass. Helsinki and
 * the same midnight the pass suites use: at sixty degrees north a good deal of
 * the catalogue is under the horizon, which is the sky this tab exists for.
 */
const observer: ObserverLocation = { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 };
const MIDNIGHT = Date.UTC(2026, 7, 29, 0, 0, 0);

const catalog = new SatelliteCatalog(
  parseTleCatalog(
    fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
  )
);

const sections = buildDirectory(catalog);

/** Every group in the index, whatever heading it is under. */
function allGroups(index: readonly DirectorySection[] = sections) {
  return index.flatMap((section) => section.groups);
}

describe("the index", () => {
  test("holds the whole catalog, once each", () => {
    // Nothing may be dropped on the way in — a catalog tab that quietly loses
    // objects is worse than none, because the one it lost is the one somebody
    // came looking for — and nothing may be listed twice, which is what a
    // fleet filed under two headings would do.
    const listed = allGroups().flatMap((group) => group.entries);

    expect(listed).toHaveLength(catalog.size);
    expect(new Set(listed).size).toBe(catalog.size);
  });

  test("is headed in the legend's own order, so the tab and the filter agree", () => {
    const order = sections.map((section) => section.category);
    expect(order).toEqual(SATELLITE_CATEGORIES.filter((category) => order.includes(category)));
  });

  test("lists the fleets `fleets.ts` names, under names it does not translate", () => {
    const named = allGroups().filter((group) => group.name !== null);
    const starlink = named.find((group) => group.name === "Starlink");

    expect(starlink).toBeDefined();
    // Half the catalogue, which is the fact the index exists to make legible.
    expect(starlink!.entries.length).toBeGreaterThan(catalog.size / 3);
    for (const group of named) {
      expect(group.entries.every((entry) => fleetOf(entry.name) === group.name)).toBe(true);
    }
  });

  test("gives each heading its own residual rather than one for the catalogue", () => {
    // "Everything unnamed" across sixteen thousand objects is not a row anybody
    // would open; "the unnamed Earth-observation satellites" is.
    const residuals = allGroups().filter((group) => group.name === null);

    expect(residuals.length).toBeGreaterThan(1);
    expect(new Set(residuals.map((group) => group.category)).size).toBe(residuals.length);
    for (const group of residuals) {
      expect(group.entries.every((entry) => fleetOf(entry.name) === null)).toBe(true);
    }
  });

  test("puts each fleet under the heading most of it belongs to", () => {
    // A fleet is not guaranteed to be one category: `COSMOS` carries imaging
    // satellites, early-warning satellites and rocket bodies under one name.
    // Whichever heading it lands under, all of it lands there together.
    for (const section of sections) {
      for (const group of section.groups) {
        const here = group.entries.filter((entry) => entry.category === section.category).length;
        for (const other of SATELLITE_CATEGORIES) {
          const there = group.entries.filter((entry) => entry.category === other).length;
          expect(here).toBeGreaterThanOrEqual(there);
        }
      }
    }
  });

  test("orders a heading largest first, with the unnamed last", () => {
    for (const section of sections) {
      const sizes = section.groups
        .filter((group) => group.name !== null)
        .map((group) => group.entries.length);
      expect([...sizes].sort((one, other) => other - one)).toEqual(sizes);

      const residual = section.groups.findIndex((group) => group.name === null);
      if (residual >= 0) expect(residual).toBe(section.groups.length - 1);
    }
  });

  test("names every landmark as a fleet of its own, so each is one row", () => {
    // Which is what lets the highlights come out of the same machinery as
    // Starlink rather than being a list beside it. See `CatalogScreen`.
    const highlights = sections.find((section) => section.category === "LANDMARK");

    expect(highlights).toBeDefined();
    expect(highlights!.groups.some((group) => group.name === "ISS")).toBe(true);
    expect(highlights!.groups.some((group) => group.name === "Hubble")).toBe(true);
  });
});

describe("looking something up by name", () => {
  test("finds one object among sixteen thousand", () => {
    const found = searchDirectory(sections, "hubble", 40);
    expect(found.entries.map((entry) => entry.name)).toContain("Hubble");
  });

  test("is not case sensitive, because a catalogue name is shouted", () => {
    expect(searchDirectory(sections, "iss", 40).entries.length).toBeGreaterThan(0);
    expect(searchDirectory(sections, "ISS", 40).entries).toEqual(
      searchDirectory(sections, "iss", 40).entries
    );
  });

  test("answers a fleet's name with the fleet, not with a thousand rows of it", () => {
    // `star` is Starlink, which nobody wants listed one by one — and it is also
    // `STARLETTE`, a geodetic sphere somebody may have come looking for. Both.
    const found = searchDirectory(sections, "star", 40);

    expect(found.groups.map((group) => group.name)).toContain("Starlink");
    expect(found.entries.length).toBeLessThanOrEqual(40);
  });

  test("puts the names that begin with the query first", () => {
    // What makes `noaa` find the weather satellites rather than three hundred
    // objects with those letters somewhere in the middle.
    const found = searchDirectory(sections, "noaa", 40);
    expect(found.entries.length).toBeGreaterThan(0);
    expect(found.entries[0].name.toUpperCase().startsWith("NOAA")).toBe(true);
  });

  test("an empty query is not a query", () => {
    // The screen browses rather than searching until something is typed, and a
    // blank field matching everything would list the catalogue alphabetically.
    for (const query of ["", "   "]) {
      expect(searchDirectory(sections, query, 40)).toEqual({ groups: [], entries: [] });
    }
  });

  test("says nothing rather than something wrong for a name nobody uses", () => {
    expect(searchDirectory(sections, "zzzznotasatellite", 40)).toEqual({
      groups: [],
      entries: []
    });
  });
});

describe("where those objects are", () => {
  /** The highlights, which are the objects the screen asks about unfiltered. */
  const highlights = sections
    .find((section) => section.category === "LANDMARK")!
    .groups.flatMap((group) => [...group.entries]);

  test("places them where the sky says they are", async () => {
    const fixes = await locateAll(highlights, MIDNIGHT, observer, startSlicing());

    expect(fixes.length).toBeGreaterThan(0);
    for (const fix of fixes) {
      // A bearing is read off a compass rather than signed, and an elevation
      // runs from underfoot to overhead.
      expect(fix.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(fix.azimuthDeg).toBeLessThan(360);
      expect(fix.elevationDeg).toBeGreaterThanOrEqual(-90);
      expect(fix.elevationDeg).toBeLessThanOrEqual(90);
    }
  });

  test("highest first, which is the order the question is asked in", async () => {
    const fixes = await locateAll(highlights, MIDNIGHT, observer, startSlicing());
    const elevations = fixes.map((fix) => fix.elevationDeg);

    expect([...elevations].sort((one, other) => other - one)).toEqual(elevations);
  });

  test("keeps what is under the horizon when nobody asked for a floor", async () => {
    // The highlights are a dozen objects somebody knows the names of, so "34°
    // below, to the south-east" is worth a row. Most of them are under the
    // horizon from anywhere at any moment, and at sixty degrees north more so.
    const fixes = await locateAll(highlights, MIDNIGHT, observer, startSlicing());

    expect(fixes.some((fix) => fix.elevationDeg < 0)).toBe(true);
  });

  test("and drops it when a fleet is asked what is up", async () => {
    const starlink = allGroups().find((group) => group.name === "Starlink")!;
    const up = await locateAll(
      starlink.entries,
      MIDNIGHT,
      observer,
      startSlicing(),
      DIRECTORY_HORIZON_DEG
    );

    expect(up.length).toBeGreaterThan(0);
    expect(up.length).toBeLessThan(starlink.entries.length);
    for (const fix of up) expect(fix.elevationDeg).toBeGreaterThanOrEqual(DIRECTORY_HORIZON_DEG);
  });

  test("agrees with the floor the sky draws at, so a listed object has a mark", () => {
    // The catalog and the overlay have to be describing the same sky: an object
    // this list says is up is one there is a mark on the picture to go and find.
    expect(DIRECTORY_HORIZON_DEG).toBe(MINIMUM_SATELLITE_ELEVATION_DEG);
  });

  test("lets a frame queued behind it run, because it is a sheet over a camera", async () => {
    // Eight thousand propagations is fifty-odd milliseconds against a slice
    // budget of eight, and the camera underneath is still drawing. Same
    // mechanism as the catalog build's — see `src/timeSlice.ts`.
    const starlink = allGroups().find((group) => group.name === "Starlink")!;
    let drawn = false;
    setTimeout(() => {
      drawn = true;
    }, 0);

    await locateAll(starlink.entries, MIDNIGHT, observer, startSlicing());

    expect(drawn).toBe(true);
  });
});
