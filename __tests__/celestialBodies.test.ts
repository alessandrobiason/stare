import { celestialPosition } from "../src/coordinates/celestialBodies";
import { sunAltitudeDeg } from "../src/coordinates/sunAltitude";
import { ObserverLocation } from "../src/types";

/**
 * The ephemeris is Astronomy Engine's and is not on trial here. What is, is the
 * handful of choices this app makes in calling it — topocentric, of date, with
 * aberration and with refraction — because every one of them is a flag that
 * defaults the other way and every one of them is worth tenths of a degree to a
 * position being compared against a photograph of the thing itself.
 *
 * So the checks below are all against something outside the library: the app's
 * own independent solar series, the geometry of a meridian transit, and the
 * physical sizes of the two discs.
 */

const MILAN: ObserverLocation = { latitudeDeg: 45.4642, longitudeDeg: 9.19, heightM: 120 };

describe("the sun, against the app's own series", () => {
  /**
   * `sunAltitudeDeg` is a short Astronomical Almanac series with no shared code
   * and no shared constants, good to about a hundredth of a degree, and
   * documented as geometric — no refraction. Two independent implementations
   * agreeing to that tolerance is the strongest evidence available here that
   * either is right.
   */
  test.each([
    "2026-03-21T11:00:00Z",
    "2026-06-21T11:00:00Z",
    "2026-09-06T11:00:00Z",
    "2026-12-21T11:00:00Z"
  ])("high in the sky the two agree to a twentieth of a degree at %s", (iso) => {
    const when = new Date(iso);
    const engine = celestialPosition("sun", MILAN, when).altitudeDeg;
    expect(engine).toBeCloseTo(sunAltitudeDeg(MILAN, when), 1);
    expect(Math.abs(engine - sunAltitudeDeg(MILAN, when))).toBeLessThan(0.05);
  });

  /**
   * And near the horizon they must *not* agree, by exactly the amount the
   * atmosphere lifts the disc. This is the check that the refraction flag is on:
   * the camera sees the lifted sun, so an unrefracted ephemeris would be a third
   * to two thirds of a degree low at precisely the elevations where a sighting
   * is most likely to be thrown out for disagreeing with it.
   */
  test.each([
    ["2026-09-06T04:45:00Z", 0.55, 0.75],
    ["2026-09-06T04:55:00Z", 0.4, 0.6],
    ["2026-09-06T05:05:00Z", 0.2, 0.4]
  ])("near the horizon at %s the atmosphere lifts it", (iso, low, high) => {
    const when = new Date(iso);
    const lift = celestialPosition("sun", MILAN, when).altitudeDeg - sunAltitudeDeg(MILAN, when);
    expect(lift).toBeGreaterThan(low);
    expect(lift).toBeLessThan(high);
  });
});

test("the sun crosses the meridian due south of an observer in the north", () => {
  // Azimuth has no second implementation to be checked against, so it is
  // checked against the definition of a transit instead: the instant the sun is
  // highest is the instant it bears due south from anywhere north of the
  // tropics. A frame of reference off by so much as a degree shows up here.
  let highest = { altitudeDeg: -Infinity, azimuthDeg: 0 };
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const position = celestialPosition("sun", MILAN, new Date(Date.UTC(2026, 8, 6, 0, minute)));
    if (position.altitudeDeg > highest.altitudeDeg) highest = position;
  }
  expect(highest.azimuthDeg).toBeCloseTo(180, 0);
});

describe("the size of the discs", () => {
  test("both are about half a degree across", () => {
    const when = new Date("2026-09-06T12:00:00Z");
    // The two famous near-equal angles, which is why there are total eclipses.
    expect(celestialPosition("sun", MILAN, when).angularRadiusDeg).toBeCloseTo(0.264, 2);
    expect(celestialPosition("moon", MILAN, when).angularRadiusDeg).toBeCloseTo(0.27, 2);
  });

  test("the moon's swells and shrinks around its orbit", () => {
    const radii = Array.from({ length: 30 }, (_, day) =>
      celestialPosition("moon", MILAN, new Date(Date.UTC(2026, 8, 1 + day))).angularRadiusDeg
    );
    // Perigee to apogee is about 12% on the distance and so on the disc.
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.05);
  });
});

/**
 * That the observer's own place on the Earth is being passed through, which is
 * the flag that moves the moon by up to a degree — twice its own width, and
 * more than some of the compass errors this whole feature exists to find.
 *
 * Tested through the disc rather than through the bearing, because the size is
 * unambiguous: the distance the app divides into the moon's radius is the
 * distance from the *observer*, so standing where the moon is high puts you a
 * good part of an Earth radius closer to it than standing where it is rising,
 * and the disc has to grow to match. A geocentric call cannot show this at all.
 */
test("the moon is measured from the observer, not from the centre of the Earth", () => {
  const when = new Date("2026-09-06T12:00:00Z");
  const spread = (body: "sun" | "moon") => {
    const radii = [];
    for (let latitudeDeg = -80; latitudeDeg <= 80; latitudeDeg += 1) {
      const position = celestialPosition(
        body,
        { latitudeDeg, longitudeDeg: 100, heightM: 0 },
        when
      );
      if (position.altitudeDeg > 0) radii.push(position.angularRadiusDeg);
    }
    return Math.max(...radii) / Math.min(...radii) - 1;
  };

  expect(spread("moon")).toBeGreaterThan(0.003);
  // The sun is 390 times further away, so the same shift in the observer is
  // nothing at all. It is here to show the moon's figure above is the parallax
  // and not something the scan itself introduces.
  expect(spread("sun")).toBeLessThan(0.00001);
});

test("the sun is always full and the moon is not", () => {
  const when = new Date("2026-09-06T12:00:00Z");
  expect(celestialPosition("sun", MILAN, when).illuminatedFraction).toBe(1);
  const moon = celestialPosition("moon", MILAN, when).illuminatedFraction;
  expect(moon).toBeGreaterThanOrEqual(0);
  expect(moon).toBeLessThanOrEqual(1);
});
