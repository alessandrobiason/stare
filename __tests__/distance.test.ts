import { metresBetween } from "../src/coordinates/distance";
import { isStale } from "../src/hooks/planFreshness";
import { ObserverLocation } from "../src/types";

/**
 * The two comparisons every background plan in this app is checked against:
 * how far apart two fixes are, and whether that (or time) has moved a plan out
 * from under itself. Shared by `useOrbitPaths`, `useFocusedPath`, `SkyMemory`
 * and `usePassAlerts`, each with its own thresholds.
 */

const HELSINKI: ObserverLocation = { latitudeDeg: 60.1699, longitudeDeg: 24.9384, heightM: 20 };

describe("the distance between two fixes", () => {
  test("nothing apart is nothing apart", () => {
    expect(metresBetween(HELSINKI, HELSINKI)).toBe(0);
  });

  test("a degree of latitude is a hundred and eleven-odd kilometres, anywhere", () => {
    const north: ObserverLocation = { ...HELSINKI, latitudeDeg: HELSINKI.latitudeDeg + 1 };
    expect(metresBetween(HELSINKI, north)).toBeCloseTo(111_320, -2);
  });

  test("a degree of longitude shrinks with the cosine of the latitude", () => {
    const east: ObserverLocation = { ...HELSINKI, longitudeDeg: HELSINKI.longitudeDeg + 1 };
    // At 60°N a degree of longitude is about half what it is at the equator.
    expect(metresBetween(HELSINKI, east)).toBeCloseTo(
      111_320 * Math.cos((HELSINKI.latitudeDeg * Math.PI) / 180),
      -2
    );

    const equator: ObserverLocation = { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 };
    const eastAtEquator: ObserverLocation = { ...equator, longitudeDeg: 1 };
    expect(metresBetween(equator, eastAtEquator)).toBeGreaterThan(
      metresBetween(HELSINKI, east)
    );
  });

  test("symmetric over the short drifts it is actually used for", () => {
    // Not a general symmetric metric — the east/west term is scaled by the
    // *first* fix's latitude, so which end that is starts to matter over real
    // distance (Helsinki to Rome differs by a few percent, not a rounding
    // error). Every real caller only ever measures drift from a plan's own
    // origin to where the observer is now, and at that scale — a walk, a
    // drive, even the alert plan's twenty-kilometre threshold — the two
    // directions agree to well within anything compared against them.
    const nearby: ObserverLocation = { ...HELSINKI, latitudeDeg: HELSINKI.latitudeDeg + 0.05 };
    expect(metresBetween(HELSINKI, nearby)).toBeCloseTo(metresBetween(nearby, HELSINKI), 6);
  });
});

describe("whether a plan is stale", () => {
  const base = { plannedAtMs: 1000, plannedFrom: HELSINKI, refreshMs: 60_000, driftMetres: 250 };

  test("nothing planned yet is always stale", () => {
    expect(
      isStale({ ...base, plannedAtMs: null, atMs: 1000, observer: HELSINKI })
    ).toBe(true);
    expect(
      isStale({ ...base, plannedFrom: null, atMs: 1000, observer: HELSINKI })
    ).toBe(true);
  });

  test("neither time nor place moved: not stale", () => {
    expect(isStale({ ...base, atMs: 1000, observer: HELSINKI })).toBe(false);
    expect(isStale({ ...base, atMs: 1000 + base.refreshMs - 1, observer: HELSINKI })).toBe(false);
  });

  test("time alone, past the refresh interval", () => {
    expect(isStale({ ...base, atMs: 1000 + base.refreshMs, observer: HELSINKI })).toBe(true);
  });

  test("time running backwards is still a gap, for a harness clock that seeks", () => {
    expect(isStale({ ...base, atMs: 1000 - base.refreshMs, observer: HELSINKI })).toBe(true);
  });

  test("place alone, past the drift distance", () => {
    // A tenth of a degree of latitude at Helsinki is about 11 km — moved here
    // just past the 250 m threshold `base` sets, well inside the refresh gap.
    const near: ObserverLocation = { ...HELSINKI, latitudeDeg: HELSINKI.latitudeDeg + 0.003 };
    expect(metresBetween(HELSINKI, near)).toBeGreaterThan(base.driftMetres);

    expect(isStale({ ...base, atMs: 1000, observer: near })).toBe(true);
  });

  test("a drift inside the threshold, on its own, is not stale", () => {
    const near: ObserverLocation = { ...HELSINKI, latitudeDeg: HELSINKI.latitudeDeg + 0.001 };
    expect(metresBetween(HELSINKI, near)).toBeLessThan(base.driftMetres);

    expect(isStale({ ...base, atMs: 1000, observer: near })).toBe(false);
  });

  test("the same two questions at the scale a week's alert plan asks them", () => {
    // PASS_ALERTS's own numbers: half an hour, twenty kilometres — orders of
    // magnitude looser than a drawn path's, because a plan that only ever
    // speaks in compass points and whole degrees is asking whether the reader
    // is still broadly in the same place, not whether a line's bearing still
    // holds to a fraction of a degree.
    const wide = { plannedAtMs: 0, plannedFrom: HELSINKI, refreshMs: 30 * 60_000, driftMetres: 20_000 };

    // An ordinary walk across town: well under twenty kilometres, so time is
    // still the only thing that can make this stale.
    const acrossTown: ObserverLocation = { ...HELSINKI, latitudeDeg: HELSINKI.latitudeDeg + 0.02 };
    expect(metresBetween(HELSINKI, acrossTown)).toBeLessThan(wide.driftMetres);
    expect(isStale({ ...wide, atMs: 0, observer: acrossTown })).toBe(false);

    // A real trip — Helsinki to Tampere, roughly 160 km — trips it immediately,
    // however little time has passed.
    const tampere: ObserverLocation = { latitudeDeg: 61.4978, longitudeDeg: 23.761, heightM: 100 };
    expect(isStale({ ...wide, atMs: 0, observer: tampere })).toBe(true);
  });
});
