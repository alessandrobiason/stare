import { CameraAttitude } from "../src/camera/attitude";
import { celestialPosition } from "../src/coordinates/celestialBodies";
import { brightBlobs } from "../src/vision/brightBodies";
import { DEVICE_LENS, projectToFrame } from "../src/camera/projection";
import { CELESTIAL_ALIGNMENT } from "../src/constants";
import { CelestialPosition } from "../src/coordinates/celestialBodies";
import {
  bodiesWorthSighting,
  CelestialNorthReference,
  CelestialSighting,
  sightBody,
  sightingNoiseDeg
} from "../src/fusion/celestialNorth";
import { OrientationFilter } from "../src/fusion/orientationFilter";
import { toRadians, wrapDegrees180 } from "../src/math/angles";
import { EnuPosition } from "../src/types";
import { BrightBlob } from "../src/vision/brightBodies";
import { Size } from "../src/vision/skySegmentation";

const FRAME: Size = { width: 320, height: 448 };
const LENS = DEVICE_LENS;

/** A unit vector in the observer's frame, from a bearing and an elevation. */
function directionOf(azimuthDeg: number, altitudeDeg: number): EnuPosition {
  const azimuth = toRadians(azimuthDeg);
  const altitude = toRadians(altitudeDeg);
  return {
    east: Math.sin(azimuth) * Math.cos(altitude),
    north: Math.cos(azimuth) * Math.cos(altitude),
    up: Math.sin(altitude)
  };
}

function bodyAt(
  azimuthDeg: number,
  altitudeDeg: number,
  body: "sun" | "moon" = "sun"
): CelestialPosition {
  return { body, azimuthDeg, altitudeDeg, angularRadiusDeg: 0.266, illuminatedFraction: 1 };
}

/**
 * The blob a body at `position` would leave on a frame taken at `attitude` —
 * the forward projection, so that the sighting is asked to invert exactly what
 * the view does when it draws.
 */
function blobFor(
  position: CelestialPosition,
  attitude: CameraAttitude,
  overrides: Partial<BrightBlob> = {}
): BrightBlob {
  const point = projectToFrame(
    directionOf(position.azimuthDeg, position.altitudeDeg),
    attitude,
    LENS
  );
  if (!point) throw new Error("the body is not in this frame");
  return { centre: point, area: 79, radiusPx: 5, peak: 255, clipped: false, ...overrides };
}

/**
 * The frame the phone actually took, sighted against the aim the phone
 * *thought* it had — which is the whole problem in one function. `truth` is
 * where the camera was really pointing; `believed` is that aim with the compass
 * error in it.
 */
function sightWith(
  truth: CameraAttitude,
  believed: CameraAttitude,
  position: CelestialPosition,
  northOffsetDeg = 0,
  overrides: Partial<BrightBlob> = {}
) {
  return sightBody({
    blobs: [blobFor(position, truth, overrides)],
    attitude: believed,
    frame: FRAME,
    lens: LENS,
    position,
    northOffsetDeg
  });
}

