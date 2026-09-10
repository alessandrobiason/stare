import { EARTH_SHADOW } from "../src/constants";
import {
  apparentMagnitude,
  illuminationIn,
  phaseAngleDeg,
  shadowFrameFor
} from "../src/satellite/illumination";
import { EciPosition } from "../src/types";

/**
 * The sun, put somewhere chosen rather than somewhere the calendar decides.
 *
 * Down the +x axis at one astronomical unit, so the shadow runs along -x and
 * every figure below can be read off two coordinates: how far behind the Earth
 * a satellite is, and how far off the axis. Real sun positions are checked
 * against Astronomy Engine in `sunAltitude.test.ts`; what is checked here is the
 * geometry of the cones, which does not care what day it is.
 */
const SUN: EciPosition = { x: 149_597_870.7, y: 0, z: 0 };
const SHADOW = shadowFrameFor(SUN);

/** WGS-84 equatorial radius, which the shadow is grown from. */
const EARTH_RADIUS_KM = 6378.137;
/** And what it is grown to: see `EARTH_SHADOW.atmosphereKm`. */
const SHADOW_RADIUS_KM = EARTH_RADIUS_KM + EARTH_SHADOW.atmosphereKm;

/** A little under an ISS orbit: the altitude most of the catalogue lives at. */
const LEO_KM = 7000;

describe("whether the Earth is in the way of the sun", () => {
  test("nothing on the sunward side is ever in shadow", () => {
    // Including a satellite directly over the point beneath the sun, and one
    // out at the geostationary belt: the Earth casts its shadow the other way.
    expect(illuminationIn({ x: LEO_KM, y: 0, z: 0 }, SHADOW).state).toBe("sunlit");
    expect(illuminationIn({ x: 42_164, y: 0, z: 0 }, SHADOW).state).toBe("sunlit");
    // And one barely past the terminator plane, which is the boundary the
    // sunward test is written against.
    expect(illuminationIn({ x: 1, y: LEO_KM, z: 0 }, SHADOW).state).toBe("sunlit");
  });

  test("directly behind the Earth is full shadow", () => {
    const behind = illuminationIn({ x: -LEO_KM, y: 0, z: 0 }, SHADOW);

    expect(behind.state).toBe("eclipsed");
    // Nothing of the sun's disc is reaching it, which is what makes the object
    // invisible rather than merely dimmer.
    expect(behind.litFraction).toBe(0);
  });

  test("far enough off the axis and it is back in full sun", () => {
    const beside = illuminationIn({ x: -LEO_KM, y: 6600, z: 0 }, SHADOW);

    expect(beside.state).toBe("sunlit");
    expect(beside.litFraction).toBe(1);
  });

  test("and between the two there is a penumbra it fades across", () => {
    // The band is about sixty-five kilometres wide at this altitude, which is
    // the ten or twenty seconds a station visibly takes to go out.
    const deep = illuminationIn({ x: -LEO_KM, y: 6440, z: 0 }, SHADOW);
    const shallow = illuminationIn({ x: -LEO_KM, y: 6480, z: 0 }, SHADOW);

    expect(deep.state).toBe("penumbra");
    expect(shallow.state).toBe("penumbra");
    // Deeper into the shadow is less of the sun's disc showing, every time.
    expect(deep.litFraction).toBeLessThan(shallow.litFraction);
    expect(deep.litFraction).toBeGreaterThan(0);
    expect(shallow.litFraction).toBeLessThan(1);
  });

  test("the umbra narrows with distance, and runs out where it should", () => {
    // The sun is the larger body, so the shadow it casts is a converging cone
    // about 1.4 million kilometres long — well past the Moon, and the reason a
    // lunar eclipse is possible at all. Nothing in this catalogue is near the
    // end of it, but getting the sign of the taper wrong would put the whole
    // geostationary belt permanently in the dark.
    const nearRadius = umbraRadiusAt(LEO_KM);
    const farRadius = umbraRadiusAt(42_164);

    expect(nearRadius).toBeLessThan(SHADOW_RADIUS_KM);
    expect(farRadius).toBeLessThan(nearRadius);
    // Where the cone closes: the radius, over how fast it converges.
    expect(SHADOW_RADIUS_KM / SHADOW.umbraTangent).toBeGreaterThan(1_300_000);
    expect(SHADOW_RADIUS_KM / SHADOW.umbraTangent).toBeLessThan(1_500_000);
  });

  test("the shadow is the atmosphere's, not the solid Earth's", () => {
    // Sunlight grazing the first tens of kilometres of air is scattered out of
    // the beam before it gets anywhere, so an object this far off the axis is
    // in the dark even though a ray past the solid globe would have cleared it.
    const grazing = { x: -LEO_KM, y: EARTH_RADIUS_KM + 20, z: 0 };

    expect(umbraRadiusAt(LEO_KM)).toBeGreaterThan(EARTH_RADIUS_KM);
    expect(illuminationIn(grazing, SHADOW).state).toBe("eclipsed");
  });

  test("the shadow follows the sun rather than an axis", () => {
    // The same object, with the sun moved a quarter turn: what was behind the
    // Earth is now beside it. Nothing here may assume where the sun is.
    const overhead: EciPosition = { x: 0, y: -LEO_KM, z: 0 };
    const turned = shadowFrameFor({ x: 0, y: SUN.x, z: 0 });

    expect(illuminationIn(overhead, SHADOW).state).toBe("sunlit");
    expect(illuminationIn(overhead, turned).state).toBe("eclipsed");
  });
});

