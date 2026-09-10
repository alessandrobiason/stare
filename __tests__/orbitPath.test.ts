import * as fs from "fs";
import * as path from "path";
import { axesFromAttitude } from "../src/camera/attitude";
import { DEVICE_LENS, projectWithAxes } from "../src/camera/projection";
import { pointOnFrame } from "../src/components/markerGeometry";
import { LANDMARK_PATHS, MINIMUM_SATELLITE_ELEVATION_DEG } from "../src/constants";
import {
  azimuthDeg,
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt
} from "../src/coordinates/transform";
import { projectPaths } from "../src/hooks/useAnimatedMarkers";
import { wrapDegrees360 } from "../src/math/angles";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { CatalogEntry, SatelliteCatalog } from "../src/satellite/catalog";
import { passesFor, pathFrom, planSkyPaths, separationDeg, SkyPass } from "../src/satellite/orbitPath";
import { propagateAt } from "../src/satellite/propagator";
import { startSlicing } from "../src/timeSlice";
import { EnuPosition, ObserverLocation } from "../src/types";

/**
 * Helsinki, and a fixed instant a few days after the committed catalog's epoch:
 * the same place and the same kind of clock the tracker's own suite uses. At
 * sixty degrees north the landmark tier is a handful of objects — the two
 * stations' inclinations barely reach, and Hubble's never does — which is
 * exactly the sky these paths have to be legible on.
 */
const observer: ObserverLocation = { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 };
const MIDNIGHT = Date.UTC(2026, 7, 29, 0, 0, 0);
const frame = createObserverFrame(observer);

const catalog = new SatelliteCatalog(
  parseTleCatalog(
    fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
  )
);

function landmark(noradId: number): CatalogEntry {
  const entry = catalog.entries.find((candidate) => candidate.noradId === noradId);
  if (!entry) throw new Error(`${noradId} is not in the fixture`);
  return entry;
}

/** Elevation from a full propagation: what a planned path is measured against. */
function trueElevationDeg(entry: CatalogEntry, atMs: number): number {
  const when = new Date(atMs);
  const eci = propagateAt(entry.satrec, when);
  if (!eci) return Number.NaN;
  return elevationDeg(eciToEnuInFrame(eci, gmstAt(when), frame));
}

function truePosition(entry: CatalogEntry, atMs: number): EnuPosition {
  const when = new Date(atMs);
  const eci = propagateAt(entry.satrec, when);
  if (!eci) throw new Error("the fixture entry no longer propagates");
  return eciToEnuInFrame(eci, gmstAt(when), frame);
}

const minutesFrom = (pass: SkyPass, fromMs: number) => (pass.startsAtMs - fromMs) / 60000;

test("walks a pass from the elevation floor back down to it", () => {
  const passes = passesFor(landmark(25544), MIDNIGHT, observer);
  expect(passes.length).toBeGreaterThan(0);

  for (const pass of passes.filter((one) => !one.started)) {
    // Both ends sit on the floor rather than up to a search step inside it,
    // which is what the crossing refinement buys: the line starts where the
    // marker appears and ends where it goes out.
    expect(trueElevationDeg(landmark(25544), pass.startsAtMs)).toBeCloseTo(
      MINIMUM_SATELLITE_ELEVATION_DEG,
      1
    );
    expect(trueElevationDeg(landmark(25544), pass.endsAtMs)).toBeCloseTo(
      MINIMUM_SATELLITE_ELEVATION_DEG,
      1
    );
    // And nothing outside them: a minute either side, the object is not up.
    expect(trueElevationDeg(landmark(25544), pass.startsAtMs - 60_000)).toBeLessThan(
      MINIMUM_SATELLITE_ELEVATION_DEG
    );
    expect(trueElevationDeg(landmark(25544), pass.endsAtMs + 60_000)).toBeLessThan(
      MINIMUM_SATELLITE_ELEVATION_DEG
    );
  }
});

