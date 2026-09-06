import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOT_ORBITS,
  BOOT_SKY_DESIGN,
  bootSkyScene,
  skyAngleDeg
} from "../src/components/bootSky";
import { CATEGORY_COLORS } from "../src/satellite/categories";

const PHONE = { width: 390, height: 844 };

test("the sky is one satellite per category, in the overlay's own colours", () => {
  const drawn = bootSkyScene(PHONE).satellites.map((satellite) => satellite.color);

  // The point of drawing five rather than one: the palette a person will read
  // against the real sky is already in front of them while it loads.
  expect(new Set(drawn)).toEqual(new Set(Object.values(CATEGORY_COLORS)));
});

test("every orbit turns about the middle of the screen", () => {
  for (const satellite of bootSkyScene(PHONE).satellites) {
    expect(satellite.cx).toBeCloseTo(PHONE.width / 2);
    expect(satellite.cy).toBeCloseTo(PHONE.height / 2);
  }
});

test("the composition keeps its proportions on a screen of any shape", () => {
  // Covering rather than fitting: a wide screen loses the top and bottom of
  // the design frame, a tall one its sides, and neither squashes it.
  const tall = bootSkyScene({ width: 400, height: 900 });
  const wide = bootSkyScene({ width: 900, height: 400 });

  for (const [index, satellite] of tall.satellites.entries()) {
    const other = wide.satellites[index];
    const reach = (drawn: typeof satellite) => Math.hypot(drawn.bodyX - drawn.cx, drawn.bodyY - drawn.cy);
    // Same radius per unit of the covering scale, whichever way the frame runs.
    expect(reach(satellite) / (900 / BOOT_SKY_DESIGN.height)).toBeCloseTo(
      reach(other) / (900 / BOOT_SKY_DESIGN.width)
    );
  }
});

test("a trail starts at a point and thickens to its head", () => {
  const [satellite] = bootSkyScene(PHONE).satellites;
  const points = satellite.trail;
  const at = (index: number): [number, number] => [points[index * 2], points[index * 2 + 1]];
  const count = points.length / 2;
  /** The last point of the far edge; the near one starts at the next. */
  const head = count / 2 - 1;

  // The polygon is walked out along the far edge and back along the near one,
  // so its first and last points are the two edges of the tail — one point.
  const [tailX, tailY] = at(0);
  const [tailBackX, tailBackY] = at(count - 1);
  expect(Math.hypot(tailX - tailBackX, tailY - tailBackY)).toBeCloseTo(0);

  // At the head they are a full trail width apart.
  const [headX, headY] = at(head);
  const [headBackX, headBackY] = at(head + 1);
  const width = BOOT_ORBITS[0].trailWidth * (PHONE.height / BOOT_SKY_DESIGN.height);
  expect(Math.hypot(headX - headBackX, headY - headBackY)).toBeCloseTo(width);
});

test("a trail stops short of its own body, rather than growing out of it", () => {
  // A trail that runs under the body is one silhouette with the body: a round
  // head with a tail on it, which is a tadpole. Every one of them keeps clear.
  for (const satellite of bootSkyScene(PHONE).satellites) {
    let nearest = Infinity;
    for (let index = 0; index < satellite.trail.length; index += 2) {
      nearest = Math.min(
        nearest,
        Math.hypot(satellite.trail[index] - satellite.bodyX, satellite.trail[index + 1] - satellite.bodyY)
      );
    }
    expect(nearest).toBeGreaterThan(satellite.bodyRadius);
  }
});

test("the satellites turn, at their own rates and both ways round", () => {
  const { satellites } = bootSkyScene(PHONE);
  const after = satellites.map((satellite) => skyAngleDeg(satellite, 10));

  expect(after.every((angle) => angle !== 0)).toBe(true);
  // Both directions are used, or the whole picture drifts one way like a wheel.
  expect(after.some((angle) => angle > 0)).toBe(true);
  expect(after.some((angle) => angle < 0)).toBe(true);
  // A full turn takes each orbit its own period, and none of them share one.
  const turns = satellites.map((satellite) => 360 / Math.abs(satellite.degreesPerSecond));
  expect(new Set(turns).size).toBe(turns.length);
});

test("nothing turns while the clock is held", () => {
  const [satellite] = bootSkyScene(PHONE).satellites;
  expect(skyAngleDeg(satellite, 0)).toBe(0);
});

test("the stars keep clear of the middle, where the orbits are busiest", () => {
  const scene = bootSkyScene(PHONE);
  const scale = PHONE.height / BOOT_SKY_DESIGN.height;

  expect(scene.stars.length).toBeGreaterThan(0);
  for (const star of scene.stars) {
    const fromCentre = Math.hypot(star.x - PHONE.width / 2, star.y - PHONE.height / 2);
    expect(fromCentre).toBeGreaterThanOrEqual(130 * scale - 0.001);
  }
});

test("the same sky comes out of every run", () => {
  // The still frame in assets/logo-extended.svg is only the same picture as the
  // phone's first frame because the star field is generated from a fixed seed.
  expect(bootSkyScene(PHONE).stars).toEqual(bootSkyScene(PHONE).stars);
});

/**
 * `tools/make-logo.mjs` cannot import this module — it is a build script and
 * the composition is TypeScript — so it restates the geometry. This is what
 * stops the two drifting: change one, and the other has to be regenerated
 * before this passes.
 */
test("the committed logo is this sky, held still", () => {
  const svg = readFileSync(join(__dirname, "..", "assets", "logo-extended.svg"), "utf8");
  const scene = bootSkyScene(BOOT_SKY_DESIGN);
  const round = (value: number) => Number(value.toFixed(2));

  for (const satellite of scene.satellites) {
    const body =
      `<circle cx="${round(satellite.bodyX)}" cy="${round(satellite.bodyY)}" ` +
      `r="${round(satellite.bodyRadius)}"/>`;
    expect(svg).toContain(`<g fill="${satellite.color}">`);
    expect(svg).toContain(body);

    // The trail too, or the shape itself can drift while the bodies agree:
    // its tip is where the gap the trail leaves shows up in the file.
    const [tipX, tipY] = [satellite.trail[0], satellite.trail[1]];
    expect(svg).toContain(`d="M ${round(tipX)} ${round(tipY)} L `);
  }

  // Stars too, or a change to the field goes unnoticed: the bodies alone do
  // not depend on the seed.
  expect(svg.match(/<circle[^>]*opacity=/g)?.length).toBe(scene.stars.length);
});
