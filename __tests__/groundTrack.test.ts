import * as fs from "fs";
import * as path from "path";
import { GROUND_TRACK } from "../src/constants";
import { worldOutline } from "../src/data/worldOutline";
import { CatalogEntry, SatelliteCatalog } from "../src/satellite/catalog";
import {
  footprintRadiusDeg,
  footprintShare,
  GroundTrack,
  groundTrackFor,
  loopSecondsFor,
  sampleAt
} from "../src/satellite/groundTrack";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { Tle } from "../src/types";

/**
 * Real objects, because the three shapes the map exists to show are properties
 * of real orbits rather than of anything that can be written down as a
 * fixture: a low orbit that circles the world, a satellite that holds station
 * over one longitude, and a day-long orbit tilted enough to draw a figure of
 * eight. Synthetic elements would be a test of arithmetic this file already
 * trusts; these are a test of whether the picture is the picture.
 */
const CATALOG = fs.readFileSync(
  path.join(__dirname, "../testing/fixtures/active.tle"),
  "utf8"
);

/** A moment inside the fixture's elements, so nothing is propagated far. */
const AT_MS = Date.UTC(2026, 7, 23, 12, 0, 0);

function entryNamed(name: string): CatalogEntry {
  const tles: Tle[] = parseTleCatalog(CATALOG).filter((tle) => tle.name === name);
  if (tles.length === 0) throw new Error(`${name} is not in the fixture`);
  const entry = new SatelliteCatalog(tles).entries[0];
  if (!entry) throw new Error(`${name} has elements SGP4 will not take`);
  return entry;
}

function trackNamed(name: string): GroundTrack {
  const track = groundTrackFor(entryNamed(name), AT_MS);
  if (!track) throw new Error(`${name} has no ground track`);
  return track;
}

/** How far the track wanders north and south, and around the world. */
function spanOf(track: GroundTrack) {
  const latitudes = track.samples.map((sample) => sample.latitudeDeg);
  const longitudes = track.samples.map((sample) => sample.longitudeDeg);
  return {
    latitudeDeg: Math.max(...latitudes) - Math.min(...latitudes),
    longitudeDeg: Math.max(...longitudes) - Math.min(...longitudes)
  };
}