test("starts the pass under way where the object is now, not where it rose", () => {
  // Chandra takes two and a half days to go round, so it is up over Helsinki
  // for hours at a time and this window opens in the middle of one.
  const [pass] = passesFor(landmark(25867), MIDNIGHT, observer);
  expect(pass.started).toBe(true);
  expect(pass.startsAtMs).toBe(MIDNIGHT);
  // Well above the floor, which is the whole point: the arc that is left is the
  // part still to come, not the part already flown.
  expect(elevationDeg(pass.samples[0].position)).toBeGreaterThan(
    MINIMUM_SATELLITE_ELEVATION_DEG + 10
  );
  expect(separationDeg(pass.samples[0].position, truePosition(landmark(25867), MIDNIGHT)))
    .toBeLessThan(0.01);
});

test("spaces the samples by angle rather than by the clock", () => {
  const iss = landmark(25544);
  const [pass] = passesFor(iss, MIDNIGHT, observer);
  const steps: number[] = [];
  const separations: number[] = [];
  for (let index = 1; index < pass.samples.length; index += 1) {
    steps.push(pass.samples[index].atMs - pass.samples[index - 1].atMs);
    separations.push(
      separationDeg(pass.samples[index - 1].position, pass.samples[index].position)
    );
  }

  // The step shortens as the pass climbs and opens out again as it sets, which
  // is the whole mechanism: sampled on a clock, an overhead pass draws corners
  // and a slow object draws hundreds of points nobody can see.
  expect(Math.max(...steps)).toBeGreaterThan(Math.min(...steps) * 2);
  // No segment much longer than the step it aims at. Longer than the target by
  // a little is expected — the step is set from the rate the object had over
  // the *last* segment, and a pass accelerates towards its peak.
  expect(Math.max(...separations)).toBeLessThan(LANDMARK_PATHS.sampleStepDeg * 2);
});

test("draws a straight line where the sky curves, to a fraction of a degree", () => {
  // What licenses drawing the arc as straight segments at all. Each segment is
  // compared against a full propagation at its own midpoint, which is where a
  // chord is furthest from the path it stands in for.
  const iss = landmark(25544);
  const [pass] = passesFor(iss, MIDNIGHT, observer);
  let worstDeg = 0;

  for (let index = 1; index < pass.samples.length; index += 1) {
    const before = pass.samples[index - 1];
    const after = pass.samples[index];
    const middle = {
      east: (before.position.east + after.position.east) / 2,
      north: (before.position.north + after.position.north) / 2,
      up: (before.position.up + after.position.up) / 2
    };
    const truth = truePosition(iss, (before.atMs + after.atMs) / 2);
    worstDeg = Math.max(worstDeg, separationDeg(middle, truth));
  }

  // A tenth of a degree is about a pixel of this frame, and the line is drawn
  // two pixels wide.
  expect(worstDeg).toBeLessThan(0.1);
});

test("marks round clock minutes along the path", () => {
  const [pass] = passesFor(landmark(25544), MIDNIGHT, observer);
  expect(pass.ticks.length).toBeGreaterThan(2);

  for (const tick of pass.ticks) {
    expect(tick.atMs % 60_000).toBe(0);
    expect(tick.atMs).toBeGreaterThanOrEqual(pass.startsAtMs);
    expect(tick.atMs).toBeLessThanOrEqual(pass.endsAtMs);
    // Where the object really is at that minute, and a direction to draw the
    // mark across.
    expect(separationDeg(tick.position, truePosition(landmark(25544), tick.atMs))).toBeLessThan(0.2);
    expect(separationDeg(tick.position, tick.ahead)).toBeGreaterThan(0);
  }

  // One cadence for the pass, evenly spaced in time.
  const gaps = pass.ticks.slice(1).map((tick, index) => tick.atMs - pass.ticks[index].atMs);
  expect(new Set(gaps).size).toBe(1);
});

test("gives an object that barely crawls across the sky a single mark", () => {
  // Chandra covers a few degrees an hour, so every cadence on offer would put
  // its marks on top of each other. It gets one, in the middle of the arc —
  // not a clock minute and not pretending to be one. What it is there for is
  // the direction, which is the one thing a line cannot say by itself.
  const [pass] = passesFor(landmark(25867), MIDNIGHT, observer);
  expect(pass.endsAtMs - pass.startsAtMs).toBeGreaterThan(60 * 60_000);
  expect(pass.ticks).toHaveLength(1);

  const [mark] = pass.ticks;
  expect(mark.atMs).toBeGreaterThan(pass.startsAtMs);
  expect(mark.atMs).toBeLessThan(pass.endsAtMs);
  // And it carries a direction to be drawn along, like every other mark.
  expect(separationDeg(mark.position, mark.ahead)).toBeGreaterThan(0);
});

