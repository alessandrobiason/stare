import { Body, Equator, Observer } from "astronomy-engine";
import { celestialPosition } from "../src/coordinates/celestialBodies";
import { sunAltitudeDeg, sunEciKm } from "../src/coordinates/sunAltitude";
import {
  azimuthDeg,
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt
} from "../src/coordinates/transform";
import { wrapDegrees360 } from "../src/math/angles";
import { ObserverLocation } from "../src/types";

const GREENWICH: ObserverLocation = { latitudeDeg: 51.4778, longitudeDeg: -0.0015, heightM: 0 };
const EQUATOR: ObserverLocation = { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 };
/** Well inside the Arctic circle: the sun does not set there in June. */
const SVALBARD: ObserverLocation = { latitudeDeg: 78.22, longitudeDeg: 15.65, heightM: 0 };

/** The Earth's tilt, which is what the sun's declination swings through. */
const OBLIQUITY_DEG = 23.44;

test("puts the sun where the tilt does at the solstices", () => {
  // At local solar noon the altitude is 90 minus the angle between the
  // observer's latitude and the sun's declination, and at the solstices that
  // declination is the obliquity itself. Greenwich's solar noon is a couple of
  // minutes past 12:00 UT, which the equation of time accounts for; a minute of
  // it is a hundredth of a degree of altitude near noon.
  const summer = sunAltitudeDeg(GREENWICH, new Date("2026-06-21T12:02:00Z"));
  const winter = sunAltitudeDeg(GREENWICH, new Date("2026-12-21T11:58:00Z"));

  expect(summer).toBeCloseTo(90 - GREENWICH.latitudeDeg + OBLIQUITY_DEG, 1);
  expect(winter).toBeCloseTo(90 - GREENWICH.latitudeDeg - OBLIQUITY_DEG, 1);
});

test("stands the sun overhead at the equator on an equinox", () => {
  expect(sunAltitudeDeg(EQUATOR, new Date("2026-03-20T12:07:00Z"))).toBeGreaterThan(89.5);
});

test("crosses the horizon when the almanac says the sun sets", () => {
  // Published sunset at Greenwich on 21 June 2026 is 21:21 BST, and a published
  // sunset is the *upper limb* seen through the atmosphere — about 0.833
  // degrees above the geometric centre this returns. So the figure to expect
  // then is that much below zero, not zero.
  const atSunset = sunAltitudeDeg(GREENWICH, new Date("2026-06-21T20:21:00Z"));

  expect(atSunset).toBeCloseTo(-0.833, 1);
  expect(sunAltitudeDeg(GREENWICH, new Date("2026-06-21T20:00:00Z"))).toBeGreaterThan(0);
});

test("knows the sun by where the observer is, not by the clock", () => {
  // The same instant, and the reason a clock cannot answer this question: it is
  // the middle of the night in one place and the middle of the day in another.
  const instant = new Date("2026-06-21T12:00:00Z");

  expect(sunAltitudeDeg(GREENWICH, instant)).toBeGreaterThan(50);
  expect(
    sunAltitudeDeg({ latitudeDeg: -33.87, longitudeDeg: 151.21, heightM: 0 }, instant)
  ).toBeLessThan(-30);
});

test("leaves the sun up all day inside the Arctic circle in June", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const when = new Date(Date.UTC(2026, 5, 21, hour));
    expect(sunAltitudeDeg(SVALBARD, when)).toBeGreaterThan(0);
  }
});

test("keeps the sun down all day inside the Arctic circle in December", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const when = new Date(Date.UTC(2026, 11, 21, hour));
    expect(sunAltitudeDeg(SVALBARD, when)).toBeLessThan(-6);
  }
});

/**
 * The same series, read as a vector rather than as an altitude.
 *
 * `sunEciKm` is what casts the Earth's shadow (`src/satellite/illumination.ts`),
 * and a shadow pointed the wrong way is not a thing anybody would notice by
 * looking at the app: every satellite would simply be lit at the wrong times of
 * night. So it is checked twice — once against the altitude the same file
 * computes by a different route, and once against Astronomy Engine, which is
 * built on VSOP87 and shares no arithmetic with it at all.
 */
