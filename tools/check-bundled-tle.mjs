import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Fails if the catalogue the app ships with is more than a day old.
 *
 * `src/data/bundledCatalog.json` is what a phone draws when CelesTrak cannot
 * be reached and it has nothing newer cached — a first launch with no signal,
 * above all. Elements drift a kilometre or so a day in low orbit, so a build
 * carries its own staleness for as long as it is installed: one shipped with a
 * month-old file opens offline on a sky that is a month wrong from its first
 * day. The app says so (`CatalogNotice`), but the fix is before the build, and
 * this is what makes it impossible to forget.
 *
 * A day because that is the age at which the app starts showing its notice
 * (`TLE_USABLE_INTERVAL_MS`): a build that passes here opens offline without
 * one, at least on the day it ships.
 *
 *     node tools/check-bundled-tle.mjs
 *
 * Run from the release workflow's Linux gate, before anything is spent. The
 * remedy is `npm run bundle-tle` and a commit of what it writes.
 */

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FILE = join(dirname(fileURLToPath(import.meta.url)), "../src/data/bundledCatalog.json");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

let bundled;
try {
  bundled = JSON.parse(readFileSync(FILE, "utf8"));
} catch (error) {
  fail(`Could not read src/data/bundledCatalog.json (${error.message}). Run npm run bundle-tle.`);
}

const { downloadedAtMs, entries } = bundled;
if (typeof downloadedAtMs !== "number" || !(downloadedAtMs > 0)) {
  fail("src/data/bundledCatalog.json carries no download date. Run npm run bundle-tle.");
}

const ageMs = Date.now() - downloadedAtMs;
const dated = new Date(downloadedAtMs).toISOString();
const ageHours = (ageMs / 3_600_000).toFixed(1);

if (ageMs > MAX_AGE_MS) {
  fail(
    `The bundled TLE catalogue is ${ageHours} h old (downloaded ${dated}); a build may ship ` +
      `at most 24 h old elements. Run npm run bundle-tle, commit src/data/bundledCatalog.json ` +
      `and start the build again from that commit.`
  );
}

console.log(`Bundled TLE catalogue: ${entries} element sets, ${ageHours} h old (downloaded ${dated}).`);
