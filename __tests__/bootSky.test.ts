import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOT_SKY_DESIGN,
  bootLogo,
  bootSkyScene,
  logoDotRadius,
  ORBITAL_LOGO,
  starAlpha
} from "../src/components/bootSky";

const PHONE = { width: 390, height: 844 };
const SCREENS = [PHONE, { width: 375, height: 667 }, { width: 430, height: 932 }];
const asset = (name: string) => readFileSync(join(__dirname, "..", "assets", name));
const round = (value: number) => Number(value.toFixed(4));

test("the complete mark stays inside every phone and clear of the centred name", () => {
  for (const frame of SCREENS) {
    const logo = bootLogo(frame);
    expect(logo.x).toBeGreaterThan(0);
    expect(logo.y).toBeGreaterThan(0);
    expect(logo.x + logo.size).toBeLessThan(frame.width);
    expect(logo.y + logo.size).toBeLessThan(frame.height / 2 - 20);
    expect(logo.x + logo.size / 2).toBe(frame.width / 2);
    expect(logo.scale * ORBITAL_LOGO.size).toBeCloseTo(logo.size);
  }
});

test("the blue point breathes smoothly without vanishing or touching the S", () => {
  const { dot, pulse } = ORBITAL_LOGO;
  expect(logoDotRadius(0)).toBe(dot.radius);
  expect(logoDotRadius(-10)).toBe(dot.radius);
  expect(logoDotRadius(pulse.periodSeconds)).toBeCloseTo(dot.radius);
  expect(logoDotRadius(pulse.periodSeconds / 4)).toBeGreaterThan(dot.radius);
  expect(logoDotRadius(pulse.periodSeconds * 3 / 4)).toBeLessThan(dot.radius);
  for (let time = 0; time < 10; time += 0.05) {
    const radius = logoDotRadius(time);
    expect(radius).toBeGreaterThanOrEqual(dot.radius * (1 - pulse.depth));
    expect(radius).toBeLessThanOrEqual(dot.radius * (1 + pulse.depth));
    // The S ends at x=162; the blue satellite always remains detached.
    expect(dot.x - radius).toBeGreaterThan(162);
  }
});

test("the stars keep clear of the name, and only ever twinkle a little", () => {
  const scene = bootSkyScene(PHONE);
  expect(scene.stars.length).toBeGreaterThan(0);
  for (const star of scene.stars) {
    expect(Math.hypot(star.x - PHONE.width / 2, star.y - PHONE.height / 2)).toBeGreaterThanOrEqual(80);
    for (let seconds = 0; seconds < 20; seconds += 0.5) {
      const alpha = starAlpha(star, seconds);
      expect(alpha).toBeLessThanOrEqual(star.alpha);
      expect(alpha).toBeGreaterThanOrEqual(star.alpha * 0.5);
    }
  }
  expect(scene.stars).toEqual(bootSkyScene(PHONE).stars);
});

test("the committed icon and boot still contain the actual app's vector paths and colours", () => {
  const icon = asset("icon.svg").toString();
  const boot = asset("logo-extended.svg").toString();
  for (const svg of [icon, boot]) {
    for (const path of ORBITAL_LOGO.paths) expect(svg).toContain(`d="${path}"`);
    expect(svg).toContain(`fill="${ORBITAL_LOGO.color}"`);
    expect(svg).toContain(`fill="${ORBITAL_LOGO.accent}"`);
    expect(svg).toContain(`cx="${ORBITAL_LOGO.dot.x}" cy="${ORBITAL_LOGO.dot.y}" r="${logoDotRadius(0)}"`);
  }
  const frame = { width: BOOT_SKY_DESIGN.width * 3, height: BOOT_SKY_DESIGN.height * 3 };
  const logo = bootLogo(frame);
  expect(boot).toContain(`translate(${round(logo.x)} ${round(logo.y)}) scale(${round(logo.scale)})`);
  const scene = bootSkyScene(frame);
  for (const star of scene.stars) {
    expect(boot).toContain(`cx="${round(star.x)}" cy="${round(star.y)}" r="${round(star.radius)}" opacity="${round(starAlpha(star, 0))}"`);
  }
});

test("the app icon and README thumbnail are RGB PNGs without an alpha channel", () => {
  for (const [path, size] of [["assets/icon.png", 1024], ["docs/readme/icon.png", 192]] as const) {
    const png = readFileSync(join(__dirname, "..", path));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    expect(png[25]).toBe(2);
  }
});
