import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Refreshes the catalogue the app ships with: `src/data/bundledCatalog.json`,
 * the element sets STARE falls back on when CelesTrak cannot be reached and the
 * phone has nothing newer cached.
 *
 *     npm run bundle-tle                         # one download from CelesTrak
 *     npm run bundle-tle -- --from some.tle      # a file already downloaded
 *
 * Run it before a release. The elements in the output drift a kilometre or so
 * a day in low orbit, so a build shipped with a month-old file opens, offline,
 * on a sky that is a month wrong — and says so (`CatalogNotice`).
 *
 * **One request, and only one.** CelesTrak lets an address pull a group once
 * every two hours; a second request inside the window is answered with a 403
 * and a note that nothing has changed, and a client that keeps asking gets
 * blocked. So this script never retries, and refuses to run at all within two
 * hours of its own last attempt (kept in `node_modules/.cache`, which is not
 * committed). The window is per address, not per program: an app running on
 * the same network counts against it too, which is what `--from` is for —
 * point it at a file downloaded by other means and nothing is fetched.
 *
 * A download is checked before it replaces anything: the status, CelesTrak's
 * "not updated" note, and that the text holds a catalogue's worth of element
 * sets. A bad answer leaves the committed file as it was.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src/data/bundledCatalog.json");
const ATTEMPT_FILE = join(ROOT, "node_modules/.cache/stare/bundle-tle-attempt");

/** The same endpoint the app reads (`src/data/tleProvider.ts`). */
const URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const WINDOW_MS = 2 * 60 * 60 * 1000;
/** The active group is around sixteen thousand objects; far fewer is not it. */
const MIN_ENTRIES = 5000;

function fail(message) {
  console.error(`bundle-tle: ${message}`);
  process.exit(1);
}

/** Element-set count, from the line 1s. */
function countEntries(text) {
  return text.split(/\r?\n/).filter((line) => line.startsWith("1 ")).length;
}

/**
 * When the file was current, from its epochs. What a file downloaded elsewhere
 * is dated by: most of CelesTrak's element sets are refreshed within hours of
 * any download.
 *
 * The 99th percentile rather than the newest, because the newest is not to be
 * trusted: a handful of objects carry epochs days *after* the file was
 * downloaded (the 2026-08-23 fixture has two dated the 25th and 26th), and one
 * of those would date the whole catalogue as fresher than it is.
 */
function datedByEpochsMs(text) {
  const epochs = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("1 ")) continue;
    const yy = Number(line.slice(18, 20));
    const day = Number(line.slice(20, 32));
    if (!Number.isFinite(yy) || !Number.isFinite(day)) continue;
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    epochs.push(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000);
  }
  if (epochs.length === 0) return 0;
  epochs.sort((a, b) => a - b);
  return Math.round(epochs[Math.floor((epochs.length - 1) * 0.99)]);
}

function lastAttemptMs() {
  try {
    return Number(readFileSync(ATTEMPT_FILE, "utf8"));
  } catch {
    return 0;
  }
}

function recordAttempt(nowMs) {
  mkdirSync(dirname(ATTEMPT_FILE), { recursive: true });
  writeFileSync(ATTEMPT_FILE, String(nowMs));
}

async function download() {
  const nowMs = Date.now();
  const since = nowMs - lastAttemptMs();
  if (since >= 0 && since < WINDOW_MS) {
    const minutes = Math.ceil((WINDOW_MS - since) / 60_000);
    fail(`last attempt was under two hours ago; try again in ${minutes} min, or use --from.`);
  }

  // Recorded before the request rather than after it: a request that hangs or
  // crashes this script still counted against the window.
  recordAttempt(nowMs);
  const response = await fetch(URL, { headers: { Accept: "text/plain" } });
  const text = await response.text();
  if (/has not updated since your last/i.test(text)) {
    fail(`CelesTrak says this address already downloaded the group:\n${text.trim()}`);
  }
  if (!response.ok) fail(`CelesTrak answered ${response.status}: ${text.slice(0, 200).trim()}`);
  return { text, downloadedAtMs: nowMs, source: URL };
}

function fromFile(path) {
  const text = readFileSync(path, "utf8");
  return { text, downloadedAtMs: datedByEpochsMs(text), source: `file:${path}` };
}

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const { text, downloadedAtMs, source } =
  fromIndex >= 0 ? fromFile(args[fromIndex + 1] ?? fail("--from needs a path")) : await download();

const entries = countEntries(text);
if (entries < MIN_ENTRIES) fail(`only ${entries} element sets in the answer; not replacing.`);
if (!(downloadedAtMs > 0)) fail("could not date the catalogue.");

writeFileSync(
  OUTPUT,
  JSON.stringify({
    downloadedAt: new Date(downloadedAtMs).toISOString(),
    downloadedAtMs,
    entries,
    source,
    catalog: text
  }) + "\n"
);
console.log(
  `bundle-tle: ${entries.toLocaleString()} element sets, dated ${new Date(downloadedAtMs).toISOString()}, written to src/data/bundledCatalog.json`
);