describe("the shape a ground track draws", () => {
  test("a low orbit goes right round the world in an hour and a half", () => {
    const iss = trackNamed("ISS");

    expect(iss.periodMinutes).toBeGreaterThan(88);
    expect(iss.periodMinutes).toBeLessThan(96);
    // The Earth turns about 23 degrees under it while it goes round, so the
    // track covers a turn less that much rather than a full one.
    expect(spanOf(iss).longitudeDeg).toBeGreaterThan(300);
    // And it reaches the inclination north and south, which is what makes the
    // shape a wave rather than a line.
    expect(spanOf(iss).latitudeDeg).toBeGreaterThan(90);
  });

  test("a satellite that holds station does not move", () => {
    const astra = trackNamed("ASTRA 1KR");

    // A sidereal day, which is what makes it hold station.
    expect(astra.periodMinutes).toBeGreaterThan(1430);
    expect(astra.periodMinutes).toBeLessThan(1440);
    // The whole of its orbit fits inside a couple of degrees of the map, which
    // at the size this is drawn is a stationary dot.
    expect(spanOf(astra).longitudeDeg).toBeLessThan(2);
    expect(spanOf(astra).latitudeDeg).toBeLessThan(3);
    // On the equator: the line the map draws a shade stronger for this reason.
    for (const sample of astra.samples) expect(Math.abs(sample.latitudeDeg)).toBeLessThan(2);
  });

  test("a tilted day-long orbit draws a closed figure over one part of the world", () => {
    const qzs = trackNamed("QZS-2 (MICHIBIKI-2)");

    // The same period as the geostationary belt — and a long way off the
    // equator, which is the whole of the difference.
    expect(qzs.periodMinutes).toBeGreaterThan(1430);
    expect(spanOf(qzs).latitudeDeg).toBeGreaterThan(60);
    // It stays over one part of the world rather than crossing it.
    expect(spanOf(qzs).longitudeDeg).toBeLessThan(60);
    // Over Japan and Australia, which is what it is up there for.
    const longitudes = qzs.samples.map((sample) => sample.longitudeDeg);
    const middle = (Math.max(...longitudes) + Math.min(...longitudes)) / 2;
    expect(middle).toBeGreaterThan(110);
    expect(middle).toBeLessThan(160);
    // And it closes: one orbit ends where it began, which is what makes a loop
    // rather than an arc. The closing sample repeats the opening one.
    const first = qzs.samples[0];
    const last = qzs.samples[qzs.samples.length - 1];
    expect(Math.abs(last.latitudeDeg - first.latitudeDeg)).toBeLessThan(1);
    expect(Math.abs(last.longitudeDeg - first.longitudeDeg)).toBeLessThan(1);
  });

  test("longitude runs continuously rather than jumping at the date line", () => {
    // A near-polar orbit is the hard case: the sub-point swings through a lot
    // of longitude in a moment as it passes the pole, and an unwrap that got
    // it wrong would show up as a step of a whole turn.
    for (const name of ["ISS", "CALSPHERE 1"]) {
      const track = trackNamed(name);
      for (let at = 1; at < track.samples.length; at += 1) {
        const step = track.samples[at].longitudeDeg - track.samples[at - 1].longitudeDeg;
        expect(Math.abs(step)).toBeLessThan(180);
      }
    }
  });

  test("a track is sampled in equal steps of time", () => {
    const track = trackNamed("ISS");
    expect(track.samples).toHaveLength(GROUND_TRACK.samples + 1);
    expect(track.fromMs).toBe(AT_MS);
    expect(track.spanMs).toBeCloseTo(track.periodMinutes * 60000, 6);

    // To well inside a millisecond, which is as equal as a fraction of a
    // period computed in floating point gets to be.
    const step = track.samples[1].atMs - track.samples[0].atMs;
    for (let at = 1; at < track.samples.length; at += 1) {
      const taken = track.samples[at].atMs - track.samples[at - 1].atMs;
      expect(Math.abs(taken - step)).toBeLessThan(1);
    }
  });

  test("elements that do not describe a drawable orbit get no track", () => {
    const entry = entryNamed("ISS");
    // An orbit slower than the ceiling: whatever the elements are doing, one
    // turn of it is not a picture of anything.
    const slow: CatalogEntry = {
      ...entry,
      satrec: { ...entry.satrec, no: (2 * Math.PI) / (GROUND_TRACK.maximumPeriodMinutes + 1) }
    };
    expect(groundTrackFor(slow, AT_MS)).toBeNull();
    expect(groundTrackFor({ ...entry, satrec: { ...entry.satrec, no: 0 } }, AT_MS)).toBeNull();
  });
});

describe("the footprint", () => {
  test("is the cone the satellite looks down, as an angle at the Earth's centre", () => {
    // The station sees a patch about 2,200 km across; a navigation satellite a
    // third of the planet; a geostationary one rather more than that.
    expect(footprintRadiusDeg(420)).toBeCloseTo(19.8, 0);
    expect(footprintRadiusDeg(20180)).toBeCloseTo(76.1, 0);
    expect(footprintRadiusDeg(35786)).toBeCloseTo(81.3, 0);
    // Nothing on the ground sees past its own horizon.
    expect(footprintRadiusDeg(0)).toBe(0);
    expect(footprintRadiusDeg(-5)).toBe(0);
  });

  test("grows with height, and never past half the world", () => {
    let previous = 0;
    for (const altitudeKm of [200, 800, 2000, 8000, 20000, 36000, 400000]) {
      const radius = footprintRadiusDeg(altitudeKm);
      expect(radius).toBeGreaterThan(previous);
      expect(radius).toBeLessThan(90);
      previous = radius;
    }
  });

  test("covers the share of the Earth the cap comes to", () => {
    expect(footprintShare(0)).toBe(0);
    // Half the sphere at the limit, which nothing reaches.
    expect(footprintShare(90)).toBeCloseTo(0.5, 6);
    // The station covers about three per cent of the world at any moment; a
    // geostationary satellite something over two fifths of it.
    expect(footprintShare(footprintRadiusDeg(420))).toBeCloseTo(0.03, 2);
    expect(footprintShare(footprintRadiusDeg(35786))).toBeGreaterThan(0.4);
  });
});

