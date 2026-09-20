import { SKY_VISIBILITY } from "../src/constants";
import { LANDMARK_NORAD_IDS } from "../src/satellite/categories";
import { apparentMagnitude } from "../src/satellite/illumination";
import { nakedEyeLimit, nakedEyeVerdict, skyDarknessFor } from "../src/satellite/nakedEye";
import { standardMagnitudeFor } from "../src/satellite/standardMagnitude";

/** Sun altitudes either side of the two boundaries, and well past them. */
const NOON = 40;
const SUNSET = -1;
const CIVIL_DUSK = -7;
const NIGHT = -25;

/**
 * A range, in kilometres, for an object overhead in low orbit — the case every
 * verdict below is about unless it says otherwise.
 *
 * Passed rather than defaulted, because the range is the first thing the
 * verdict asks about now and a test that left it out would be testing the
 * default instead of the rule. See `SKY_VISIBILITY.tooFarKm`.
 */
const LOW_ORBIT = 500;

describe("how dark it is where the observer is standing", () => {
  test("the sun being below the horizon is not the same as darkness", () => {
    // The boundary the app cares about is civil twilight, not sunset: for the
    // three quarters of an hour in between, the sky is still bright enough to
    // read by and there is nothing in orbit to be picked out of it.
    expect(skyDarknessFor(NOON)).toBe("daylight");
    expect(skyDarknessFor(SUNSET)).toBe("daylight");
    expect(skyDarknessFor(CIVIL_DUSK)).toBe("twilight");
    expect(skyDarknessFor(NIGHT)).toBe("dark");
  });
});

describe("the faintest thing the sky allows", () => {
  test("nothing at all while the sun is up", () => {
    // Not "a very bright limit": a satellite is not the sun, and there is no
    // magnitude at which one is visible against a lit sky. The arithmetic has to
    // say that outright, or the brightest objects leak through at noon.
    expect(nakedEyeLimit(NOON)).toBe(Number.NEGATIVE_INFINITY);
    expect(nakedEyeLimit(SKY_VISIBILITY.daylightAboveDeg + 0.1)).toBe(
      Number.NEGATIVE_INFINITY
    );
  });

  test("the first-magnitude stars at dusk, and the local sky once it is dark", () => {
    expect(nakedEyeLimit(SKY_VISIBILITY.daylightAboveDeg)).toBeCloseTo(
      SKY_VISIBILITY.twilightNakedEyeMagnitude,
      6
    );
    expect(nakedEyeLimit(SKY_VISIBILITY.darkBelowDeg)).toBeCloseTo(
      SKY_VISIBILITY.nakedEyeMagnitude,
      6
    );
  });

  test("and it only ever gets deeper as the sky drains", () => {
    let previous = nakedEyeLimit(SKY_VISIBILITY.daylightAboveDeg);
    for (let altitude = -6.5; altitude >= -30; altitude -= 0.5) {
      const limit = nakedEyeLimit(altitude);
      expect(limit).toBeGreaterThanOrEqual(previous);
      previous = limit;
    }
    // Clamped past astronomical twilight: the sky has stopped getting darker,
    // so a sun further down buys nothing.
    expect(nakedEyeLimit(-90)).toBeCloseTo(SKY_VISIBILITY.nakedEyeMagnitude, 6);
  });
});

