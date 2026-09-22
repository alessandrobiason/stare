import { useEffect, useState } from "react";
import { TLE_STALE_CHECK_INTERVAL_MS } from "../constants";
import { isStale, refreshStaleCatalog } from "../data/tleProvider";
import { SatelliteCatalog } from "../satellite/catalog";
import { watchForeground } from "./watchForeground";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LiveCatalog = {
  /** The catalogue to draw: boot's, until a fresher one replaces it. */
  catalog: SatelliteCatalog;
  /**
   * How many whole days old its elements are, or `null` while they are
   * current. What `CatalogNotice` is drawn from.
   */
  staleDays: number | null;
};

/** Whole days of age, or `null` for elements that are not stale. */
export function staleDaysOf(downloadedAtMs: number, nowMs: number): number | null {
  if (!isStale(downloadedAtMs, nowMs)) return null;
  return Math.max(1, Math.floor((nowMs - downloadedAtMs) / DAY_MS));
}

type Held = { catalog: SatelliteCatalog; downloadedAtMs: number; staleDays: number | null };

/**
 * The catalogue the view draws, kept current while the view is open.
 *
 * Boot hands over whatever it could get, and when CelesTrak could not be
 * reached that is an old cache or the catalogue the app shipped with. This is
 * the half that does not give up at boot: while the elements in hand are stale
 * it keeps asking for new ones (`refreshStaleCatalog`, which is throttled the
 * same way a launch is), and when an answer lands it builds the records and
 * swaps them in — the markers, the passes and the directory all key on the
 * catalogue, so they follow.
 *
 * A catalogue that goes stale while the view is open counts too: a session left
 * running overnight crosses the line on the timer, says so, and asks.
 *
 * State, not a ref, for the same reason as `useCompassAccuracy`: something is
 * drawn from it, and it changes almost never — a day's worth of age at a time,
 * or once when fresh elements arrive.
 */
export function useLiveCatalog(initial: SatelliteCatalog, downloadedAtMs: number): LiveCatalog {
  const [held, setHeld] = useState<Held>(() => ({
    catalog: initial,
    downloadedAtMs,
    staleDays: staleDaysOf(downloadedAtMs, Date.now())
  }));

  useEffect(() => {
    let current = { catalog: initial, downloadedAtMs };
    let cancelled = false;
    let checking = false;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        if (staleDaysOf(current.downloadedAtMs, Date.now()) !== null) {
          const fresher = await refreshStaleCatalog();
          if (!cancelled && fresher && fresher.downloadedAtMs > current.downloadedAtMs) {
            const catalog = await SatelliteCatalog.build(fresher.tles);
            // An answer that holds nothing is not a sky to replace one with.
            if (!cancelled && catalog.size > 0) {
              current = { catalog, downloadedAtMs: fresher.downloadedAtMs };
            }
          }
        }
      } catch (error) {
        console.warn("Could not refresh a stale catalogue", error);
      } finally {
        checking = false;
      }
      if (cancelled) return;
      const staleDays = staleDaysOf(current.downloadedAtMs, Date.now());
      setHeld((previous) =>
        previous.catalog === current.catalog && previous.staleDays === staleDays
          ? previous
          : { ...current, staleDays }
      );
    };

    const timer = setInterval(() => void check(), TLE_STALE_CHECK_INTERVAL_MS);
    // Coming back to the app is when a person is most likely to have moved
    // from no signal into some.
    const stopWatching = watchForeground(() => void check());
    void check();

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopWatching();
    };
  }, [initial, downloadedAtMs]);

  return { catalog: held.catalog, staleDays: held.staleDays };
}
