import { TLE_CONNECT_TIMEOUT_MS } from "../constants";
import { Tle } from "../types";
import { readBundledCatalog } from "./bundledCatalog";
import {
  BUNDLED_CATALOG_URL,
  CachedCatalog,
  holdBundledCatalog,
  isFresh,
  isStale,
  isUsable,
  mayRetry,
  readCache,
  recordFailedAttempt,
  storeCatalog
} from "./tleCache";

const DEFAULT_TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const ACTIVE_TLE_URL = process.env.EXPO_PUBLIC_TLE_URL ?? DEFAULT_TLE_URL;

/**
 * The download in flight, if any.
 *
 * Two screens mounting at once must not become two requests: the whole point of
 * the refresh interval is that the server sees one download per window.
 */
let inFlight: Promise<ActiveCatalog> | null = null;

/**
 * Downloads and stores the catalogue.
 *
 * The timeout is on the *answer*, not on the download: it is cleared as soon as
 * the headers are in, so a slow connection pulling two and a half megabytes is
 * left to finish. What it cuts short is a server that never answers at all,
 * which the platform would otherwise wait out for a minute or more — with
 * boot's screen up, and a catalogue on hand to open on instead.
 */
async function fetchActiveCatalog(url: string, nowMs: number): Promise<Tle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TLE_CONNECT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "text/plain" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`TLE download failed (${response.status})`);
  return await storeCatalog(url, await response.text(), nowMs);
}

/**
 * Where the catalog in hand came from. `"bundled"` is the one the app ships
 * with (`bundledCatalog.ts`); `"none"` is nothing at all, which only a build
 * missing that file can reach.
 */
export type CatalogSource = "network" | "cache" | "bundled" | "none";

export type ActiveCatalog = {
  tles: Tle[];
  source: CatalogSource;
  /**
   * When these elements were downloaded — by this device, or by whoever built
   * the app for the bundled ones. What the view measures their age by, to say
   * when it is drawing a sky that is out of date (`isStale`).
   */
  downloadedAtMs: number;
};

function fromCache(cache: CachedCatalog): ActiveCatalog {
  return {
    tles: cache.tles,
    source: cache.url === BUNDLED_CATALOG_URL ? "bundled" : "cache",
    downloadedAtMs: cache.downloadedAtMs
  };
}

/**
 * The best thing to open on when the network has failed: this device's own
 * cache or the catalogue the app shipped with, whichever is newer.
 *
 * Newer rather than cache-first, because an app updated after a month offline
 * carries elements a month fresher than the ones on disk. Stale elements
 * degrade gracefully — positions drift over days, they do not become nonsense —
 * so either beats no catalogue by a wide margin.
 */
async function fallBack(cache: CachedCatalog | null, nowMs: number): Promise<ActiveCatalog> {
  const bundled = await readBundledCatalog();
  if (cache && (!bundled || cache.downloadedAtMs >= bundled.downloadedAtMs)) {
    return fromCache(cache);
  }
  if (bundled) {
    holdBundledCatalog(bundled.tles, bundled.downloadedAtMs, nowMs);
    return { tles: bundled.tles, source: "bundled", downloadedAtMs: bundled.downloadedAtMs };
  }
  return { tles: [], source: "none", downloadedAtMs: 0 };
}

export type LoadCatalogOptions = {
  /**
   * Skip the post-failure retry throttle. For a retry the user asked for by
   * hand — the button on the boot screen — which is a deliberate act rather
   * than a loop, and so is not the traffic the throttle exists to prevent. The
   * two-hour refresh window still applies: a cache good enough to serve is
   * still served without a request.
   */
  force?: boolean;
};

/** Whether the network is worth trying, given what is already cached. */
function shouldDownload(
  cache: CachedCatalog | null,
  url: string,
  nowMs: number,
  force: boolean
): boolean {
  if (!cache) return true;
  if (isFresh(cache, url, nowMs)) return false;
  return force || mayRetry(cache, nowMs);
}

/**
 * The background refresh in flight, if any.
 *
 * Its own guard rather than `inFlight`: that one is what a caller waiting on a
 * catalogue is given, and this is a download nobody is waiting on. Sharing one
 * would hand the next caller a promise that resolves to elements it was not
 * asking to wait for.
 */
let refreshing = false;

/**
 * Fetches a newer catalogue for the *next* launch, without anybody waiting on
 * it.
 *
 * Nothing here reaches the screen. The app is already running on the elements
 * this was started beside, and swapping a sixteen-thousand-entry catalogue out
 * from under a view that is drawing it would cost a rebuild of every SGP4
 * record for a correction of a fraction of a pixel. What it buys is the next
 * launch: the elements land on disk, and the one after this opens on a fresh
 * cache without a request.
 *
 * Failures are noted and swallowed. A refresh nobody asked for must not become
 * an unhandled rejection, and the app it is running behind is working.
 */