describe("what to tell somebody about one object", () => {
  test("distance is the reason given first, because it is the one nothing fixes", () => {
    // The commonest answer in a southward sky and the one the app used to
    // bury under "too faint". A navigation satellite at 20,000 km and a
    // television satellite parked at 36,000 are not dim, they are far — and
    // no hour of the night and no darker garden changes that.
    const GEOSTATIONARY = 36_000;
    const NAVIGATION = 20_200;

    expect(nakedEyeVerdict("sunlit", 8.5, NIGHT, GEOSTATIONARY)).toBe("tooFar");
    expect(nakedEyeVerdict("sunlit", 9, NIGHT, NAVIGATION)).toBe("tooFar");
  });

  test("and it outranks the sun and the shadow, which would both read as 'come back later'", () => {
    // Said of something in low orbit, "daylight" and "in the Earth's shadow"
    // are both an invitation to try again in a few hours. Said of a GPS
    // satellite they are a promise the app cannot keep: nobody has ever seen
    // one by eye, at any hour of any night.
    expect(nakedEyeVerdict("sunlit", -1.8, NOON, 36_000)).toBe("tooFar");
    expect(nakedEyeVerdict("eclipsed", -1.8, NIGHT, 36_000)).toBe("tooFar");
    // And an object with no recorded brightness at all, which would otherwise
    // have come out as "unknown" — the range alone settles it.
    expect(nakedEyeVerdict("sunlit", null, NIGHT, 36_000)).toBe("tooFar");
  });

  test("but low orbit keeps every other verdict, right up to the boundary", () => {
    // The threshold has to leave the whole of low orbit alone, or the app
    // stops answering the question it exists to answer. The highest shell it
    // draws in numbers is OneWeb's, at 1,200 km.
    expect(nakedEyeVerdict("sunlit", -1.8, NIGHT, 1_200)).toBe("visible");
    expect(nakedEyeVerdict("sunlit", -1.8, NIGHT, SKY_VISIBILITY.tooFarKm - 1)).toBe("visible");
    expect(nakedEyeVerdict("sunlit", -1.8, NIGHT, SKY_VISIBILITY.tooFarKm + 1)).toBe("tooFar");
  });

  test("daylight rules out the whole sky, however bright the object", () => {
    // Including the station at its best, and before the shadow is even asked
    // about: what is wrong is the sky, not the satellite.
    expect(nakedEyeVerdict("sunlit", -4.5, NOON, LOW_ORBIT)).toBe("daylight");
    expect(nakedEyeVerdict("eclipsed", null, SUNSET, LOW_ORBIT)).toBe("daylight");
  });

  test("an object in the Earth's shadow is not visible at any brightness", () => {
    expect(nakedEyeVerdict("eclipsed", -4.5, NIGHT, LOW_ORBIT)).toBe("eclipsed");
  });

  test("one in the penumbra is judged on brightness like anything else", () => {
    // It is on its way out rather than out, and how far through that it is has
    // already been paid for in the magnitude (`Illumination.litFraction`).
    // Calling it eclipsed here would take a station out of the sky several
    // seconds before it actually goes.
    expect(nakedEyeVerdict("penumbra", -2, NIGHT, LOW_ORBIT)).toBe("visible");
    expect(nakedEyeVerdict("penumbra", 9, NIGHT, LOW_ORBIT)).toBe("tooFaint");
  });

  test("a brightness nobody recorded is said to be unknown, not guessed", () => {
    // The honest answer for most of the catalogue. It is not "not visible":
    // the object is lit and it is dark here, and the only thing missing is how
    // reflective the thing is. See `standardMagnitude.ts`.
    expect(nakedEyeVerdict("sunlit", null, NIGHT, LOW_ORBIT)).toBe("unknown");
    expect(nakedEyeVerdict("sunlit", null, CIVIL_DUSK, LOW_ORBIT)).toBe("unknown");
  });

  test("and the same object becomes findable as the sky goes on darkening", () => {
    // The whole reason the limit moves. At dusk only the brightest few clear
    // it; an hour later a third-magnitude object does too, which is the order
    // things actually come out of a twilight sky in.
    expect(nakedEyeVerdict("sunlit", 3.5, CIVIL_DUSK, LOW_ORBIT)).toBe("binoculars");
    expect(nakedEyeVerdict("sunlit", 3.5, NIGHT, LOW_ORBIT)).toBe("visible");
    // The station clears it either way.
    expect(nakedEyeVerdict("sunlit", -1.8, CIVIL_DUSK, LOW_ORBIT)).toBe("visible");
  });

  test("past binoculars it says so rather than offering false hope", () => {
    expect(nakedEyeVerdict("sunlit", SKY_VISIBILITY.binocularMagnitude - 0.1, NIGHT, LOW_ORBIT)).toBe(
      "binoculars"
    );
    expect(nakedEyeVerdict("sunlit", SKY_VISIBILITY.binocularMagnitude + 0.1, NIGHT, LOW_ORBIT)).toBe(
      "tooFaint"
    );
  });
});