describe("recovering the heading from the sun", () => {
  /**
   * The measurement this whole feature is: the camera was pointing at 100°, the
   * compass said 130°, and the sun in the frame says so exactly.
   */
  test("a compass thirty degrees out is measured as thirty degrees out", () => {
    const truth: CameraAttitude = { headingDeg: 100, pitchDeg: 30, rollDeg: 12 };
    const believed: CameraAttitude = { ...truth, headingDeg: 130 };
    // Ten degrees off the aim in bearing and eight up: comfortably inside a
    // frame 54 degrees across, which is where a sighting has to be to exist.
    const sun = bodyAt(110, 38);

    const { sighting } = sightWith(truth, believed, sun, 18);

    expect(sighting).not.toBeNull();
    expect((sighting as CelestialSighting).correctionDeg).toBeCloseTo(-30, 6);
    // And what the filter is handed is that correction applied to the bearing
    // the heading was built with, which is the quantity the magnetometer is
    // also measuring. See `AttitudeMeasurement.northOffsetDeg`.
    expect((sighting as CelestialSighting).northOffsetDeg).toBeCloseTo(-12, 6);
  });

  test.each([
    [0, 0, 0],
    [-75, 20, -30],
    [40, -25, 60],
    [12, 155, 8],
    [-60, -100, 75]
  ])(
    "at pitch %p, roll %p the error of %p degrees comes back exactly",
    (pitchDeg, rollDeg, errorDeg) => {
      const truth: CameraAttitude = { headingDeg: 210, pitchDeg, rollDeg };
      const believed: CameraAttitude = { ...truth, headingDeg: 210 + errorDeg };
      // Placed a little off the optical axis, so the test is not accidentally
      // passing on the one ray where roll and pitch cannot matter.
      const sun = bodyAt(210 + 9, pitchDeg + 6);

      const { sighting } = sightWith(truth, believed, sun);

      expect(sighting).not.toBeNull();
      expect((sighting as CelestialSighting).correctionDeg).toBeCloseTo(
        wrapDegrees180(-errorDeg),
        5
      );
    }
  );

  /**
   * The claim the elevation gate rests on, tested on its own: turning the phone
   * about the vertical moves a ray's azimuth and leaves its elevation exactly
   * where it was. That is why "how high is the blob" can check a sighting
   * without assuming the answer to "which way is the phone facing", and why
   * pitch and roll — which are gravity's, and so are not what is wrong with a
   * compass — are enough to throw out a street lamp.
   */
  test("the elevation of a sighting does not depend on the heading being solved for", () => {
    const truth: CameraAttitude = { headingDeg: 20, pitchDeg: 40, rollDeg: -18 };
    const sun = bodyAt(35, 44);

    for (const errorDeg of [-60, -20, 0, 15, 70]) {
      const { sighting } = sightWith(truth, { ...truth, headingDeg: 20 + errorDeg }, sun);
      expect((sighting as CelestialSighting).elevationResidualDeg).toBeCloseTo(0, 6);
    }
  });
});

