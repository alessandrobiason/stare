import { sunAltitudeDeg } from "../src/coordinates/sunAltitude";
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
