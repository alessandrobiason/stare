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
import { drawnSightings } from "../src/satellite/nakedEyePasses";
import {
  cutAlong,
  passesFor,
  passesOf,
  pathBehind,
  pathFrom,
  separationDeg,
  SkyPass
} from "../src/satellite/orbitPath";
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

describe("the sky a pass under way has already covered", () => {
  test("is walked back from where the plan starts, as far as the wake reaches", () => {
    const [pass] = passesFor(landmark(25867), MIDNIGHT, observer);
    const { history } = pass;

    expect(history.length).toBeGreaterThan(0);
    // In time order, all of it before the arc still to come.
    for (let index = 1; index < history.length; index += 1) {
      expect(history[index].atMs).toBeGreaterThan(history[index - 1].atMs);
    }
    expect(history[history.length - 1].atMs).toBeLessThan(pass.startsAtMs);
    // Back to the wake's length of sky or to the rise, whichever is nearer.
    // Chandra is slow: this pass rose over two hours before midnight and has
    // covered less sky than a wake since, so the walk ends on the floor.
    const chain = [...history, pass.samples[0]];
    const reach = chain
      .slice(1)
      .reduce(
        (sum, sample, index) => sum + separationDeg(chain[index].position, sample.position),
        0
      );
    expect(reach).toBeLessThan(LANDMARK_PATHS.pastArcDeg + 2 * LANDMARK_PATHS.sampleStepDeg);
    expect(elevationDeg(history[0].position)).toBeCloseTo(MINIMUM_SATELLITE_ELEVATION_DEG, 0);
    // And it is where the object really was.
    for (const sample of history) {
      expect(separationDeg(sample.position, truePosition(landmark(25867), sample.atMs)))
        .toBeLessThan(0.01);
    }
  });

  test("stops at the rise when the pass began less than a wake ago", () => {
    // Half a minute into a pass of the station: the walk back meets the floor.
    const [upcoming] = passesFor(landmark(25544), MIDNIGHT, observer).filter((one) => !one.started);
    const planned = passesFor(landmark(25544), upcoming.startsAtMs + 30_000, observer)[0];

    expect(planned.started).toBe(true);
    expect(planned.history.length).toBeGreaterThan(0);
    expect(planned.history[0].atMs).toBeGreaterThanOrEqual(upcoming.startsAtMs - 1000);
    expect(elevationDeg(planned.history[0].position))
      .toBeGreaterThan(MINIMUM_SATELLITE_ELEVATION_DEG);
  });

  test("is left empty for a pass that has not begun, whose rise is in its samples", () => {
    const upcoming = passesFor(landmark(25544), MIDNIGHT, observer).filter((one) => !one.started);
    expect(upcoming.length).toBeGreaterThan(0);
    for (const pass of upcoming) expect(pass.history).toEqual([]);
  });

  test("changes nothing else about the pass", () => {
    // Where it starts, its time marks and its samples are still the sky ahead:
    // the list of what is coming reads them, and it must not see the past.
    const [pass] = passesFor(landmark(25867), MIDNIGHT, observer);
    expect(pass.startsAtMs).toBe(pass.samples[0].atMs);
    for (const tick of pass.ticks) expect(tick.atMs).toBeGreaterThanOrEqual(pass.startsAtMs);
  });
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

    const landmarks = catalog.entries.filter((entry) => entry.category === "LANDMARK");
    const found = await passesOf(landmarks, MIDNIGHT, observer, startSlicing(), [
      { fromMs: MIDNIGHT, untilMs: MIDNIGHT + LANDMARK_PATHS.windowHours * 3_600_000 }
    ]);
    const station = found.filter((pass) => Math.abs(minutesFrom(pass, MIDNIGHT) - 37.6) < 0.1);
    expect(station).toHaveLength(1);
    expect(station[0].name).toBe("ISS");
    expect(station[0].noradId).toBe(25544);
  });

  /** The station's and CHEOPS's passes over three hours, soonest first, as a plan hands them over. */
  const planned = () =>
    [...passesFor(landmark(25544), MIDNIGHT, observer), ...passesFor(landmark(44874), MIDNIGHT, observer)]
      .sort((one, other) => one.startsAtMs - other.startsAtMs);

  test("draws one line per object, its soonest", () => {
    const passes = planned();
    // Both come round twice inside the window, so the plan has two of each.
    expect(passes.filter((pass) => pass.noradId === 25544).length).toBeGreaterThan(1);

    const drawn = drawnSightings(passes, MIDNIGHT);
    expect(drawn.map((pass) => pass.noradId).sort()).toEqual([25544, 44874]);
    const station = passes.filter((pass) => pass.noradId === 25544);
    expect(drawn.find((pass) => pass.noradId === 25544)).toBe(station[0]);
  });

  test("and the next one the moment the first is over, not at the next plan", () => {
    const passes = planned();
    const station = passes.filter((pass) => pass.noradId === 25544);
    const drawn = drawnSightings(passes, station[0].endsAtMs + 1000);
    expect(drawn.find((pass) => pass.noradId === 25544)).toBe(station[1]);
  });

  test("keeps a string of fresh launches to a handful of lines", () => {
    // A train of new satellites is dozens of sightings on nearly one line.
    const [one] = planned();
    const train = Array.from({ length: 40 }, (_, index) => ({
      ...one,
      noradId: 90000 + index,
      startsAtMs: one.startsAtMs + index * 20_000
    }));
    const drawn = drawnSightings(train, MIDNIGHT);
    expect(drawn).toHaveLength(LANDMARK_PATHS.maximumSightingPaths);
    // The soonest of them, which are the ones about to happen.
    expect(drawn[0]).toBe(train[0]);
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

describe("the wake behind the object", () => {
  const pass = () => passesFor(landmark(25544), MIDNIGHT, observer)[0];
  const { pastArcDeg } = LANDMARK_PATHS;

  const arcOf = (chain: EnuPosition[]) =>
    chain.slice(1).reduce((sum, position, index) => sum + separationDeg(chain[index], position), 0);

  test("starts where the line ahead does, at the object", () => {
    const upcoming = pass();
    const atMs = upcoming.startsAtMs + 90_000;
    const behind = pathBehind(upcoming, atMs, pastArcDeg);
    const ahead = pathFrom(upcoming, atMs);

    expect(behind.length).toBeGreaterThan(1);
    expect(separationDeg(behind[0], ahead[0])).toBeLessThan(1e-9);
    // And runs back the way the object came: its far end is where it was.
    const tail = behind[behind.length - 1];
    expect(separationDeg(tail, truePosition(landmark(25544), upcoming.startsAtMs)))
      .toBeLessThan(separationDeg(tail, ahead[ahead.length - 1]));
  });

  test("is no longer than the wake, measured along the sky", () => {
    const upcoming = pass();
    const late = pathBehind(upcoming, upcoming.endsAtMs - 30_000, pastArcDeg);
    expect(arcOf(late)).toBeCloseTo(pastArcDeg, 2);
  });

  test("reaches only back to the rise early in a pass", () => {
    const upcoming = pass();
    const early = pathBehind(upcoming, upcoming.startsAtMs + 5000, pastArcDeg);
    expect(arcOf(early)).toBeLessThan(pastArcDeg);
    expect(separationDeg(early[early.length - 1], upcoming.samples[0].position)).toBeLessThan(1e-9);
  });

  test("is nothing before the pass begins or once it is over", () => {
    const upcoming = pass();
    expect(pathBehind(upcoming, upcoming.startsAtMs - 1000, pastArcDeg)).toEqual([]);
    expect(pathBehind(upcoming, upcoming.endsAtMs + 1000, pastArcDeg)).toEqual([]);
  });

  test("is the same wake from a plan made mid-pass as from the plan before it", () => {
    // The reason a plan walks back at all: without it, a plan made a minute
    // into a pass would draw a wake a minute long, and every replan would cut
    // the wake back to nothing.
    const upcoming = pass();
    const replanned = passesFor(landmark(25544), upcoming.startsAtMs + 120_000, observer)[0];
    const atMs = upcoming.startsAtMs + 150_000;

    const before = pathBehind(upcoming, atMs, pastArcDeg);
    const after = pathBehind(replanned, atMs, pastArcDeg);
    expect(arcOf(after)).toBeCloseTo(arcOf(before), 1);
    expect(separationDeg(after[after.length - 1], before[before.length - 1])).toBeLessThan(0.1);
  });
});

describe("cutting an arc along the sky", () => {
  const chain = () => pathFrom(passesFor(landmark(25544), MIDNIGHT, observer)[0], MIDNIGHT);
  const arcOf = (positions: EnuPosition[]) =>
    positions
      .slice(1)
      .reduce((sum, position, index) => sum + separationDeg(positions[index], position), 0);

  test("cuts dashes of the length asked for, from the chain's first point", () => {
    const pieces = cutAlong(chain(), 1, 0.6);

    expect(pieces.length).toBeGreaterThan(20);
    expect(separationDeg(pieces[0].positions[0], chain()[0])).toBeLessThan(1e-9);
    pieces.slice(0, -1).forEach((piece, index) => {
      expect(piece.fromDeg).toBeCloseTo(index, 6);
      expect(arcOf(piece.positions)).toBeCloseTo(0.6, 3);
    });
  });

  test("cuts contiguous steps as long as their spacing, and stops where asked", () => {
    const pieces = cutAlong(chain(), 2, 2, 24);

    expect(pieces).toHaveLength(12);
    for (let index = 1; index < pieces.length; index += 1) {
      const last = pieces[index - 1].positions;
      expect(separationDeg(last[last.length - 1], pieces[index].positions[0])).toBeLessThan(1e-4);
    }
  });

  test("skips the pieces lying only on segments nobody wants", () => {
    const all = cutAlong(chain(), 1, 0.6);
    const onlyFirst = (segment: number) => segment === 0;
    const firstOnly = cutAlong(chain(), 1, 0.6, Number.POSITIVE_INFINITY, onlyFirst);

    expect(firstOnly.length).toBeGreaterThan(0);
    expect(firstOnly.length).toBeLessThan(all.length);
    expect(firstOnly[0].fromDeg).toBe(0);
  });

  test("leaves no piece of no length at the end of the chain", () => {
    for (const piece of cutAlong(chain(), 1, 0.6)) {
      expect(arcOf(piece.positions)).toBeGreaterThan(0);
    }
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
    expect(drawn.dashes.length).toBeGreaterThan(0);
    // Through the middle of the view, since that is what the camera is on.
    expect(drawn.dashes.flat().some((point) => pointOnFrame(point))).toBe(true);
    // Only near the view: a pass is three times the frame, and the rest of it
    // is not cut into dashes for the canvas to throw away. Near is a sample's
    // spacing past the edge, since the stretches kept are whole segments.
    for (const dash of drawn.dashes) {
      expect(dash.some((point) => Math.abs(point.left - 50) < 75 && Math.abs(point.top - 50) < 75))
        .toBe(true);
    }
  });

  test("keeps the line while the object itself is nowhere near the view", () => {
    // The whole reason a path is worth drawing: the phone is pointed at a piece
    // of sky the station has not reached yet, and the line running through it
    // is what says to keep looking there.
    const pass = upcoming();
    const later = pass.samples[pass.samples.length - 2];
    const [drawn] = projectPaths([pass], MIDNIGHT, aimedAt(later.position), DEVICE_LENS);

    expect(drawn.dashes.length).toBeGreaterThan(0);
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
    expect(drawn.dashes[0][0].left).toBeCloseTo(head!.left, 1);
    expect(drawn.dashes[0][0].top).toBeCloseTo(head!.top, 1);
  });

  test("dashes from the object, so a replanned pass draws the same dashes", () => {
    // A plan is remade every minute, and one made mid-pass starts its samples
    // somewhere new. Dashes counted from the plan's own start would jump every
    // time; counted from the object, they do not.
    const pass = upcoming();
    const replanned = passesFor(landmark(25544), pass.startsAtMs + 60_000, observer).find(
      (one) => one.started
    )!;
    const atMs = pass.startsAtMs + 90_000;
    const axes = aimedAt(pathFrom(pass, atMs)[0]);

    const [before] = projectPaths([pass], atMs, axes, DEVICE_LENS);
    const [after] = projectPaths([replanned], atMs, axes, DEVICE_LENS);
    for (const index of [0, 5, 10]) {
      expect(after.dashes[index][0].left).toBeCloseTo(before.dashes[index][0].left, 1);
      expect(after.dashes[index][0].top).toBeCloseTo(before.dashes[index][0].top, 1);
    }
  });

  test("draws a fading wake behind a pass under way, and none ahead of one", () => {
    const pass = upcoming();
    const atMs = pass.startsAtMs + 90_000;
    const axes = aimedAt(pathFrom(pass, atMs)[0]);

    const [underWay] = projectPaths([pass], atMs, axes, DEVICE_LENS);
    expect(underWay.past.length).toBeGreaterThan(0);
    // From the object backwards: it starts where the dashes do, and each step
    // is further back than the one before it.
    expect(underWay.past[0].points[0].left).toBeCloseTo(underWay.dashes[0][0].left, 6);
    expect(underWay.past[0].points[0].top).toBeCloseTo(underWay.dashes[0][0].top, 6);
    for (let index = 1; index < underWay.past.length; index += 1) {
      expect(underWay.past[index].behind).toBeGreaterThan(underWay.past[index - 1].behind);
    }
    expect(underWay.past.every((step) => step.behind > 0 && step.behind < 1)).toBe(true);

    const [ahead] = projectPaths([pass], MIDNIGHT, aimedAt(pass.samples[0].position), DEVICE_LENS);
    expect(ahead.past).toEqual([]);
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