test("drops a pass that never clears the roofline", () => {
  // CHEOPS grazes the sky at seven degrees just after 14:42 that afternoon,
  // which is a pass along the tops of the buildings: a line pointing someone at
  // it is a line pointing them at a wall.
  const from = Date.UTC(2026, 7, 29, 14, 0, 0);
  const grazingMs = Date.UTC(2026, 7, 29, 14, 42, 20);
  const cheops = landmark(44874);
  expect(trueElevationDeg(cheops, grazingMs)).toBeGreaterThan(MINIMUM_SATELLITE_ELEVATION_DEG);
  expect(trueElevationDeg(cheops, grazingMs)).toBeLessThan(
    LANDMARK_PATHS.minimumPeakElevationDeg
  );

  const passes = passesFor(cheops, from, observer);
  expect(passes.length).toBeGreaterThan(0);
  for (const pass of passes) {
    expect(pass.peakElevationDeg).toBeGreaterThanOrEqual(LANDMARK_PATHS.minimumPeakElevationDeg);
    expect(grazingMs >= pass.startsAtMs && grazingMs <= pass.endsAtMs).toBe(false);
  }
});

describe("choosing which paths to draw", () => {
  test("keeps the station rather than the ferries docked to it", async () => {
    // Four visiting vehicles are catalogued separately from the station that
    // afternoon, and all four are landmarks. Drawn as catalogued they are the
    // same arc five times over, with five names stacked on the rise point.
    const ferries = catalog.entries.filter((entry) =>
      /DRAGON|PROGRESS|CYGNUS/.test(entry.name)
    );
    expect(ferries.length).toBeGreaterThan(2);
    for (const ferry of ferries) {
      const [pass] = passesFor(ferry, MIDNIGHT, observer);
      expect(minutesFrom(pass, MIDNIGHT)).toBeCloseTo(37.6, 1);
    }

    const drawn = await planSkyPaths(catalog, MIDNIGHT, observer, startSlicing());
    const station = drawn.filter((pass) => Math.abs(minutesFrom(pass, MIDNIGHT) - 37.6) < 0.1);
    expect(station).toHaveLength(1);
    expect(station[0].name).toBe("ISS");
    expect(station[0].noradId).toBe(25544);
  });

  test("spends the allowance on different objects before second passes", async () => {
    const drawn = await planSkyPaths(catalog, MIDNIGHT, observer, startSlicing());
    expect(drawn.length).toBeLessThanOrEqual(LANDMARK_PATHS.maximumPaths);
    // Both the station and CHEOPS come round twice inside the window, and
    // neither gets a second line while another landmark is still without one.
    expect(new Set(drawn.map((pass) => pass.noradId)).size).toBe(drawn.length);
    expect(drawn.map((pass) => pass.name)).toContain("ISS");
    expect(drawn.map((pass) => pass.name)).toContain("XMM-Newton");
  });

  test("plans nothing for the sixteen thousand objects that are not landmarks", async () => {
    const drawn = await planSkyPaths(catalog, MIDNIGHT, observer, startSlicing());
    for (const pass of drawn) expect(pass.category).toBe("LANDMARK");
  });
});

describe("trimming a planned path to the present", () => {
  const pass = () => passesFor(landmark(25544), MIDNIGHT, observer)[0];

  test("hands back the whole arc before the object reaches it", () => {
    const upcoming = pass();
    expect(pathFrom(upcoming, MIDNIGHT)).toHaveLength(upcoming.samples.length);
  });

  test("starts at the object rather than where the plan was made", () => {
    const upcoming = pass();
    // A minute into the pass, which is as stale as a plan is ever allowed to be
    // (`refreshSeconds`) and most of the sky for a low orbit.
    const atMs = upcoming.startsAtMs + 60_000;
    const ahead = pathFrom(upcoming, atMs);

    expect(ahead.length).toBeLessThan(upcoming.samples.length);
    expect(separationDeg(ahead[0], truePosition(landmark(25544), atMs))).toBeLessThan(0.2);
    // And what is left is the future: every sample after the head is later.
    const kept = upcoming.samples.filter((sample) => sample.atMs >= atMs);
    expect(ahead).toHaveLength(kept.length + 1);
  });

  test("has nothing left once the pass is over", () => {
    expect(pathFrom(pass(), pass().endsAtMs + 1000)).toEqual([]);
  });
});

