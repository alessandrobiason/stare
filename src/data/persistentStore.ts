/**
 * The small amount of storage this app keeps between launches, and how it finds
 * it on either platform.
 *
 * Two things are stored: the downloaded TLE catalog with the timestamp that
 * makes its refresh interval real (`tleStore.ts`), and whether the intro has
 * been shown (`src/onboarding/introStore.ts`). They are unrelated, but the
 * question "where does a phone put a few bytes, and where does a browser" has
 * one answer, so it is answered once here.
 *
 * Everything is synchronous. Both readers run before the first frame — the
 * catalog to decide whether to download, the intro flag to decide which screen
 * the app opens on — and an asynchronous read means opening on a screen that is
 * replaced a moment later.
 */

/** The handful of operations a cache needs from whatever storage exists. */
export type PersistentStore = {
  read(): string | null;
  write(contents: string): void;
  remove(): void;
};

/** Where the device's files go: one directory, one file per thing stored. */
const FILE_DIRECTORY = "stare";

/**
 * Web storage. Tried first because its presence is a reliable signal that we
 * are in a browser, which keeps this module from having to ask React Native
 * what platform it is on.
 */
function browserStore(key: string): PersistentStore | null {
  let storage: Storage;
  try {
    if (typeof localStorage === "undefined") return null;
    storage = localStorage;
  } catch {
    // Access itself throws when site data is blocked.
    return null;
  }

  return {
    read: () => storage.getItem(key),
    write: (contents) => storage.setItem(key, contents),
    remove: () => storage.removeItem(key)
  };
}

/**
 * A file in the app's document directory, on the device.
 *
 * The document directory rather than the cache directory: iOS evicts the latter
 * whenever it is short of space, which would silently reset the catalog's
 * refresh interval and show a returning user the intro again. And a file rather
 * than a key-value store, because the active catalog runs to a couple of
 * megabytes.
 */
function deviceFileStore(fileName: string): PersistentStore | null {
  try {
    // Required lazily: on web this branch is never reached, and the module is
    // a native one that a browser bundle should not have to resolve.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory, File, Paths } = require("expo-file-system") as typeof import("expo-file-system");

    const openFile = () => {
      const directory = new Directory(Paths.document, FILE_DIRECTORY);
      directory.create({ intermediates: true, idempotent: true });
      return new File(directory, fileName);
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

/** One stored thing: where it lives on each platform, and a seam for tests. */
export type StoreHandle = {
  /** The store, or `null` where neither backing exists. Detected once. */
  get(): PersistentStore | null;
  /** Swaps the backing store. Pass `undefined` to restore detection. */
  setForTesting(next: PersistentStore | null | undefined): void;
};

/**
 * Declares a stored thing, without touching storage: detection is deferred to
 * the first read, so importing a module does not go near the file system.
 */
export function persistentStore(options: {
  /** File name in the app's document directory, on the device. */
  fileName: string;
  /** The `localStorage` key, in a browser. */
  storageKey: string;
}): StoreHandle {
  let detected: PersistentStore | null | undefined;
  let override: PersistentStore | null | undefined;

  return {
    get: () => {
      if (override !== undefined) return override;
      if (detected === undefined) {
        detected = browserStore(options.storageKey) ?? deviceFileStore(options.fileName);
      }
      return detected;
    },
    setForTesting: (next) => {
      override = next;
    }
  };
}
