import * as fs from "fs";
import * as path from "path";
import { GROUND_TRACK } from "../src/constants";
import {
  groundTrackBackdrop,
  groundTrackMoment,
  mapBoxFor,
  MapBox,
  Polyline,
  project
} from "../src/components/groundTrackScene";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { CatalogEntry, SatelliteCatalog } from "../src/satellite/catalog";
import { footprintRadiusDeg, GroundTrack, groundTrackFor, sampleAt } from "../src/satellite/groundTrack";
import { ObserverLocation } from "../src/types";

const CATALOG = fs.readFileSync(
  path.join(__dirname, "../testing/fixtures/active.tle"),
  "utf8"
);
const AT_MS = Date.UTC(2026, 7, 23, 12, 0, 0);
/** A card's width on a current phone, less its padding. */
const BOX = mapBoxFor(320);
const MILAN: ObserverLocation = { latitudeDeg: 45.46, longitudeDeg: 9.19, heightM: 120 };

function entryNamed(name: string): CatalogEntry {
  const tles = parseTleCatalog(CATALOG).filter((tle) => tle.name === name);
  if (tles.length === 0) throw new Error(`${name} is not in the fixture`);
  return new SatelliteCatalog(tles).entries[0];
}

function trackNamed(name: string): GroundTrack {
  const track = groundTrackFor(entryNamed(name), AT_MS);
  if (!track) throw new Error(`${name} has no ground track`);
  return track;
}

/** Whether any point of these lines lands inside the map. */
function touchesMap(lines: readonly Polyline[], box: MapBox): boolean {
  return lines.some((line) =>
    line.some(([x, y]) => x >= 0 && x <= box.width && y >= 0 && y <= box.height)
  );
}

describe("the projection", () => {
  test("puts the corners of the world at the corners of the box", () => {
    expect(project(-180, 90, BOX)).toEqual([0, 0]);
    expect(project(180, -90, BOX)).toEqual([BOX.width, BOX.height]);
    expect(project(0, 0, BOX)).toEqual([BOX.width / 2, BOX.height / 2]);
  });

  test("gives the map the aspect the projection has", () => {
    expect(mapBoxFor(360)).toEqual({ width: 360, height: 360 / GROUND_TRACK.aspect });
  });
});

describe("the backdrop", () => {
  const backdrop = groundTrackBackdrop(trackNamed("ISS"), BOX, MILAN);

  test("draws the world, the graticule and the equator", () => {
    expect(backdrop.land.length).toBeGreaterThan(50);
    expect(backdrop.graticule.length).toBeGreaterThan(4);
    // Straight across the middle, which is what makes a parked satellite read
    // as sitting on it.
    expect(backdrop.equator).toEqual([
      [0, BOX.height / 2],
      [BOX.width, BOX.height / 2]
    ]);
    for (const ring of backdrop.land) {
      for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(BOX.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(BOX.height);
      }
    }
  });

  test("puts the observer where the observer is", () => {
    const [x, y] = project(MILAN.longitudeDeg, MILAN.latitudeDeg, BOX);
    expect(backdrop.observer?.[0]).toBeCloseTo(x, 6);
    expect(backdrop.observer?.[1]).toBeCloseTo(y, 6);
  });

  test("leaves the observer off the map before there is a fix", () => {
    expect(groundTrackBackdrop(trackNamed("ISS"), BOX, null).observer).toBeNull();
  });

  test("draws a track that leaves the map again at the other edge", () => {
    // A low orbit covers most of a turn of longitude, so the one curve has to
    // be drawn more than once to be on the map from end to end.
    expect(backdrop.track.length).toBeGreaterThan(1);
    expect(touchesMap(backdrop.track, BOX)).toBe(true);
    // Every copy is the same shape, a whole map-width apart.
    const [first, second] = backdrop.track;
    expect(second).toHaveLength(first.length);
    for (let at = 0; at < first.length; at += 1) {
      expect(second[at][0] - first[at][0]).toBeCloseTo(BOX.width, 6);
      expect(second[at][1]).toBeCloseTo(first[at][1], 6);
    }
  });

  test("a satellite that holds station needs the track drawn once", () => {
    expect(groundTrackBackdrop(trackNamed("ASTRA 1KR"), BOX, MILAN).track).toHaveLength(1);
  });
});