describe("how reflective an object is recorded to be", () => {
  test("every landmark has a figure, because every landmark gets asked", () => {
    // The tier that carries a name, a photograph and a description is the tier
    // somebody taps to find out whether they can go and look at it. A landmark
    // added to `categories.ts` without a brightness here is one the card has to
    // shrug at, and this is what catches that.
    for (const noradId of LANDMARK_NORAD_IDS) {
      expect(standardMagnitudeFor(noradId, "WHATEVER THE CATALOGUE CALLS IT")).not.toBeNull();
    }
  });

  test("the catalogue number wins, because a name does not last", () => {
    // The station is `ISS (ZARYA)` in the catalogue and `ISS` on the overlay,
    // and neither is what the figure is filed under.
    expect(standardMagnitudeFor(25544, "ISS (ZARYA)")?.magnitude).toBe(-1.8);
    expect(standardMagnitudeFor(25544, "ISS")?.magnitude).toBe(-1.8);
  });

  test("the three most-watched objects are measurements, the rest are not", () => {
    // What separates a figure the card may state from one it has to hedge.
    expect(standardMagnitudeFor(25544, "ISS")?.measured).toBe(true);
    expect(standardMagnitudeFor(48274, "CSS (TIANHE)")?.measured).toBe(true);
    expect(standardMagnitudeFor(20580, "HST")?.measured).toBe(true);
    expect(standardMagnitudeFor(44874, "CHEOPS")?.measured).toBe(false);
    expect(standardMagnitudeFor(1, "STARLINK-1234")?.measured).toBe(false);
  });

  test("the large constellations are recognised by name", () => {
    // Two thirds of the active catalogue is Starlink, so this one pattern is
    // most of what stands between a sky of marks and a sky that can say which
    // of them is worth looking for.
    expect(standardMagnitudeFor(1, "STARLINK-31234")?.magnitude).toBe(6);
    expect(standardMagnitudeFor(2, "ONEWEB-0263")?.magnitude).toBe(6.5);
    expect(standardMagnitudeFor(3, "IRIDIUM 141")?.magnitude).toBe(6);
  });

  test("and everything else says it does not know", () => {
    // Rather than a default, which the rest of the app could not tell apart
    // from a measurement.
    expect(standardMagnitudeFor(1, "COSMOS 2528")).toBeNull();
    expect(standardMagnitudeFor(2, "YAOGAN-33")).toBeNull();
    expect(standardMagnitudeFor(3, "TRANSPORTER-17 OBJECT CA")).toBeNull();
  });

  test("the far observatories are out of reach whatever figure they carry", () => {
    // Chandra and XMM-Newton spend most of their long orbits beyond a hundred
    // thousand kilometres, and inverse square alone is twenty-five magnitudes
    // there. Which is the point of not agonising over their standard
    // magnitudes: the estimate cannot change the answer.
    const chandra = standardMagnitudeFor(25867, "CXO");
    const atApogee = apparentMagnitude(chandra?.magnitude ?? 0, 134_000, 60);

    expect(atApogee).toBeGreaterThan(SKY_VISIBILITY.binocularMagnitude);
    // And the card says which of the two facts is the one that settles it: at
    // that range the brightness is beside the point, and "too faint" would
    // invite somebody to go looking for a darker garden.
    expect(nakedEyeVerdict("sunlit", atApogee, NIGHT, 134_000)).toBe("tooFar");
  });
});