describe("a planned pass on the frame", () => {
  const upcoming = () => passesFor(landmark(25544), MIDNIGHT, observer)[1];

  /** The camera pointed straight at one of a pass's own samples. */
  function aimedAt(position: EnuPosition) {
    return axesFromAttitude({
      headingDeg: wrapDegrees360(azimuthDeg(position)),
      pitchDeg: elevationDeg(position),
      rollDeg: 0
    });
  }

  test("draws the part of the arc the camera is pointed at", () => {
    const pass = upcoming();
    const middle = pass.samples[Math.floor(pass.samples.length / 2)];
    const [drawn] = projectPaths([pass], MIDNIGHT, aimedAt(middle.position), DEVICE_LENS);

    expect(drawn.name).toBe("ISS");
    expect(drawn.lines.length).toBeGreaterThan(0);
    // Through the middle of the view, since that is what the camera is on.
    expect(drawn.lines.flat().some((point) => pointOnFrame(point))).toBe(true);
  });

  test("keeps the line while the object itself is nowhere near the view", () => {
    // The whole reason a path is worth drawing: the phone is pointed at a piece
    // of sky the station has not reached yet, and the line running through it
    // is what says to keep looking there.
    const pass = upcoming();
    const later = pass.samples[pass.samples.length - 2];
    const [drawn] = projectPaths([pass], MIDNIGHT, aimedAt(later.position), DEVICE_LENS);

    expect(drawn.lines.length).toBeGreaterThan(0);
    // And the object is not on the frame: it is minutes away from that spot.
    const head = projectWithAxes(pass.samples[0].position, aimedAt(later.position), DEVICE_LENS);
    expect(head === null || !pointOnFrame(head)).toBe(true);
  });

  test("has nothing to draw for a pass the camera has its back to", () => {
    const pass = upcoming();
    const away = axesFromAttitude({
      headingDeg: wrapDegrees360(azimuthDeg(pass.samples[0].position) + 180),
      pitchDeg: -40,
      rollDeg: 0
    });
    expect(projectPaths([pass], MIDNIGHT, away, DEVICE_LENS)).toEqual([]);
  });

  test("starts the line at the object rather than where the plan did", () => {
    const pass = upcoming();
    const middle = pass.samples[Math.floor(pass.samples.length / 2)];
    const axes = aimedAt(middle.position);
    const [drawn] = projectPaths([pass], middle.atMs, axes, DEVICE_LENS);

    const head = projectWithAxes(truePosition(landmark(25544), middle.atMs), axes, DEVICE_LENS);
    expect(drawn.lines[0][0].left).toBeCloseTo(head!.left, 1);
    expect(drawn.lines[0][0].top).toBeCloseTo(head!.top, 1);
  });

  describe("where the name is written", () => {
    test("takes the point the object comes up at when that is in view", () => {
      const pass = upcoming();
      const axes = aimedAt(pass.samples[0].position);
      const [drawn] = projectPaths([pass], MIDNIGHT, axes, DEVICE_LENS);

      const rise = projectWithAxes(pass.samples[0].position, axes, DEVICE_LENS);
      expect(drawn.anchor?.at.left).toBeCloseTo(rise!.left, 6);
      expect(drawn.anchor?.at.top).toBeCloseTo(rise!.top, 6);
    });

    test("carries the moment the object is at that point, not the pass's rise", () => {
      // What the time under a name means: the object is *there* then. Written
      // at the rise, that is the rise time; written half way along the arc, it
      // is the time it reaches the half way point — where the pass's own start
      // would be a minute that has nothing to do with the piece of sky it is
      // set over.
      const pass = upcoming();
      const middle = pass.samples[Math.floor(pass.samples.length / 2)];

      const atRise = projectPaths([pass], MIDNIGHT, aimedAt(pass.samples[0].position), DEVICE_LENS);
      expect(atRise[0].anchor?.atMs).toBe(pass.startsAtMs);

      const along = projectPaths([pass], MIDNIGHT, aimedAt(middle.position), DEVICE_LENS);
      expect(along[0].anchor?.atMs).toBeGreaterThan(pass.startsAtMs);
      // And it is one of the arc's own sample times rather than a figure of
      // this function's own.
      expect(pass.samples.map((sample) => sample.atMs)).toContain(along[0].anchor?.atMs);
    });

    test("never names a time that has already gone by", () => {
      // A plan is up to a minute old, so the rise it was made before may have
      // happened. The name goes on the part of the arc still to come, and so
      // does the time under it.
      const pass = upcoming();
      const atMs = pass.startsAtMs + 60_000;
      const drawn = projectPaths([pass], atMs, aimedAt(pass.samples[0].position), DEVICE_LENS);

      expect(drawn[0].anchor?.atMs).toBeGreaterThanOrEqual(atMs);
    });

    test("takes a point on the line where the object itself is elsewhere", () => {
      // The case it exists for: the camera is on a piece of the arc nowhere
      // near either end of it, and the line still has to say whose it is.
      const pass = upcoming();
      const middle = pass.samples[Math.floor(pass.samples.length / 2)];
      const [drawn] = projectPaths([pass], MIDNIGHT, aimedAt(middle.position), DEVICE_LENS);

      expect(drawn.anchor).not.toBeNull();
      expect(pointOnFrame(drawn.anchor!.at)).toBe(true);
    });

    test("holds the same piece of sky while the phone turns", () => {
      // A name that re-picked its point every frame would slide along the line
      // as the phone moved, which is the one thing in this app that is not
      // pinned to the sky.
      const pass = upcoming();
      const middle = pass.samples[Math.floor(pass.samples.length / 2)];
      const anchors = new Map<string, number>();

      const first = projectPaths([pass], MIDNIGHT, aimedAt(middle.position), DEVICE_LENS, anchors);
      const held = [...anchors.values()][0];

      // Turned by a couple of degrees, which moves the whole sky across the
      // frame without taking the anchor off it.
      const turned = axesFromAttitude({
        headingDeg: wrapDegrees360(azimuthDeg(middle.position) + 2),
        pitchDeg: elevationDeg(middle.position),
        rollDeg: 0
      });
      const second = projectPaths([pass], MIDNIGHT, turned, DEVICE_LENS, anchors);

      expect([...anchors.values()][0]).toBe(held);
      // The point moved with the sky rather than staying under the camera.
      expect(second[0].anchor!.at.left).not.toBeCloseTo(first[0].anchor!.at.left, 1);
      expect(second[0].anchor!.at.left).toBeCloseTo(
        projectWithAxes(pass.samples[held].position, turned, DEVICE_LENS)!.left,
        6
      );
    });

    test("picks another only once the one it was on has left the view", () => {
      const pass = upcoming();
      const anchors = new Map<string, number>();
      projectPaths([pass], MIDNIGHT, aimedAt(pass.samples[0].position), DEVICE_LENS, anchors);
      expect([...anchors.values()][0]).toBe(0);

      const far = pass.samples[pass.samples.length - 2];
      const [drawn] = projectPaths([pass], MIDNIGHT, aimedAt(far.position), DEVICE_LENS, anchors);
      expect([...anchors.values()][0]).toBeGreaterThan(0);
      expect(pointOnFrame(drawn.anchor!.at)).toBe(true);
    });

    test("forgets a path that is no longer planned", () => {
      const pass = upcoming();
      const anchors = new Map<string, number>();
      projectPaths([pass], MIDNIGHT, aimedAt(pass.samples[0].position), DEVICE_LENS, anchors);
      expect(anchors.size).toBe(1);

      // The plan is replaced every minute and its keys go with it.
      projectPaths([], MIDNIGHT, aimedAt(pass.samples[0].position), DEVICE_LENS, anchors);
      expect(anchors.size).toBe(0);
    });
  });

  test("fades with how far ahead the pass is", () => {
    const pass = upcoming();
    const axes = aimedAt(pass.samples[0].position);
    const [drawn] = projectPaths([pass], MIDNIGHT, axes, DEVICE_LENS);

    const hoursAhead = (pass.startsAtMs - MIDNIGHT) / 3_600_000;
    expect(drawn.lead).toBeCloseTo(hoursAhead / LANDMARK_PATHS.windowHours, 6);
    expect(drawn.lead).toBeGreaterThan(0);
    expect(drawn.lead).toBeLessThan(1);
  });
});
