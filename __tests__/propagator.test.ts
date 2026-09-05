import { SAMPLE_TLE } from "../src/data/sampleTle";
import { isUsableSatrec, parseTle, propagate, propagateAt } from "../src/satellite/propagator";

test("parse and propagate sample TLE", () => {
  const satrec = parseTle(SAMPLE_TLE);
  const position = propagate(satrec, new Date("2020-02-01T00:00:00Z"));
  expect(Number.isFinite(position.x)).toBe(true);
  expect(Number.isFinite(position.y)).toBe(true);
  expect(Number.isFinite(position.z)).toBe(true);
});

test("recognises a satrec that failed to initialise", () => {
  expect(isUsableSatrec(parseTle(SAMPLE_TLE))).toBe(true);
  expect(isUsableSatrec(parseTle({ line1: "1 xxx", line2: "2 xxx" }))).toBe(false);
});

test("a malformed satrec yields no position rather than a bogus one", () => {
  // twoline2satrec leaves the elements NaN here; propagate then returns null
  // components, which would coerce to zero — the centre of the Earth.
  expect(propagateAt(parseTle({ line1: "1 xxx", line2: "2 xxx" }), new Date())).toBeNull();
});

test("decayed catalog entries yield no position instead of crashing", () => {
  // Real CelesTrak entries. STARLINK-1695 is decaying: SGP4 sets satrec.error
  // and returns `position: undefined`, which the published types do not admit.
  // TRISAT-4 returns `position: false`. Both must be handled, not thrown at.
  const decaying = {
    line1: "1 46329U 20062E   26235.23513215  .10934288  12506-4  40880-3 0  9990",
    line2: "2 46329  53.0159 226.0176 0005558 292.3028  67.7430 16.43889757331127"
  };
  const belowSurface = {
    line1: "1 67482U 25313BE  26231.17427717  .01297284  89973-3  26073-2 0  9993",
    line2: "2 67482  97.3670 311.8103 0010784 264.2748  95.7300 15.99807030 33137"
  };
  expect(propagateAt(parseTle(decaying), new Date("2026-08-29T00:00:00Z"))).toBeNull();
  // TRISAT-4 still propagates on the 29th and has decayed by the 30th.
  expect(propagateAt(parseTle(belowSurface), new Date("2026-08-30T00:00:00Z"))).toBeNull();
});

test("the throwing variant reports propagation failure", () => {
  expect(() => propagate(parseTle({ line1: "1 xxx", line2: "2 xxx" }), new Date())).toThrow(
    /Propagation failed/
  );
});
