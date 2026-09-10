import { SAMPLE_TLE } from "../src/data/sampleTle";
import { SatelliteCatalog } from "../src/satellite/catalog";
import {
  classifySatellite,
  isDuplicateEntry,
  isParked,
  isStarlink,
  noradId
} from "../src/satellite/categories";
import { Tle } from "../src/types";

/** Line 2 of a geostationary object: one revolution per day. */
const parkedLine2 = "2 28868  0.0231  86.1932 0001846  85.1996  31.0287  1.00270000210039";
/** The real ISS elements, for the catalogue-number tests. */
const issLine1 = "1 25544U 98067A   26235.00000000  .00001264  00000-0  29621-4 0  9995";

test("drops entries SGP4 cannot initialise", () => {
  const broken: Tle = { ...SAMPLE_TLE, name: "BROKEN", line1: "1 xxx", line2: "2 xxx" };
  expect(new SatelliteCatalog([SAMPLE_TLE, broken]).size).toBe(1);
});

test("carries the parked flag through to the catalogue entry", () => {
  const parked: Tle = { ...SAMPLE_TLE, parked: true };
  expect(new SatelliteCatalog([parked]).entries[0].parked).toBe(true);
});

describe("building it without stalling what is on screen", () => {
  /**
   * Enough elements that the build cannot fit inside one slice on any machine
   * this will run on: a few thousand SGP4 initialisations is a hundred-odd
   * milliseconds here against a budget of eight.
   */
  const many: Tle[] = new Array(5_000).fill(SAMPLE_TLE);

  /** Something queued on the thread ahead of the build, standing in for a frame. */
  function queueFrame(): () => boolean {
    let drawn = false;
    setTimeout(() => {
      drawn = true;
    }, 0);
    return () => drawn;
  }

  test("the sliced build lets a frame queued behind it run", async () => {
    const drawn = queueFrame();
    await SatelliteCatalog.build(many);

    expect(drawn()).toBe(true);
  });

  test("the synchronous constructor does not, which is why `build` exists", () => {
    const drawn = queueFrame();
    expect(new SatelliteCatalog(many).size).toBe(many.length);

    expect(drawn()).toBe(false);
  });

  test("slicing changes nothing about what is built", async () => {
    const broken: Tle = { ...SAMPLE_TLE, name: "BROKEN", line1: "1 xxx", line2: "2 xxx" };
    const tles = [SAMPLE_TLE, broken, { ...SAMPLE_TLE, name: "SAT TWO", parked: true }];

    expect((await SatelliteCatalog.build(tles)).entries).toEqual(
      new SatelliteCatalog(tles).entries
    );
  });
});

test("reads the catalogue number from either element line", () => {
  expect(noradId(issLine1)).toBe(25544);
  expect(noradId(parkedLine2)).toBe(28868);
});

test("classifies satellites by purpose, falling back to the residual", () => {
  expect(classifySatellite("GPS BIIR-2")).toBe("NAVIGATION");
  expect(classifySatellite("SENTINEL-2A")).toBe("EARTH");
  expect(classifySatellite("STARLINK-1234")).toBe("COMMS");
  expect(classifySatellite("IRIDIUM 106")).toBe("COMMS");
  expect(classifySatellite("SOMETHING ELSE")).toBe("OTHER");
});

test("singles Starlink out without moving it out of communications", () => {
  // The filter's one special case: still comms, still that colour, but with a
  // switch of its own because it is about half of what is over any given head.
  expect(classifySatellite("STARLINK-1234")).toBe("COMMS");
  expect(isStarlink("STARLINK-1234")).toBe(true);
  expect(isStarlink("Starlink-1234")).toBe(true);

  // Anchored, so it is the fleet rather than anything with the word in it.
  expect(isStarlink("STARLINER")).toBe(false);
  expect(isStarlink("ONEWEB-0012")).toBe(false);
  expect(isStarlink("SOME STARLINK LOOKALIKE")).toBe(false);
});

test("treats an unrecognised parked object as communications", () => {
  expect(classifySatellite("MYSTERY SAT", parkedLine2)).toBe("COMMS");
  expect(classifySatellite("MYSTERY SAT", SAMPLE_TLE.line2)).toBe("OTHER");
});

test("recognises landmarks by catalogue number, not by name", () => {
  // CelesTrak calls Hubble "HST" and Chandra "CXO", so a name test for either
  // finds nothing — while "HUBBLE 6" is a different satellite altogether.
  const hubbleLine1 = "1 20580U 90037B   26235.00000000  .00001264  00000-0  29621-4 0  9995";
  expect(classifySatellite("HST", undefined, hubbleLine1)).toBe("LANDMARK");
  expect(classifySatellite("HUBBLE 6")).toBe("OTHER");
  // POISK is an ISS module whose name says nothing about the station.
  expect(classifySatellite("ISS (ZARYA)", undefined, issLine1)).toBe("LANDMARK");
});

test("keeps mission-named crew and cargo vehicles in the landmark tier", () => {
  // These are renumbered every few months, so the catalogue number cannot
  // carry them and the name has to.
  expect(classifySatellite("SHENZHOU-23 (SZ-23)")).toBe("LANDMARK");
  expect(classifySatellite("CREW DRAGON 12")).toBe("LANDMARK");
  expect(classifySatellite("PROGRESS-MS 33")).toBe("LANDMARK");
});

test("does not promote shed station debris to a landmark", () => {
  expect(classifySatellite("ISS OBJECT YJ")).toBe("OTHER");
});

test("marks the extra station modules as duplicates of the station", () => {
  // POISK: the same object as ISS (ZARYA), in the same place.
  const poiskLine1 = "1 36086U 09070A   26235.00000000  .00001264  00000-0  29621-4 0  9995";
  expect(isDuplicateEntry(poiskLine1)).toBe(true);
  expect(isDuplicateEntry(issLine1)).toBe(false);
});

test("detects a geostationary orbit from its mean motion", () => {
  expect(isParked(parkedLine2)).toBe(true);
  expect(isParked(SAMPLE_TLE.line2)).toBe(false);
  expect(isParked(undefined)).toBe(false);
});
