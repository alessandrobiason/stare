import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOT_PASSES,
  BOOT_SKY_DESIGN,
  bootSkyScene,
  PASS_TIMING,
  passPose,
  SkyPass,
  skyMoment,
  skyPass,
  starAlpha
} from "../src/components/bootSky";
import {
  BLOOM_FADE,
  CORE_FADE,
  FadeStop,
  GLOW_FADE,
  TAIL_FADE
} from "../src/components/markerScene";
import { CATEGORY_BLOOMS, CATEGORY_COLORS } from "../src/satellite/categories";

/** The colours the one light is drawn in: a landmark's. */
const LIGHT_COLOR = CATEGORY_COLORS.LANDMARK;
const LIGHT_BLOOM = CATEGORY_BLOOMS.LANDMARK;

const PHONE = { width: 390, height: 844 };
/** The smallest screen this ships to, and a current large one. */
const SCREENS = [PHONE, { width: 375, height: 667 }, { width: 430, height: 932 }];

/** Where the light's centre is `progress` of the way through a pass. */
function headAt(pass: SkyPass, progress: number): { x: number; y: number } {
  const { angleDeg } = passPose(pass, progress);
  const radians = angleDeg * (Math.PI / 180);
  const dx = pass.light.x - pass.cx;
  const dy = pass.light.y - pass.cy;
  return {
    x: pass.cx + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: pass.cy + dx * Math.sin(radians) + dy * Math.cos(radians)
  };
}

const everyPass = (frame: typeof PHONE) => {
  const scene = bootSkyScene(frame);
  return BOOT_PASSES.map((_, index) => skyPass(scene, index));
};

test("the satellite is drawn in the overlay's own light", () => {
  // The marks a person will read against the real sky are a pastel point in a
  // bloom of its own hue, and so is the satellite on the screen they wait on —
  // in the colour of the objects worth going outside for.
  for (const pass of everyPass(PHONE)) {
    expect(pass.light.color).toBe(LIGHT_COLOR);
    expect(pass.light.bloomColor).toBe(LIGHT_BLOOM);
  }
});

test("a pass crosses the whole frame, from beyond one edge to beyond the other", () => {
  for (const frame of SCREENS) {
    for (const pass of everyPass(frame)) {
      const start = headAt(pass, 0);
      const end = headAt(pass, 1);
      const [left, right] = pass.direction === 1 ? [start, end] : [end, start];

      expect(left.x).toBeLessThan(0);
      expect(right.x).toBeGreaterThan(frame.width);
    }
  }
});

test("every pass stays above the name, however the screen is shaped", () => {
  // The name sits in the middle of the screen, and a light crossing it would
  // cross out the one word the screen says.
  for (const frame of SCREENS) {
    for (const pass of everyPass(frame)) {
      for (let progress = 0; progress <= 1; progress += 0.02) {
        const { y } = headAt(pass, progress);
        expect(y + pass.light.glow.radius).toBeLessThan(frame.height / 2 - 20);
      }
    }
  }
});

test("the light is already in the sky on the first frame", () => {
  // Boot can be over in a couple of seconds; it is not spent on an empty sky.
  const moment = skyMoment(0);
  const pass = skyPass(bootSkyScene(PHONE), moment.index);
  const head = headAt(pass, moment.progress);

  expect(passPose(pass, moment.progress).alpha).toBe(1);
  expect(head.x).toBeGreaterThan(0);
  expect(head.x).toBeLessThan(PHONE.width);
});

test("a pass fades in and out at its ends rather than appearing and vanishing", () => {
  const [pass] = everyPass(PHONE);

  expect(passPose(pass, 0).alpha).toBe(0);
  expect(passPose(pass, 1).alpha).toBe(0);
  expect(passPose(pass, PASS_TIMING.fadeShare / 2).alpha).toBeGreaterThan(0);
  expect(passPose(pass, PASS_TIMING.fadeShare / 2).alpha).toBeLessThan(1);
  expect(passPose(pass, 0.5).alpha).toBe(1);
});

test("a tail runs back along the arc from under the light, solid and then dashed", () => {
  // Behind the light, as the marks' are, and nobody has to be told which way
  // it is going. Two of the passes run right to left, and "behind" for them is
  // the other way round the arc.
  for (const pass of everyPass(PHONE)) {
    const { light } = pass;
    const { runs } = light.tail;

    // It starts under the light's own centre, and every point of it is on the
    // arc the light is flying.
    expect(runs[0][0]).toBeCloseTo(light.x);
    expect(runs[0][1]).toBeCloseTo(light.y);
    for (const run of runs) {
      for (let index = 0; index < run.length; index += 2) {
        // To well inside a pixel: a dash's ends fall between the arc's samples.
        expect(Math.abs(Math.hypot(run[index] - pass.cx, run[index + 1] - pass.cy) - pass.radius)).toBeLessThan(0.1);
      }
    }
    // Broken into dashes after the solid stretch.
    expect(runs.length).toBeGreaterThan(4);

    // The tip lies back the way the light has come.
    expect(Math.sign(light.x - light.tail.tipX)).toBe(pass.direction);
  }
});

test("the passes take different paths, both ways across, and then come round again", () => {
  const passes = everyPass(PHONE);
  const scene = bootSkyScene(PHONE);

  expect(new Set(passes.map((pass) => pass.direction)).size).toBe(2);
  expect(new Set(passes.map((pass) => Math.round(pass.light.y))).size).toBe(passes.length);
  const again = skyPass(scene, passes.length);
  expect({ ...again, index: 0 }).toEqual(passes[0]);
});