describe("what is thrown away", () => {
  const truth: CameraAttitude = { headingDeg: 90, pitchDeg: 25, rollDeg: 0 };
  const sun = bodyAt(100, 30);

  test("a bright thing at the wrong elevation is not the sun", () => {
    // A street lamp, a lit window, a headlight: all perfectly bright, none of
    // them where the sun is. The gate is the cheap half of this feature.
    const lamp = blobFor(bodyAt(100, 30 - CELESTIAL_ALIGNMENT.elevationAgreementDeg - 2), truth);
    const attempt = sightBody({
      blobs: [lamp],
      attitude: truth,
      frame: FRAME,
      lens: LENS,
      position: sun,
      northOffsetDeg: 0
    });

    expect(attempt.sighting).toBeNull();
    expect(attempt.reason).toMatch(/off the sun's elevation/);
  });

  test("two candidates at the body's elevation say nothing at all", () => {
    // Picking the brighter would be a guess dressed as a measurement, and this
    // measurement is about to be worth thirty degrees of heading.
    const attempt = sightBody({
      blobs: [blobFor(sun, truth), blobFor(bodyAt(112, 31), truth)],
      attitude: truth,
      frame: FRAME,
      lens: LENS,
      position: sun,
      northOffsetDeg: 0
    });

    expect(attempt.sighting).toBeNull();
    expect(attempt.reason).toMatch(/2 blobs/);
  });

  test("half a sun at the edge of the frame has its centre in the wrong place", () => {
    expect(sightWith(truth, truth, sun, 0, { clipped: true }).sighting).toBeNull();
  });

  test.each([
    ["a hot pixel", 0.4],
    ["a whole bright overcast", 40]
  ])("%s is the wrong size for a disc", (_name, radiusPx) => {
    expect(sightWith(truth, truth, sun, 0, { radiusPx }).sighting).toBeNull();
  });

  test("a correction larger than any compass error is refused", () => {
    const wild = CELESTIAL_ALIGNMENT.maximumCorrectionDeg + 10;
    const believed: CameraAttitude = { ...truth, headingDeg: truth.headingDeg + wild };
    expect(sightWith(truth, believed, sun).sighting).toBeNull();
  });

  test("an empty frame is a reason, not a failure", () => {
    const attempt = sightBody({
      blobs: [],
      attitude: truth,
      frame: FRAME,
      lens: LENS,
      position: sun,
      northOffsetDeg: 0
    });
    expect(attempt.sighting).toBeNull();
    expect(attempt.reason).toBe("nothing bright in the frame");
  });
});

describe("how far a sighting is trusted", () => {
  test("a body near the zenith says much less about a bearing", () => {
    // Azimuth converges towards the zenith, so the same angular error in the
    // sighting spans more and more of it. The filter is told, rather than the
    // sighting being refused.
    expect(sightingNoiseDeg(60, 0) / sightingNoiseDeg(0, 0)).toBeCloseTo(2, 1);
    expect(sightingNoiseDeg(30, 0)).toBeGreaterThan(sightingNoiseDeg(0, 0));
  });

  test("a body at the corner of the frame is only as good as the assumed lens", () => {
    expect(sightingNoiseDeg(0, 30)).toBeGreaterThan(sightingNoiseDeg(0, 0));
    expect(sightingNoiseDeg(0, 0)).toBeCloseTo(CELESTIAL_ALIGNMENT.baseNoiseDeg, 6);
  });

  test("even the worst sighting allowed is worth more than a good compass", () => {
    // The whole point: a sighting has to be sharper than the magnetometer, or
    // the Kalman gain will not prefer it. The band is bounded by
    // `maximumAltitudeDeg`, and the corner of this frame is about 34 degrees off
    // the axis.
    const worst = sightingNoiseDeg(CELESTIAL_ALIGNMENT.maximumAltitudeDeg, 34);
    expect(worst).toBeLessThan(6);
  });
});

describe("nothing is believed once", () => {
  const sighting = (northOffsetDeg: number, body: "sun" | "moon" = "sun"): CelestialSighting => ({
    body,
    northOffsetDeg,
    correctionDeg: northOffsetDeg,
    noiseDeg: 0.5,
    at: { left: 50, top: 50 },
    altitudeDeg: 30,
    elevationResidualDeg: 0,
    offAxisDeg: 0
  });

  test("the first sighting only arms the second", () => {
    const reference = new CelestialNorthReference();
    expect(reference.confirm(sighting(30), 0)).toBeNull();
    expect(reference.confirm(sighting(30.4), 1.5)).not.toBeNull();
  });

  test("a second sighting that disagrees confirms nothing", () => {
    // A reflection off a window moves with the phone; the sun does not. What
    // separates them is that the implied bearing is the same twice.
    const reference = new CelestialNorthReference();
    reference.confirm(sighting(30), 0);
    expect(reference.confirm(sighting(30 + CELESTIAL_ALIGNMENT.agreementDeg + 1), 1.5)).toBeNull();
    // And it becomes the one to agree with, so a settled sighting still lands.
    expect(reference.confirm(sighting(30 + CELESTIAL_ALIGNMENT.agreementDeg + 1), 3)).not.toBeNull();
  });

  test("two sightings far apart in time are not of the same sky", () => {
    const reference = new CelestialNorthReference();
    reference.confirm(sighting(30), 0);
    expect(
      reference.confirm(sighting(30), CELESTIAL_ALIGNMENT.holdSeconds + 1)
    ).toBeNull();
  });

  test("each body confirms itself", () => {
    // A spurious moon between two real suns must not disarm the sun, which is
    // why the run is kept per body rather than as one last sighting.
    const reference = new CelestialNorthReference();
    expect(reference.confirm(sighting(30, "sun"), 0)).toBeNull();
    expect(reference.confirm(sighting(-70, "moon"), 0.5)).toBeNull();
    expect(reference.confirm(sighting(30.2, "sun"), 1)).not.toBeNull();
  });

  test("a reset drops the run", () => {
    const reference = new CelestialNorthReference();
    reference.confirm(sighting(30), 0);
    reference.reset();
    expect(reference.confirm(sighting(30), 1)).toBeNull();
  });
});

describe("which bodies are looked for", () => {
  const observer = { latitudeDeg: 45.4642, longitudeDeg: 9.19, heightM: 120 };

  test("nothing at all in the small hours", () => {
    // Midwinter, well before dawn: the sun is far down. Whether the moon is up
    // is a fact about the date, so this only asserts the sun is not offered.
    const bodies = bodiesWorthSighting(observer, new Date("2026-12-21T02:00:00Z"));
    expect(bodies.map((body) => body.body)).not.toContain("sun");
  });

  test("the sun in the middle of an autumn morning", () => {
    const bodies = bodiesWorthSighting(observer, new Date("2026-09-06T08:00:00Z"));
    expect(bodies.map((body) => body.body)).toContain("sun");
  });

  test("and not when it is nearly overhead", () => {
    // Midsummer noon on the tropic: a bearing to a body at the zenith is not a
    // bearing to anything.
    const tropic = { latitudeDeg: 23.4, longitudeDeg: 0, heightM: 0 };
    const bodies = bodiesWorthSighting(tropic, new Date("2026-06-21T12:00:00Z"));
    expect(bodies.map((body) => body.body)).not.toContain("sun");
  });
});

describe("what a confirmed sighting does to the heading", () => {
  const RATE = 0.05;

  /**
   * The loop as it actually runs: a magnetometer reporting at twenty a second,
   * steadily thirty degrees out because something magnetic is near the phone,
   * and — when the sun is out — a confirmed sighting once a second, which is
   * the rate the segmentation pass delivers frames at.
   */
  function settle({
    seconds,
    compassNoiseDeg,
    sun
  }: {
    seconds: number;
    compassNoiseDeg: number;
    sun: boolean;
  }): { filter: OrientationFilter; nextSeconds: number } {
    const filter = new OrientationFilter();
    let step = 0;
    for (; step * RATE < seconds; step += 1) {
      filter.update({
        timestampSeconds: step * RATE,
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        northOffsetDeg: 30,
        northOffsetNoiseDeg: compassNoiseDeg
      });
      // A sighting at the centre of the frame, thirty degrees up: what
      // `sightingNoiseDeg` earns for an ordinary one.
      if (sun && step % 20 === 0) filter.correctNorthOffset(0, sightingNoiseDeg(30, 0));
    }
    return { filter, nextSeconds: step * RATE };
  }

  test("a compass thirty degrees out stays thirty degrees out on its own", () => {
    // The failure the whole feature is for, stated as a test: nothing on the
    // phone contradicts a biased magnetometer, so the view is simply wrong and
    // steady about it.
    expect(
      settle({ seconds: 120, compassNoiseDeg: 10, sun: false }).filter.northOffsetDeg
    ).toBeCloseTo(30, 1);
  });

  test.each([
    ["a compass the platform grades high", 3, 3],
    ["a compass it grades medium", 10, 1],
    ["a compass it will not vouch for", 40, 1]
  ])("the sky overrules %s", (_name, compassNoiseDeg, toleranceDeg) => {
    // Not by overriding anything: the sighting is a measurement like the
    // magnetometer's, and it wins on the Kalman gain because it is sharper and
    // because a bias is no longer counted twenty times a second
    // (`magneticCorrelationSeconds`).
    const reference = settle({ seconds: 120, compassNoiseDeg, sun: true }).filter.northOffsetDeg;
    expect(Math.abs(reference)).toBeLessThan(toleranceDeg);
  });

  test("and the heading follows, since that is the state being corrected", () => {
    const { filter, nextSeconds } = settle({ seconds: 120, compassNoiseDeg: 10, sun: true });
    const orientation = filter.update({
      // The next reading, not a second later: a gap that long is one the filter
      // is right to restart across (`maxSampleGapSeconds`).
      timestampSeconds: nextSeconds,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      northOffsetDeg: 30,
      northOffsetNoiseDeg: 10
    });
    expect(Math.abs(wrapDegrees180(orientation.headingDeg))).toBeLessThan(2);
  });

  test("a fix that stops being renewed decays back to the compass", () => {
    // The behaviour that would have needed a mode flag and an unwind to arrange
    // by hand: the sky clouds over, the reference's variance reopens on the
    // random walk, and the magnetometer gradually gets its say back.
    const { filter, nextSeconds } = settle({ seconds: 60, compassNoiseDeg: 10, sun: true });
    const afterSun = Math.abs(filter.northOffsetDeg);

    for (let step = nextSeconds / RATE; step * RATE < 1200; step += 1) {
      filter.update({
        timestampSeconds: step * RATE,
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        northOffsetDeg: 30,
        northOffsetNoiseDeg: 10
      });
    }

    expect(afterSun).toBeLessThan(1);
    expect(filter.northOffsetDeg).toBeGreaterThan(25);
  });

  test("a phone with no magnetometer at all gets its north from the sky", () => {
    // The reference never starts without a bearing to correct it, so the heading
    // is the raw yaw off an origin that means nothing. A sighting starts it.
    const filter = new OrientationFilter();
    filter.update({ timestampSeconds: 0, yawDeg: 40, pitchDeg: 0, rollDeg: 0 });
    expect(filter.northOffsetDeg).toBe(0);

    filter.correctNorthOffset(-15, 0.5);
    const orientation = filter.update({
      timestampSeconds: 0.05,
      yawDeg: 40,
      pitchDeg: 0,
      rollDeg: 0
    });
    expect(filter.northOffsetDeg).toBeCloseTo(-15, 6);
    expect(orientation.headingDeg).toBeLessThan(40);
  });
});


/**
 * The whole path, from pixels to a corrected heading, with nothing stubbed but
 * the camera.
 *
 * Everything between is the real thing: a real ephemeris for a real instant, the
 * real projection placing the sun on the frame, the real blob detector finding
 * it again, and the real filter fusing what comes out. It is here because the
 * three modules meet across two conventions that are easy to get quietly wrong —
 * percent of frame versus pixels, and bearing versus yaw origin — and a mistake
 * in either produces a sighting that looks perfectly plausible and is wrong by a
 * fixed amount nobody would notice from the parts.
 */
test("a photograph of the sun corrects a compass that is twenty-five degrees out", () => {
  const observer = { latitudeDeg: 45.4642, longitudeDeg: 9.19, heightM: 120 };
  const when = new Date("2026-09-06T08:00:00Z");
  const sun = celestialPosition("sun", observer, when);

  // Where the camera really is: the sun eight degrees off the aim in bearing
  // and five below it, so nothing is sitting on a centre line by accident.
  const truth: CameraAttitude = {
    headingDeg: sun.azimuthDeg - 8,
    pitchDeg: sun.altitudeDeg - 5,
    rollDeg: 10
  };
  const believed: CameraAttitude = { ...truth, headingDeg: truth.headingDeg + 25 };

  // The frame that camera would take: a dark sky with the sun burnt into it.
  const point = projectToFrame(
    directionOf(sun.azimuthDeg, sun.altitudeDeg),
    truth,
    LENS
  );
  if (!point) throw new Error("the sun is not in this frame");
  const centreX = (point.left / 100) * FRAME.width;
  const centreY = (point.top / 100) * FRAME.height;
  const pixels = new Uint8Array(FRAME.width * FRAME.height * 4);
  for (let y = 0; y < FRAME.height; y += 1) {
    for (let x = 0; x < FRAME.width; x += 1) {
      const base = (y * FRAME.width + x) * 4;
      const lit = Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) <= 4 ? 255 : 12;
      pixels[base] = lit;
      pixels[base + 1] = lit;
      pixels[base + 2] = lit;
      pixels[base + 3] = 255;
    }
  }

  const blobs = brightBlobs({ pixels, channels: 4 }, FRAME, {
    peakDropCounts: CELESTIAL_ALIGNMENT.peakDropCounts,
    minimumPeakLuminance: CELESTIAL_ALIGNMENT.minimumPeakLuminance,
    minimumPixels: CELESTIAL_ALIGNMENT.minimumBlobPixels,
    limit: CELESTIAL_ALIGNMENT.candidateBlobs
  });
  expect(blobs).toHaveLength(1);

  const { sighting } = sightBody({
    blobs,
    attitude: believed,
    frame: FRAME,
    lens: LENS,
    position: sun,
    northOffsetDeg: 0
  });

  // Within a tenth of a degree, which is a fifth of the frame's own pixel.
  expect(sighting).not.toBeNull();
  expect((sighting as CelestialSighting).correctionDeg).toBeCloseTo(-25, 1);
  expect((sighting as CelestialSighting).elevationResidualDeg).toBeCloseTo(0, 1);

  // And the sighting, once confirmed, puts the heading where the camera really
  // was rather than where the compass said.
  const filter = new OrientationFilter();
  for (let step = 0; step < 400; step += 1) {
    filter.update({
      timestampSeconds: step * 0.05,
      yawDeg: believed.headingDeg,
      pitchDeg: truth.pitchDeg,
      rollDeg: truth.rollDeg,
      northOffsetDeg: 0,
      northOffsetNoiseDeg: 20
    });
    if (step % 20 === 0) {
      const confirmed = new CelestialNorthReference();
      confirmed.confirm(sighting as CelestialSighting, step * 0.05);
      const again = confirmed.confirm(sighting as CelestialSighting, step * 0.05 + 1);
      if (again) filter.correctNorthOffset(again.northOffsetDeg, again.noiseDeg);
    }
  }
  const aimed = filter.update({
    timestampSeconds: 400 * 0.05,
    yawDeg: believed.headingDeg,
    pitchDeg: truth.pitchDeg,
    rollDeg: truth.rollDeg,
    northOffsetDeg: 0,
    northOffsetNoiseDeg: 20
  });
  expect(Math.abs(wrapDegrees180(aimed.headingDeg - truth.headingDeg))).toBeLessThan(1);
});