describe("how much of the lit side is turned this way", () => {
  // The observer is the origin of the frame these are taken in, so a satellite
  // straight overhead is a positive `up` and nothing else.
  const overhead = { east: 0, north: 0, up: 400 };

  test("a sun behind the observer lights the whole of the face being looked at", () => {
    // The sun beyond the observer, on the far side: the satellite is between
    // the two, showing the side the sunlight is falling on.
    expect(phaseAngleDeg(overhead, { east: 0, north: 0, up: -1e8 })).toBeCloseTo(0, 6);
  });

  test("a sun beyond the satellite leaves only its unlit side", () => {
    expect(phaseAngleDeg(overhead, { east: 0, north: 0, up: 1e8 })).toBeCloseTo(180, 6);
  });

  test("and a sun off to the side is the half-lit case in between", () => {
    expect(phaseAngleDeg(overhead, { east: 1e8, north: 0, up: 0 })).toBeCloseTo(90, 3);
  });
});

describe("how bright that leaves it", () => {
  test("a standard magnitude is what the object shows at its own reference", () => {
    // The convention the observing catalogues record against: a thousand
    // kilometres away with half the lit side facing this way. The formula has
    // to hand that figure straight back, or every magnitude it produces is
    // offset by whatever the reference term really is.
    expect(apparentMagnitude(-1.8, 1000, 90)).toBeCloseTo(-1.8, 6);
    expect(apparentMagnitude(6, 1000, 90)).toBeCloseTo(6, 6);
  });

  test("twice as far away is 1.5 magnitudes fainter", () => {
    // Inverse square, in a scale where five steps is a hundredfold: a factor of
    // four in brightness is 2.5 log10(4).
    const near = apparentMagnitude(-1.8, 1000, 90);
    const far = apparentMagnitude(-1.8, 2000, 90);

    expect(far - near).toBeCloseTo(2.5 * Math.log10(4), 6);
  });

  test("the station on a good pass is brighter than any star", () => {
    // Overhead at four hundred kilometres with the sun behind the observer,
    // which is the best it ever gets. The figure people quote for that pass is
    // around minus four and a half — brighter than Venus, and the reason the
    // station is the one satellite everybody has seen.
    expect(apparentMagnitude(-1.8, 400, 0)).toBeCloseTo(-4.5, 1);
    // And at the other end of the same pass — low down, four times as far, and
    // half lit — it has given up nearly four magnitudes and is an ordinary
    // bright star instead. Still an easy object, which is why a station pass is
    // worth watching from horizon to horizon rather than only overhead.
    const lowDown = apparentMagnitude(-1.8, 1600, 90);
    expect(lowDown - apparentMagnitude(-1.8, 400, 0)).toBeGreaterThan(3.5);
    expect(lowDown).toBeLessThan(0);
  });

  test("an object in the umbra has no magnitude to print", () => {
    // Nothing lit is nothing to see, and the arithmetic says so rather than
    // returning a very large number that a card might round and display.
    expect(apparentMagnitude(-1.8, 400, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  test("and one in the penumbra is dimmed by how much of the sun it still sees", () => {
    const full = apparentMagnitude(-1.8, 400, 0, 1);
    const half = apparentMagnitude(-1.8, 400, 0, 0.5);

    expect(half - full).toBeCloseTo(2.5 * Math.log10(2), 6);
  });
});

/** How wide the umbra is `behindKm` behind the Earth, by bisecting for it. */
function umbraRadiusAt(behindKm: number): number {
  let inside = 0;
  let outside = SHADOW_RADIUS_KM * 2;
  for (let step = 0; step < 60; step += 1) {
    const middle = (inside + outside) / 2;
    if (illuminationIn({ x: -behindKm, y: middle, z: 0 }, SHADOW).state === "eclipsed") {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return inside;
}
