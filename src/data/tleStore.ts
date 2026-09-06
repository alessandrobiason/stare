import { PersistentStore, persistentStore } from "./persistentStore";

/**
 * Where the downloaded TLE catalog lives between runs of the app.
 *
 * The timestamp stored alongside it is the whole point. CelesTrak asks that the
 * active catalog be pulled no more than once every couple of hours, and a
 * refresh interval that the app forgets when it closes is not an interval at
 * all — every cold start would be a fresh download, which is exactly what gets
 * a client blocked.
 *
 * Where a phone and a browser each put it is `persistentStore.ts`, which is
 * shared with the intro flag; what is written and how a bad entry is handled is
 * here.
 */

export type StoredCatalog = {
  /** `Date.now()` at the moment the download completed. */
  downloadedAtMs: number;
  /** `Date.now()` of the last attempt, successful or not. Throttles retries. */
  attemptedAtMs: number;
  /** The URL it came from, so changing the source invalidates the cache. */
  url: string;
  /** The raw TLE text, exactly as served. */
  catalog: string;
};

export type { PersistentStore };

const store = persistentStore({
  fileName: "active-tles.json",
  storageKey: "stare.active-tles"
});

/** Test seam: swaps the backing store. Pass `undefined` to restore detection. */
export function setPersistentStoreForTesting(next: PersistentStore | null | undefined): void {
  store.setForTesting(next);
}

function isStoredCatalog(value: unknown): value is StoredCatalog {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredCatalog>;
  return (
    typeof candidate.downloadedAtMs === "number" &&
    typeof candidate.attemptedAtMs === "number" &&
    typeof candidate.url === "string" &&
    typeof candidate.catalog === "string" &&
    candidate.catalog.length > 0
  );
}

/**
 * Reads the stored catalog, or `null` if there is none.
 *
 * Every failure — no file, unreadable storage, a half-written entry left by a
 * crash mid-save — is a cache miss rather than an error. A corrupt cache must
 * never leave the app worse off than an empty one.
 */
export function readStoredCatalog(): StoredCatalog | null {
  try {
    const raw = store.get()?.read();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredCatalog(parsed) ? parsed : null;
  } catch (error) {
    console.warn("Could not read the cached TLE catalog", error);
    return null;
  }
}

/**
 * Best effort, and deliberately so: a catalog that downloaded fine must not be
 * lost because the device is out of space.
 */
export function writeStoredCatalog(stored: StoredCatalog): void {
  try {
    store.get()?.write(JSON.stringify(stored));
  } catch (error) {
    console.warn("Could not cache the TLE catalog", error);
  }
}

/**
 * Records that a download was attempted, leaving the catalog itself alone.
 * Keeps a failing or rate-limited CelesTrak from being retried on every launch.
 */
export function touchStoredAttempt(attemptedAtMs: number): void {
  const stored = readStoredCatalog();
  if (!stored) return;
  writeStoredCatalog({ ...stored, attemptedAtMs });
}

/** Test seam, and the way to force a refresh. */
export function clearStoredCatalog(): void {
  try {
    store.get()?.remove();
  } catch {
    // Nothing to do; the entry is unreachable either way.
  }
}
