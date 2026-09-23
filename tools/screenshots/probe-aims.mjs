/*
 * Asks the running app how many marks each bearing is worth.
 *
 *     node tools/screenshots/probe-aims.mjs 01-sky
 *     node tools/screenshots/probe-aims.mjs 01-sky --az 90,120,150 --el 25,35,45
 *
 * Which way to point a scene decides how full its frame looks, and it cannot be
 * worked out on paper. Three things bear on it at once: where the catalogue
 * actually is at that instant (the geostationary belt is an arc across the
 * south and the rest of the sky is far emptier), how much of the camera frame
 * survives the screen crop (the picture covers a 430-point-wide screen with a
 * 699-point-wide frame, so a third of the width is off the sides and only the
 * count is measured against what is left), and how much of the sky that is left
 * is behind a mountain in that scene's photograph.
 *
 * Two attempts to model that were both wrong by an order of magnitude. So this
 * turns the real app instead and reads the number the header publishes.
 *
 * It needs a dev server already running — `node tools/screenshots/capture.mjs`
 * leaves one up if you interrupt it, or start one with `npm run web`. The
 * counts it prints are what the capture will show.
 */

import { chromium } from "@playwright/test";

const [, , sceneId, ...rest] = process.argv;
if (!sceneId) throw new Error("which scene? e.g. node tools/screenshots/probe-aims.mjs 01-sky");

const flag = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at === -1 ? fallback : rest[at + 1];
};

const azimuths = flag("az", "60,90,120,150,180,210").split(",").map(Number);
const elevations = flag("el", "20,30,40,50").split(",").map(Number);
const APP_URL = process.env.STARE_APP_URL ?? "http://localhost:8081";

/**
 * How long to let the view settle after turning.
 *
 * Turning invalidates the sky mask for the new direction, and the segmenter has
 * to look again before the marks behind the terrain drop out — until it has,
 * the count is the optimistic one.
 */
const SETTLE_MS = 6000;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"]
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1090 / 430,
  locale: "en-US"
});
const page = await context.newPage();

await page.goto(`${APP_URL}/?shot=${sceneId}`, { waitUntil: "commit" });
const header = page.locator('[aria-label$="visible satellites"]').first();
await header.waitFor({ timeout: 300000 });

const countNow = async () => {
  const label = await header.getAttribute("aria-label");
  return Number.parseInt(label ?? "0", 10);
};

console.log(`\n  ${sceneId}: marks on screen, by bearing and height\n`);
process.stdout.write("      el:" + elevations.map((el) => String(el).padStart(6)).join("") + "\n");

let best = null;
for (const az of azimuths) {
  const row = [];
  for (const el of elevations) {
    await page.evaluate(([a, e]) => window.stareShotAim(a, e), [az, el]);
    await page.waitForTimeout(SETTLE_MS);
    const count = await countNow();
    row.push(String(count).padStart(6));
    if (!best || count > best.count) best = { count, az, el };
  }
  process.stdout.write(`  az ${String(az).padStart(3)}:` + row.join("") + "\n");
}

console.log(`\n  best: az ${best.az} el ${best.el} -> ${best.count} marks\n`);
await browser.close();
