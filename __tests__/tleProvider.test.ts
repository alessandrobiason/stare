import { SAMPLE_TLE } from "../src/data/sampleTle";
import { parseCatalogInSlices, parseTleCatalog } from "../src/data/tleProvider";

/** Downloading, caching and the refresh interval live in `tleCache.test.ts`. */

test("parses catalog entries and assigns a category", () => {
  const catalog = `\n${SAMPLE_TLE.name}\n${SAMPLE_TLE.line1}\n${SAMPLE_TLE.line2}\n`;
  expect(parseTleCatalog(catalog)).toEqual([SAMPLE_TLE]);
});

test("skips stray lines instead of failing the whole catalog", () => {
  const catalog = [
    "GARBAGE HEADER",
    "STARLINK-1",
    SAMPLE_TLE.line1,
    SAMPLE_TLE.line2,
    "TRAILING NOISE"
  ].join("\n");
  const parsed = parseTleCatalog(catalog);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].name).toBe("STARLINK-1");
  expect(parsed[0].category).toBe("COMMS");
});

test("flags a geostationary entry as parked", () => {
  const parkedLine2 = "2 99999  0.0231  86.1932 0001846  85.1996  31.0287  1.00270000210039";
  const catalog = ["ASTRA 1KR", SAMPLE_TLE.line1, parkedLine2].join("\n");
  expect(parseTleCatalog(catalog)[0].parked).toBe(true);
});

test("drops the station modules catalogued alongside the station", () => {
  // The ISS is listed a module at a time. Kept, they stack five markers and
  // five labels on one coordinate; only the entry standing for the station
  // survives.
  const modules = [
    ["ISS (ZARYA)", "1 25544U 98067A   26235.00000000  .00001264  00000-0  29621-4 0  9995"],
    ["ISS (NAUKA)", "1 49044U 21066A   26235.00000000  .00001264  00000-0  29621-4 0  9995"],
    ["POISK", "1 36086U 09070A   26235.00000000  .00001264  00000-0  29621-4 0  9995"]
  ];
  const catalog = modules.flatMap(([name, line1]) => [name, line1, SAMPLE_TLE.line2]).join("\n");

  const parsed = parseTleCatalog(catalog);
  // And the survivor is called what a person would call it, not after the
  // first module bolted to it.
  expect(parsed.map((tle) => tle.name)).toEqual(["ISS"]);
  expect(parsed[0].category).toBe("LANDMARK");
});

test("leaves every other name exactly as the catalogue gives it", () => {
  const catalog = ["STARLINK-1234", SAMPLE_TLE.line1, SAMPLE_TLE.line2].join("\n");
  expect(parseTleCatalog(catalog)[0].name).toBe("STARLINK-1234");
});

test("the sliced parse boot uses reads the catalogue the same way", async () => {
  // Boot parses in slices so the boot sky keeps its frames (`src/timeSlice.ts`).
  // The two must not be allowed to drift into reading the feed differently.
  const catalog = [
    "GARBAGE HEADER",
    "STARLINK-1",
    SAMPLE_TLE.line1,
    SAMPLE_TLE.line2,
    "ISS (ZARYA)",
    "1 25544U 98067A   26235.00000000  .00001264  00000-0  29621-4 0  9995",
    SAMPLE_TLE.line2,
    "POISK",
    "1 36086U 09070A   26235.00000000  .00001264  00000-0  29621-4 0  9995",
    SAMPLE_TLE.line2,
    "TRAILING NOISE"
  ].join("\r\n");

  await expect(parseCatalogInSlices(catalog)).resolves.toEqual(parseTleCatalog(catalog));
  expect(parseTleCatalog(catalog).map((tle) => tle.name)).toEqual(["STARLINK-1", "ISS"]);
});
