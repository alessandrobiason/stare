import { TLE_REFRESH_INTERVAL_MS, TLE_RETRY_INTERVAL_MS } from "../constants";
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