describe("a moment of the animation", () => {
  test("keeps the satellite on the map wherever it is in its orbit", () => {
    for (const name of ["ISS", "ASTRA 1KR", "QZS-2 (MICHIBIKI-2)", "CALSPHERE 1"]) {
      const track = trackNamed(name);
      for (let step = 0; step < 90; step += 1) {
        const [x, y] = groundTrackMoment(track, step / 90, BOX).satellite;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(BOX.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(BOX.height);
      }
    }
  });

  test("says which moment of the orbit it is", () => {
    const track = trackNamed("ISS");
    const moment = groundTrackMoment(track, 0.25, BOX);
    expect(moment.atMs).toBeCloseTo(track.fromMs + track.spanMs * 0.25, 6);
    expect(moment.intoOrbitMinutes).toBeCloseTo(track.periodMinutes * 0.25, 6);
    // A low orbit sees a few per cent of the world at a time.
    expect(moment.share).toBeGreaterThan(0.01);
    expect(moment.share).toBeLessThan(0.1);
  });

  test("a geostationary satellite sees a good part of the world at once", () => {
    expect(groundTrackMoment(trackNamed("ASTRA 1KR"), 0, BOX).share).toBeGreaterThan(0.4);
  });

  test("draws a wake behind the dot, and wraps it round the start of the loop", () => {
    const track = trackNamed("ISS");
    // Part way in: one run of track behind the satellite.
    expect(groundTrackMoment(track, 0.5, BOX).wake.length).toBeGreaterThan(0);
    // And at the very start, where the wake reaches back past the beginning of
    // the track into the end of it — two runs rather than a line drawn
    // straight back across the map.
    const opening = groundTrackMoment(track, 0.01, BOX);
    expect(opening.wake.length).toBeGreaterThan(1);
    expect(touchesMap(opening.wake, BOX)).toBe(true);
  });

  test("ends the wake at the satellite", () => {
    const track = trackNamed("ISS");
    const moment = groundTrackMoment(track, 0.4, BOX);
    // The last point of some copy of the wake is the dot itself, give or take
    // the whole map-widths the copies are shifted by.
    const ends = moment.wake.map((run) => run[run.length - 1]);
    const [x, y] = moment.satellite;
    expect(
      ends.some(
        ([endX, endY]) =>
          Math.abs(endY - y) < 0.001 &&
          Math.abs(((endX - x) % BOX.width) % BOX.width) < 0.001
      )
    ).toBe(true);
  });
});

describe("the footprint", () => {
  test("is a closed ring round the satellite", () => {
    const track = trackNamed("ISS");
    const moment = groundTrackMoment(track, 0.3, BOX);
    expect(moment.footprint.length).toBeGreaterThan(0);
    for (const ring of moment.footprint) {
      expect(ring).toHaveLength(GROUND_TRACK.footprintPoints + 1);
      for (const [x, y] of ring) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
    // Nothing to close along a pole, so the outline is the ring itself.
    expect(moment.footprintEdge[0]).toEqual(moment.footprint[0]);
  });

  test("is closed along the edge of the map when it reaches over a pole", () => {
    // A navigation satellite 36,000 km up and tilted forty degrees swallows
    // the pole for most of its orbit.
    const track = trackNamed("QZS-2 (MICHIBIKI-2)");
    const over = [...Array(60).keys()]
      .map((step) => step / 60)
      .find((phase) => {
        const now = sampleAt(track, phase);
        return Math.abs(now.latitudeDeg) + footprintRadiusDeg(now.altitudeKm) > 90;
      });
    expect(over).toBeDefined();

    const moment = groundTrackMoment(track, over as number, BOX);
    // Two points more than the circle: up to the pole and back along it.
    expect(moment.footprint[0]).toHaveLength(GROUND_TRACK.footprintPoints + 3);
    // The outline stops at the circle, so nothing is stroked along the pole.
    expect(moment.footprintEdge[0]).toHaveLength(GROUND_TRACK.footprintPoints + 1);
    // And the closure runs along the top of the map rather than across it.
    const closure = moment.footprint[0].slice(-2);
    for (const [, y] of closure) expect(y).toBeCloseTo(0, 6);
  });

  test("is drawn either side of the date line when it straddles it", () => {
    // Over the Pacific, a geostationary footprint runs off both edges.
    const pacific = trackNamed("ASTRA 1KR");
    const moment = groundTrackMoment(pacific, 0, BOX);
    expect(moment.footprint.length).toBeGreaterThanOrEqual(1);
    expect(touchesMap(moment.footprint, BOX)).toBe(true);
  });
});