test("the clock moves the light along, and a held clock holds it", () => {
  const scene = bootSkyScene(PHONE);
  const at = (seconds: number) => {
    const moment = skyMoment(seconds);
    return headAt(skyPass(scene, moment.index), moment.progress);
  };

  expect(at(1)).toEqual(at(1));
  expect(at(2).x).not.toBeCloseTo(at(1).x);
  // A pass is flown in its period, and the next one follows it.
  expect(skyMoment(PASS_TIMING.periodSeconds).index).toBe(skyMoment(0).index + 1);
});

test("the composition keeps its proportions on a screen of any shape", () => {
  // Covering rather than fitting: a wide screen loses the top and bottom of
  // the design frame, a tall one its sides, and neither squashes it.
  const tall = bootSkyScene({ width: 400, height: 900 });
  const wide = bootSkyScene({ width: 900, height: 400 });
  const [tallPass] = [skyPass(tall, 0)];
  const [widePass] = [skyPass(wide, 0)];

  expect(tallPass.radius / tall.scale).toBeCloseTo(widePass.radius / wide.scale);
  expect(tallPass.light.glow.radius / tall.scale).toBeCloseTo(widePass.light.glow.radius / wide.scale);
});

test("the stars keep clear of the name, and only ever twinkle a little", () => {
  const scene = bootSkyScene(PHONE);
  const scale = PHONE.height / BOOT_SKY_DESIGN.height;

  expect(scene.stars.length).toBeGreaterThan(0);
  for (const star of scene.stars) {
    const fromCentre = Math.hypot(star.x - PHONE.width / 2, star.y - PHONE.height / 2);
    expect(fromCentre).toBeGreaterThanOrEqual(80 * scale - 0.001);
    for (let seconds = 0; seconds < 20; seconds += 0.5) {
      const alpha = starAlpha(star, seconds);
      expect(alpha).toBeLessThanOrEqual(star.alpha);
      expect(alpha).toBeGreaterThanOrEqual(star.alpha * 0.5);
    }
  }
});

test("the same sky comes out of every run", () => {
  // The still frame in assets/logo-extended.svg is only the same picture as the
  // phone's first frame because the star field is generated from a fixed seed.
  expect(bootSkyScene(PHONE).stars).toEqual(bootSkyScene(PHONE).stars);
});

const round = (value: number) => Number(value.toFixed(2));
const asset = (name: string) => readFileSync(join(__dirname, "..", "assets", name), "utf8");

/** The stops a fade is written into an SVG gradient as, whatever its colour. */
function stopsOf(fade: readonly FadeStop[], color: string): string {
  return fade
    .map(
      (stop) =>
        `<stop offset="${round(stop.at * 100)}%" stop-color="${color}" stop-opacity="${stop.strength}"/>`
    )
    .join("\n      ");
}

/**
 * `tools/make-logo.mjs` cannot import this module — it is a build script and
 * the composition is TypeScript — so it restates the geometry. This is what
 * stops the two drifting: change one, and the other has to be regenerated
 * before this passes.
 */
test("the committed logo is this sky, held at its first frame", () => {
  const svg = asset("logo-extended.svg");
  const frame = { width: BOOT_SKY_DESIGN.width * 3, height: BOOT_SKY_DESIGN.height * 3 };
  const scene = bootSkyScene(frame);
  const moment = skyMoment(0);
  const pass = skyPass(scene, moment.index);
  const pose = passPose(pass, moment.progress);
  const { light } = pass;

  expect(svg).toContain(`width="${frame.width}" height="${frame.height}"`);
  expect(svg).toContain(`transform="rotate(${round(pose.angleDeg)} ${round(pass.cx)} ${round(pass.cy)})"`);
  expect(svg).toContain(
    `<circle cx="${round(light.x)}" cy="${round(light.y)}" r="${round(light.coreRadius)}"`
  );
  expect(svg).toContain(`r="${round(light.glow.radius)}"`);
  expect(svg).toContain(`r="${round(light.bloom.radius)}"`);
  // The tail too, or its shape can drift while the light agrees.
  const [tailX, tailY] = light.tail.runs[0];
  expect(svg).toContain(`d="M ${round(tailX)} ${round(tailY)} L `);
  expect(svg).toContain(`x2="${round(light.tail.tipX)}" y2="${round(light.tail.tipY)}"`);

  // Stars too, or a change to the field goes unnoticed: the light alone does
  // not depend on the seed.
  const field = svg.slice(svg.indexOf('<g id="stars"'), svg.indexOf("</g>", svg.indexOf('<g id="stars"')));
  expect(field.match(/<circle /g)?.length).toBe(scene.stars.length);
  const [first] = scene.stars;
  expect(field).toContain(
    `<circle cx="${round(first.x)}" cy="${round(first.y)}" r="${round(first.radius)}" ` +
      `opacity="${round(starAlpha(first, 0))}"/>`
  );

  // And in the overlay's own fades.
  expect(svg).toContain(stopsOf(TAIL_FADE, LIGHT_COLOR));
  expect(svg).toContain(stopsOf(GLOW_FADE, LIGHT_COLOR));
  expect(svg).toContain(stopsOf(BLOOM_FADE, LIGHT_BLOOM));
  expect(svg).toContain(stopsOf(CORE_FADE, LIGHT_COLOR));
});

test("the icon is drawn in the overlay's own light", () => {
  // Its tail holds on further than a marker's, so an arc sixty points across
  // still reads as one (see ICON in tools/make-logo.mjs); the light around the
  // point is the overlay's.
  const svg = asset("icon.svg");

  expect(svg).toContain(stopsOf(GLOW_FADE, LIGHT_COLOR));
  expect(svg).toContain(stopsOf(BLOOM_FADE, LIGHT_BLOOM));
  expect(svg).toContain(stopsOf(CORE_FADE, LIGHT_COLOR));
});