describe("the sun as a direction", () => {
  /** Where the vector puts the sun, seen from `observer`. */
  function horizon(observer: ObserverLocation, when: Date) {
    const enu = eciToEnuInFrame(
      sunEciKm(when),
      gmstAt(when),
      createObserverFrame(observer)
    );
    return { azimuthDeg: wrapDegrees360(azimuthDeg(enu)), altitudeDeg: elevationDeg(enu) };
  }

  test("agrees with the altitude the same series computes directly", () => {
    // Two routes out of one set of coordinates: this one assembles a vector and
    // rotates it into the observer's frame, `sunAltitudeDeg` solves the
    // spherical triangle. They must land on the same sun, or one of the two is
    // assembling its axes wrongly — which no amount of looking at the app finds.
    //
    // They do not land on it exactly, and the gap is the one thing that
    // separates them: this route subtracts the observer's own position from the
    // sun's, and the triangle does not. That difference is solar parallax —
    // standing on the surface rather than at the centre moves the sun by the
    // Earth's radius over an astronomical unit, which is 8.8 arcseconds at its
    // largest. Anything wider than that is not parallax and is a fault.
    const PARALLAX_DEG = 6378.137 / 149_597_870.7 * (180 / Math.PI);

    for (const when of ["2026-03-20T09:00:00Z", "2026-06-21T18:30:00Z", "2026-12-21T12:00:00Z"]) {
      const at = new Date(when);
      for (const observer of [GREENWICH, SVALBARD, EQUATOR]) {
        const gap = Math.abs(horizon(observer, at).altitudeDeg - sunAltitudeDeg(observer, at));
        expect(gap).toBeLessThanOrEqual(PARALLAX_DEG);
      }
    }
  });

  test("and with Astronomy Engine, to the tenth of a degree the series claims", () => {
    // The independent check. Azimuth rather than altitude for the tight one,
    // because `celestialPosition` refracts what it returns and this does not —
    // refraction lifts a body near the horizon by up to half a degree and
    // leaves its bearing alone. See `celestialBodies.ts`.
    const at = new Date("2026-09-10T13:00:00Z");
    const mine = horizon(GREENWICH, at);
    const theirs = celestialPosition("sun", GREENWICH, at);

    expect(mine.azimuthDeg).toBeCloseTo(theirs.azimuthDeg, 1);
    // High enough that refraction is a hundredth of a degree rather than half of
    // one, so the two are comparable without correcting for it.
    expect(theirs.altitudeDeg).toBeGreaterThan(30);
    expect(mine.altitudeDeg).toBeCloseTo(theirs.altitudeDeg, 1);
  });

  test("carries the distance the shadow's cones are shaped by", () => {
    // The Earth's orbit is an ellipse, so the sun is 3.3% nearer in January than
    // in July — which is what makes the umbra a converging cone of a particular
    // length rather than a cylinder. Checked against Astronomy Engine's own
    // figure in astronomical units.
    for (const when of ["2026-01-03T00:00:00Z", "2026-07-05T00:00:00Z"]) {
      const at = new Date(when);
      const site = new Observer(GREENWICH.latitudeDeg, GREENWICH.longitudeDeg, 0);
      const theirs = Equator(Body.Sun, at, site, true, true).dist * 149_597_870.7;
      const sun = sunEciKm(at);

      expect(Math.hypot(sun.x, sun.y, sun.z) / theirs).toBeCloseTo(1, 3);
    }

    const perihelion = sunEciKm(new Date("2026-01-03T00:00:00Z"));
    const aphelion = sunEciKm(new Date("2026-07-05T00:00:00Z"));
    expect(Math.hypot(perihelion.x, perihelion.y, perihelion.z)).toBeLessThan(
      Math.hypot(aphelion.x, aphelion.y, aphelion.z)
    );
  });
});