function refreshInBackground(url: string, nowMs: number): void {
  if (refreshing) return;
  refreshing = true;
  void fetchActiveCatalog(url, nowMs)
    .catch((error: unknown) => {
      recordFailedAttempt(nowMs);
      console.warn("Background TLE refresh failed; the cached catalogue stands", error);
    })
    .finally(() => {
      refreshing = false;
    });
}

async function resolveActiveCatalog(
  url: string,
  nowMs: number,
  force: boolean
): Promise<ActiveCatalog> {
  const cache = await readCache();

  // A cache still inside the refresh window is the answer. Not a fallback, not
  // a head start on a download — the request is simply not made.
  if (cache && !shouldDownload(cache, url, nowMs, force)) {
    return fromCache(cache);
  }

  // Past the refresh window and still well inside the accuracy one: open on
  // what is already here and fetch the rest behind it.
  //
  // This is the launch people actually notice. Two hours is CelesTrak's rule
  // about traffic, not a statement about where a satellite is, and treating it
  // as both meant every evening's first launch blocked on a couple of
  // megabytes before the app would draw anything — on a good connection as
  // much as a bad one, since the wait is the download rather than the
  // latency. A forced retry skips this: somebody who has pressed the button on
  // a failure is asking for the network, not for what is on disk. See
  // `TLE_USABLE_INTERVAL_MS`.
  if (cache && !force && isUsable(cache, url, nowMs)) {
    refreshInBackground(url, nowMs);
    return fromCache(cache);
  }

  try {
    return { tles: await fetchActiveCatalog(url, nowMs), source: "network", downloadedAtMs: nowMs };
  } catch (error) {
    recordFailedAttempt(nowMs);
    const fallback = await fallBack(cache, nowMs);
    console.warn(`TLE download failed; serving the ${fallback.source} catalog`, error);
    return fallback;
  }
}

/**
 * Returns the active satellite catalog, degrading in this order:
 * cached-and-fresh -> cached-and-still-accurate (refreshing behind it) ->
 * network -> whichever is newer of cached-but-old and the catalogue the app
 * shipped with.
 *
 * It never rejects. `source` says how far down that list it had to go and
 * `downloadedAtMs` how old the answer is, so the caller can decide what to make
 * of it: the view opens on old elements and says so, and keeps asking for new
 * ones (`refreshStaleCatalog`).
 *
 * Only the middle step ever blocks on the network, and only for a cache older
 * than a day or a device with none at all. Everything else answers off the
 * disk, which is what keeps a launch from being a download — see
 * `resolveActiveCatalog`.
 *
 * The cache is on disk and carries its own timestamp, so closing and reopening
 * the app does not start the refresh window over — a cold launch inside it
 * makes no request at all.
 */
export function loadActiveCatalog(options: LoadCatalogOptions = {}): Promise<ActiveCatalog> {
  // A forced retry must not be answered by the in-flight promise it is trying
  // to get past.
  if (inFlight && !options.force) return inFlight;
  inFlight = resolveActiveCatalog(ACTIVE_TLE_URL, Date.now(), options.force ?? false).finally(
    () => {
      inFlight = null;
    }
  );
  return inFlight;
}

/**
 * A newer catalogue for a view that is drawing a stale one, or `null` when
 * there is none to be had yet.
 *
 * For the running app, which unlike boot has something on screen and no reason
 * to wait: called on a timer while the elements in use are past
 * `TLE_USABLE_INTERVAL_MS`, and the answer — when there is one — replaces them
 * in place. That is the other side of `refreshInBackground`, which does not
 * swap: a correction of a fraction of a pixel is not worth rebuilding sixteen
 * thousand records under a view that is drawing them, a correction of days is.
 *
 * Throttled exactly as a launch is. A failed attempt starts
 * `TLE_RETRY_INTERVAL_MS`, and until it has run out this answers `null` without
 * a request, however often it is asked — the timer calling it is not what sets
 * the pace, CelesTrak's rules are. An answer already on disk, from a background
 * refresh that landed after boot, is handed back without a download at all.
 */
export async function refreshStaleCatalog(): Promise<ActiveCatalog | null> {
  if (refreshing || inFlight) return null;
  const url = ACTIVE_TLE_URL;
  const nowMs = Date.now();

  const cache = await readCache();
  if (cache && cache.url === url && !isStale(cache.downloadedAtMs, nowMs)) return fromCache(cache);
  if (cache && !mayRetry(cache, nowMs)) return null;

  refreshing = true;
  try {
    return { tles: await fetchActiveCatalog(url, nowMs), source: "network", downloadedAtMs: nowMs };
  } catch (error) {
    recordFailedAttempt(nowMs);
    console.warn("TLE refresh failed; the stale catalogue stands", error);
    return null;
  } finally {
    refreshing = false;
  }
}

export { parseCatalogInSlices, parseTleCatalog } from "./tleCatalog";
export { isStale } from "./tleCache";
export { classifySatellite } from "../satellite/categories";
export { clearTleCache } from "./tleCache";