describe("flying the track", () => {
  test("a phase is a time, and the ends of the loop are its ends", () => {
    const track = trackNamed("ISS");
    expect(sampleAt(track, 0).atMs).toBeCloseTo(track.fromMs, 6);
    expect(sampleAt(track, 1).atMs).toBeCloseTo(track.fromMs + track.spanMs, 6);
    expect(sampleAt(track, 0.5).atMs).toBeCloseTo(track.fromMs + track.spanMs / 2, 6);
    // Out of range is clamped rather than extrapolated: a phase is a place on
    // this orbit, and there is nowhere on it past the end.
    expect(sampleAt(track, 1.4).atMs).toBeCloseTo(sampleAt(track, 1).atMs, 6);
    expect(sampleAt(track, -0.4).atMs).toBeCloseTo(sampleAt(track, 0).atMs, 6);
  });

  test("it interpolates between samples rather than stepping over them", () => {
    const track = trackNamed("ISS");
    const steps = track.samples.length - 1;
    // Half way between two samples, which is a position no sample carries.
    const between = sampleAt(track, 1.5 / steps);
    const from = track.samples[1];
    const to = track.samples[2];
    expect(between.latitudeDeg).toBeCloseTo((from.latitudeDeg + to.latitudeDeg) / 2, 6);
    expect(between.longitudeDeg).toBeCloseTo((from.longitudeDeg + to.longitudeDeg) / 2, 6);
  });

  test("a slower orbit takes longer to fly, but nothing like as much longer", () => {
    const low = loopSecondsFor(92);
    const geostationary = loopSecondsFor(1436);
    expect(geostationary).toBeGreaterThan(low);
    // The point of the stretch: a sixteen-fold difference in period is a
    // difference of about two in how long the loop takes, so neither object is
    // unwatchable and neither is flown at the other's rate.
    expect(geostationary / low).toBeGreaterThan(1.3);
    expect(geostationary / low).toBeLessThan(4);

    const { minimumSeconds, maximumSeconds } = GROUND_TRACK.animation;
    for (const minutes of [1, 30, 92, 720, 1436, 2880]) {
      expect(loopSecondsFor(minutes)).toBeGreaterThanOrEqual(minimumSeconds);
      expect(loopSecondsFor(minutes)).toBeLessThanOrEqual(maximumSeconds);
    }
    // Elements with no period fall back to the reference rather than to NaN.
    expect(loopSecondsFor(0)).toBe(GROUND_TRACK.animation.referenceSeconds);
    expect(loopSecondsFor(Number.NaN)).toBe(GROUND_TRACK.animation.referenceSeconds);
  });
});

describe("the bundled coastline", () => {
  test("decodes to rings inside the world", () => {
    const rings = worldOutline();
    expect(rings.length).toBeGreaterThan(50);
    for (const ring of rings) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      for (const [longitude, latitude] of ring) {
        expect(longitude).toBeGreaterThanOrEqual(-180);
        expect(longitude).toBeLessThanOrEqual(180);
        expect(latitude).toBeGreaterThanOrEqual(-90);
        expect(latitude).toBeLessThanOrEqual(90);
      }
    }
  });

  test("is decoded once and kept", () => {
    expect(worldOutline()).toBe(worldOutline());
  });

  test("puts land where there is land, and none where there is not", () => {
    // Four places, read off the rings the way a fill would: a point is on land
    // when a ray from it crosses the coastline an odd number of times. A
    // simplification that had dropped a continent or shifted one would fail
    // here rather than in a picture nobody looked at.
    const onLand = (longitude: number, latitude: number) =>
      worldOutline().some((ring) => encloses(ring, longitude, latitude));

    expect(onLand(12.5, 41.9)).toBe(true); // Rome
    expect(onLand(139.7, 35.7)).toBe(true); // Tokyo
    expect(onLand(-99.1, 19.4)).toBe(true); // Mexico City
    expect(onLand(-30, 20)).toBe(false); // the middle of the Atlantic
    expect(onLand(-140, -30)).toBe(false); // the middle of the Pacific
  });
});

/** Whether a ring encloses a point, by the crossing rule a fill uses. */
function encloses(
  ring: readonly (readonly [number, number])[],
  longitude: number,
  latitude: number
): boolean {
  let inside = false;
  for (let at = 0, previous = ring.length - 1; at < ring.length; previous = at, at += 1) {
    const [x1, y1] = ring[at];
    const [x2, y2] = ring[previous];
    if (y1 > latitude === y2 > latitude) continue;
    if (longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
