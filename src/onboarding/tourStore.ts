import { PersistentStore, persistentStore } from "../data/persistentStore";

/**
 * Whether this phone has been through the tour, remembered between launches.
 *
 * A single timestamp, written once, read synchronously when the sky view
 * mounts so the tour is up from its first frame rather than landing on a view
 * someone has already started using.
 *
 * A missing, unreadable or nonsense entry means "not yet": the cost of storage
 * that cannot be read is a tour on every launch, which is skipped in one tap.
 *
 * Its own key rather than the old intro's, so a phone that read the pages the
 * app used to open on is still shown the tour once.
 */

type StoredTour = {
  /** `Date.now()` when the tour was finished or skipped. */
  seenAtMs: number;
};

const store = persistentStore({
  fileName: "tour.json",
  storageKey: "stare.tour"
});

/** Test seam: swaps the backing store. Pass `undefined` to restore detection. */
export function setTourStoreForTesting(next: PersistentStore | null | undefined): void {
  store.setForTesting(next);
}

/** Whether the tour has already been finished or skipped on this device. */
export function hasSeenTour(): boolean {
  try {
    const raw = store.get()?.read();
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Partial<StoredTour>).seenAtMs === "number"
    );
  } catch (error) {
    console.warn("Could not read whether the tour has been seen", error);
    return false;
  }
}

/** Records that it has. Best effort: a failed write is the tour again next launch. */
export function markTourSeen(seenAtMs: number = Date.now()): void {
  try {
    store.get()?.write(JSON.stringify({ seenAtMs } satisfies StoredTour));
  } catch (error) {
    console.warn("Could not record that the tour has been seen", error);
  }
}

/** Test seam, and the way to see the tour on the next launch again. */
export function clearTourSeen(): void {
  try {
    store.get()?.remove();
  } catch {
    // Unreachable either way.
  }
}
