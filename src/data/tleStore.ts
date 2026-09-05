/**
 * Where the downloaded TLE catalog lives between runs of the app.
 *
 * The timestamp stored alongside it is the whole point. CelesTrak asks that the
 * active catalog be pulled no more than once every couple of hours, and a
 * refresh interval that the app forgets when it closes is not an interval at
 * all — every cold start would be a fresh download, which is exactly what gets
 * a client blocked.
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

/** The handful of operations the cache needs from whatever storage exists. */
export type PersistentStore = {
  read(): string | null;
  write(contents: string): void;
  remove(): void;
};

const FILE_DIRECTORY = "stare";
const FILE_NAME = "active-tles.json";
/** Also the `localStorage` key on web. */
const STORAGE_KEY = "stare.active-tles";

/**
 * Web storage. Tried first because its presence is a reliable signal that we
 * are in a browser, which keeps this module from having to ask React Native
 * what platform it is on.
 */
function browserStore(): PersistentStore | null {
  let storage: Storage;
  try {
    if (typeof localStorage === "undefined") return null;
    storage = localStorage;
  } catch {
    // Access itself throws when site data is blocked.
    return null;
  }

  return {
    read: () => storage.getItem(STORAGE_KEY),
    write: (contents) => storage.setItem(STORAGE_KEY, contents),
    remove: () => storage.removeItem(STORAGE_KEY)
  };
}

/**
 * A file in the app's document directory, on the device.
 *
 * The document directory rather than the cache directory: iOS evicts the latter
 * whenever it is short of space, which would silently reset the refresh
 * interval and put the app straight back to downloading on every launch. And a
 * file rather than a key-value store, because the active catalog runs to a
 * couple of megabytes.
 */
function deviceFileStore(): PersistentStore | null {
  try {
    // Required lazily: on web this branch is never reached, and the module is
    // a native one that a browser bundle should not have to resolve.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory, File, Paths } = require("expo-file-system") as typeof import("expo-file-system");

    const openFile = () => {
      const directory = new Directory(Paths.document, FILE_DIRECTORY);
      directory.create({ intermediates: true, idempotent: true });
      return new File(directory, FILE_NAME);
    };

    // Resolve the directory once up front so a broken or unavailable module
    // fails here, where we can fall through, rather than on first use.
    openFile();

    return {
      read: () => {
        const file = openFile();
        return file.exists ? file.textSync() : null;
      },
      write: (contents) => {
        const file = openFile();
        if (!file.exists) file.create({ intermediates: true });
        file.write(contents);
      },
      remove: () => {
        const file = openFile();
        if (file.exists) file.delete();
      }
    };
  } catch {
    return null;
  }
}

let detected: PersistentStore | null | undefined;
let override: PersistentStore | null | undefined;

function store(): PersistentStore | null {
  if (override !== undefined) return override;
  if (detected === undefined) detected = browserStore() ?? deviceFileStore();
  return detected;
}

/** Test seam: swaps the backing store. Pass `undefined` to restore detection. */
export function setPersistentStoreForTesting(next: PersistentStore | null | undefined): void {
  override = next;
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
    const raw = store()?.read();
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
    store()?.write(JSON.stringify(stored));
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
    store()?.remove();
  } catch {
    // Nothing to do; the entry is unreachable either way.
  }
}
