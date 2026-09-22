import {
  TLE_REFRESH_INTERVAL_MS,
  TLE_RETRY_INTERVAL_MS,
  TLE_USABLE_INTERVAL_MS
} from "../constants";
import { Tle } from "../types";
import { parseCatalogInSlices } from "./tleCatalog";
import {
  clearStoredCatalog,
  readStoredCatalog,
  touchStoredAttempt,
  writeStoredCatalog
} from "./tleStore";

/**
 * The cached catalog and what is known about how it got here.
 */
export type CachedCatalog = {
  tles: Tle[];
  /** When the catalog was downloaded. */
  downloadedAtMs: number;
  /** When a download was last attempted, successfully or not. */
  attemptedAtMs: number;
  /** The URL it came from. */
  url: string;
  /** Size of the raw catalog text as stored, in bytes. */
  sizeBytes: number;
};

/**
 * Two-level cache for the downloaded catalog: a parsed copy for the lifetime of
 * the process, and a file on the device behind it.
 *
 * The in-memory level is not just a speed-up. Parsing the active catalog is
 * tens of thousands of records, so re-reading it from disk on every call would
 * be felt; but the persistent level is the one that matters, because it is what
 * carries the refresh interval across a restart.
 *
 * Both parses are sliced (`parseCatalogInSlices`), which is why the two entry
 * points below are async for work that touches no network: this runs during
 * boot, under an animating boot screen that draws from the same thread.
 */
let memory: CachedCatalog | null = null;

/**
 * The best catalog available without going to the network, or `null`.
 *
 * Falls through to the persisted copy and promotes it into memory, so the
 * parse happens at most once per process.
 */
export async function readCache(): Promise<CachedCatalog | null> {
  if (memory) return memory;

  const stored = readStoredCatalog();
  if (!stored) return null;

  const tles = await parseCatalogInSlices(stored.catalog);
  // A stored catalog that no longer parses into anything is not worth keeping;
  // treat it as absent so the next download replaces it.
  if (tles.length === 0) return null;

  memory = {
    tles,
    downloadedAtMs: stored.downloadedAtMs,
    attemptedAtMs: stored.attemptedAtMs,
    url: stored.url,
    sizeBytes: stored.catalog.length
  };
  return memory;
}

/**
 * The in-memory cache as it stands, without going near the disk or a parse.
 *
 * For the debug panel, which samples on its own timer and must not itself be
 * the reason a slice of parsing runs: by the time anything is on screen, boot
 * has already resolved the catalog through `readCache` or `storeCatalog`, so
 * this is `null` only in the boot sequence's own testing seams.
 */
export function cachedCatalog(): CachedCatalog | null {
  return memory;
}

/**
 * Whether `cache` may still be served without asking CelesTrak again.
 *
 * A cache from a different URL is never fresh — pointing the app at the mock
 * server, or at a different CelesTrak group, should take effect at once. Nor is
 * one stamped in the future, which means the device clock moved and the
 * interval can no longer be trusted.
 */
export function isFresh(cache: CachedCatalog, url: string, nowMs: number): boolean {
  if (cache.url !== url) return false;
  const age = nowMs - cache.downloadedAtMs;
  return age >= 0 && age < TLE_REFRESH_INTERVAL_MS;
}

/**
 * Whether `cache` is good enough to open the app on while a fresh one is
 * fetched behind it.
 *
 * A wider window than `isFresh` and a different question. That one asks
 * whether CelesTrak may be left alone; this asks whether these elements would
 * put a marker anywhere a person could tell apart from where the new ones
 * would — and for the better part of a day the answer is no. See
 * `TLE_USABLE_INTERVAL_MS`.
 *
 * The same two guards as `isFresh`, for the same reasons: a cache from a
 * different URL is a different catalogue, and one stamped in the future means
 * the device clock moved and no interval can be trusted against it.
 */
export function isUsable(cache: CachedCatalog, url: string, nowMs: number): boolean {
  if (cache.url !== url) return false;
  const age = nowMs - cache.downloadedAtMs;
  return age >= 0 && age < TLE_USABLE_INTERVAL_MS;
}

/**
 * Whether enough time has passed since the last failed attempt to try again.
 * Only consulted once the catalog itself is known to be stale.
 */
export function mayRetry(cache: CachedCatalog, nowMs: number): boolean {
  const sinceAttempt = nowMs - cache.attemptedAtMs;
  return sinceAttempt < 0 || sinceAttempt >= TLE_RETRY_INTERVAL_MS;
}

/** Records a fresh download at both levels and returns the parsed catalog. */
export async function storeCatalog(
  url: string,
  rawCatalog: string,
  nowMs: number
): Promise<Tle[]> {
  const tles = await parseCatalogInSlices(rawCatalog);
  if (tles.length === 0) throw new Error("TLE download returned no satellites");

  memory = { tles, downloadedAtMs: nowMs, attemptedAtMs: nowMs, url, sizeBytes: rawCatalog.length };
  // Persisting comes second and never throws: a storage failure must not cost
  // us a catalog that downloaded perfectly well.
  writeStoredCatalog({ downloadedAtMs: nowMs, attemptedAtMs: nowMs, url, catalog: rawCatalog });
  return tles;
}

/**
 * What `CachedCatalog.url` says for the catalogue the app shipped with, which
 * came from no URL this device asked. Never equal to a real one, so it is never
 * `isFresh` or `isUsable` and every launch that holds it still asks CelesTrak —
 * subject to `mayRetry`, which is the point of holding it here at all.
 */
export const BUNDLED_CATALOG_URL = "bundled";

/**
 * Serves the shipped catalogue from memory, as though it had been downloaded
 * when it was, with the attempt that failed to replace it stamped `nowMs`.
 *
 * Memory only. Written to disk it would be two and a half megabytes of a file
 * the app already has, and it would take the place of a cache that — however
 * old — is at least this device's own.
 *
 * Held rather than handed back loose because of the retry throttle: that is
 * `attemptedAtMs` on the cache, and with no cache on disk there would be
 * nothing to hang it on, so a view that keeps asking for fresh elements would
 * ask CelesTrak every time it did.
 */
export function holdBundledCatalog(tles: Tle[], downloadedAtMs: number, nowMs: number): void {
  memory = {
    tles,
    downloadedAtMs,
    attemptedAtMs: nowMs,
    url: BUNDLED_CATALOG_URL,
    sizeBytes: 0
  };
}

/**
 * Whether elements downloaded at `downloadedAtMs` are old enough to say so on
 * screen: past `TLE_USABLE_INTERVAL_MS`, the age the app would rather block on
 * a download than open on. Elements stamped in the future are not called
 * stale — the clock moved, and nothing about their age can be told.
 */
export function isStale(downloadedAtMs: number, nowMs: number): boolean {
  return nowMs - downloadedAtMs >= TLE_USABLE_INTERVAL_MS;
}

/** Notes a failed attempt, so the retry interval starts running. */
export function recordFailedAttempt(nowMs: number): void {
  if (memory) memory = { ...memory, attemptedAtMs: nowMs };
  touchStoredAttempt(nowMs);
}

/** Test seam, and the way to force the next call to re-download. */
export function clearTleCache(): void {
  memory = null;
  clearStoredCatalog();
}
