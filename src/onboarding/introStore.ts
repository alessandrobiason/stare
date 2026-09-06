import { PersistentStore, persistentStore } from "../data/persistentStore";

/**
 * Whether this phone has been shown the intro, remembered between launches.
 *
 * The whole of what onboarding persists: a single timestamp, written once, read
 * synchronously before the first frame. Read asynchronously it would decide too
 * late — the app would open on the returning screen and then be replaced by an
 * intro, which is the one thing worse than showing the intro twice.
 *
 * A missing, unreadable or nonsense entry means "not yet". Storage that cannot
 * be read is therefore an intro on every launch rather than a phone that never
 * gets told what the app is about to ask for, and the intro is where the
 * permissions are explained.
 */

type StoredIntro = {
  /** `Date.now()` when the last page was accepted. */
  seenAtMs: number;
};

const store = persistentStore({
  fileName: "intro.json",
  storageKey: "stare.intro"
});

/** Test seam: swaps the backing store. Pass `undefined` to restore detection. */
export function setIntroStoreForTesting(next: PersistentStore | null | undefined): void {
  store.setForTesting(next);
}

/** Whether the intro has already been through to its end on this device. */
export function hasSeenIntro(): boolean {
  try {
    const raw = store.get()?.read();
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Partial<StoredIntro>).seenAtMs === "number"
    );
  } catch {
    return false;
  }
}

/**
 * Records that it has. Best effort: someone who has just read the intro should
 * not be held at it because the device is out of space — the cost of a failed
 * write is seeing it again next launch.
 */
export function markIntroSeen(seenAtMs: number = Date.now()): void {
  try {
    store.get()?.write(JSON.stringify({ seenAtMs } satisfies StoredIntro));
  } catch {
    // Nothing to do, and nothing worth saying about it on screen.
  }
}

/** Test seam, and the way to see the intro again. */
export function clearIntroSeen(): void {
  try {
    store.get()?.remove();
  } catch {
    // Unreachable either way.
  }
}
