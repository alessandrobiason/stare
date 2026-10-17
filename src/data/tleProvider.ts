import { TLE_CONNECT_TIMEOUT_MS, TLE_DOWNLOAD_TIMEOUT_MS, TLE_REFRESH_INTERVAL_MS, TLE_RETRY_INTERVAL_MS } from "../constants";
import { setTleDownloadStatus, tleDownloadStatus, TleDownloadIssue } from "./tleDownloadStatus";
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
let networkInFlight: Promise<Tle[]> | null = null;
let retryInFlight: Promise<ActiveCatalog | null> | null = null;

class CatalogDownloadError extends Error {
  constructor(readonly issue: TleDownloadIssue, readonly retryAtMs?: number) {
    super(issue.message);
  }
}

/** A deadline independent of fetch's abort behavior, including response body reads on iOS. */
async function bounded<T>(work: Promise<T>, controller: AbortController, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new CatalogDownloadError({ kind: "timeout", message: `CelesTrak timed out after ${ms / 1000}s` }));
        controller.abort();
      }, ms);
    })]);
  } finally { clearTimeout(timer); }
}

function retryDeadline(response: Response, nowMs: number): number | undefined {
  const header = response.headers.get("Retry-After");
  const requested = header === null ? 0 : /^\d+$/.test(header.trim())
    ? nowMs + Number(header) * 1000 : Date.parse(header);
  const minimum = response.status === 403 || response.status === 429
    ? nowMs + TLE_REFRESH_INTERVAL_MS : nowMs + TLE_RETRY_INTERVAL_MS;
  return Number.isFinite(requested) && requested > minimum ? requested : minimum;
}

function fetchActiveCatalog(url: string, nowMs: number): Promise<Tle[]> {
  // Boot, timer refreshes and explicit retries share the same network request.
  if (networkInFlight) return networkInFlight;
  networkInFlight = downloadActiveCatalog(url, nowMs).finally(() => { networkInFlight = null; });
  return networkInFlight;
}

async function downloadActiveCatalog(url: string, nowMs: number): Promise<Tle[]> {
  setTleDownloadStatus({ phase: "loading", url, attemptedAtMs: nowMs, retryAtMs: null, issue: null });
  const controller = new AbortController();
  const response = await bounded(
    fetch(url, { headers: { Accept: "text/plain" }, signal: controller.signal }),
    controller, TLE_CONNECT_TIMEOUT_MS
  );
  if (!response.ok) throw new CatalogDownloadError({
    kind: "http", status: response.status, message: `CelesTrak returned HTTP ${response.status}`
  }, retryDeadline(response, Date.now()));
  const text = await bounded(response.text(), controller, TLE_DOWNLOAD_TIMEOUT_MS);
  let tles: Tle[];
  try { tles = await storeCatalog(url, text, nowMs); }
  catch { throw new CatalogDownloadError({ kind: "invalid", message: "CelesTrak returned no valid satellite elements" }); }
  setTleDownloadStatus({ phase: "ready", url, attemptedAtMs: nowMs, retryAtMs: null, issue: null });
  return tles;
}

function rememberFailure(error: unknown, url: string, nowMs: number): void {
  const retryAtMs = error instanceof CatalogDownloadError && error.retryAtMs !== undefined
    ? error.retryAtMs : nowMs + TLE_RETRY_INTERVAL_MS;
  const issue: TleDownloadIssue = error instanceof CatalogDownloadError ? error.issue : {
    kind: "network", message: error instanceof Error ? error.message : "Network request failed"
  };
  recordFailedAttempt(nowMs, retryAtMs);
  setTleDownloadStatus({ phase: "failed", url, attemptedAtMs: nowMs, retryAtMs, issue });
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
    holdBundledCatalog(bundled.tles, bundled.downloadedAtMs, cache?.attemptedAtMs ?? nowMs, cache?.retryAtMs);
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
  // A deliberate retry may bypass a network failure's short throttle, but
  // must respect a longer server refusal or Retry-After deadline.
  if (cache.retryAtMs !== undefined && cache.retryAtMs > cache.attemptedAtMs + TLE_RETRY_INTERVAL_MS && !mayRetry(cache, nowMs)) return false;
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
 * Fetches a newer catalogue without blocking boot on a still-usable cache.
 * The result is persisted for future launches and the ready notification lets
 * useLiveCatalog adopt it in the running scene too.
 *
 * Failures are noted and swallowed. A refresh nobody asked for must not become
 * an unhandled rejection, and the app it is running behind is working.
 */
function refreshInBackground(url: string, nowMs: number): void {
  if (refreshing) return;
  refreshing = true;
  void fetchActiveCatalog(url, nowMs)
    .catch((error: unknown) => {
      rememberFailure(error, url, nowMs);
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
    // A cooldown must not select an obsolete device cache over newer elements
    // included in an app update, or pretend another request was attempted.
    return isFresh(cache, url, nowMs) ? fromCache(cache) : fallBack(cache, nowMs);
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
    const fallback = await fallBack(cache, nowMs);
    rememberFailure(error, url, nowMs);
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

/** Explicit settings retry: skip network-error backoff, but honor server limits and fresh downloads. */
export function retryActiveCatalog(): Promise<ActiveCatalog | null> {
  if (retryInFlight) return retryInFlight;
  retryInFlight = retryDownload().finally(() => { retryInFlight = null; });
  return retryInFlight;
}

async function retryDownload(): Promise<ActiveCatalog | null> {
  const url = ACTIVE_TLE_URL;
  const nowMs = Date.now();
  const cache = await readCache();
  if (!networkInFlight && cache && !shouldDownload(cache, url, nowMs, true)) {
    const retryAtMs = Math.max(
      isFresh(cache, url, nowMs) ? cache.downloadedAtMs + TLE_REFRESH_INTERVAL_MS : 0,
      cache.retryAtMs ?? 0
    );
    setTleDownloadStatus({ ...tleDownloadStatus(), phase: "waiting", retryAtMs });
    return null;
  }
  try {
    return { tles: await fetchActiveCatalog(url, nowMs), source: "network", downloadedAtMs: nowMs };
  } catch (error) {
    await fallBack(cache, nowMs);
    rememberFailure(error, url, nowMs);
    return null;
  }
}

/**
 * A newer catalogue for a view that is drawing a stale one, or `null` when
 * there is none to be had yet.
 *
 * For the running app, which unlike boot has something on screen and no reason
 * to wait: called on a timer while the elements in use are past
 * `TLE_USABLE_INTERVAL_MS`, and the answer — when there is one — replaces them
 * in place. Successful background and settings downloads also notify the view
 * directly, without waiting for this stale-catalogue timer.
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
    rememberFailure(error, url, nowMs);
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
