import { Tle } from "../types";
import { SAMPLE_TLE } from "./sampleTle";
import {
  CachedCatalog,
  isFresh,
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

async function fetchActiveCatalog(url: string, nowMs: number): Promise<Tle[]> {
  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!response.ok) throw new Error(`TLE download failed (${response.status})`);
  return await storeCatalog(url, await response.text(), nowMs);
}

/** Where the catalog in hand came from. */
export type CatalogSource = "network" | "cache" | "bundled";

export type ActiveCatalog = {
  tles: Tle[];
  source: CatalogSource;
};

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

async function resolveActiveCatalog(
  url: string,
  nowMs: number,
  force: boolean
): Promise<ActiveCatalog> {
  const cache = await readCache();

  // A cache still inside the refresh window is the answer. Not a fallback, not
  // a head start on a download — the request is simply not made.
  if (cache && !shouldDownload(cache, url, nowMs, force)) {
    return { tles: cache.tles, source: "cache" };
  }

  try {
    return { tles: await fetchActiveCatalog(url, nowMs), source: "network" };
  } catch (error) {
    recordFailedAttempt(nowMs);

    if (cache) {
      // Stale elements degrade gracefully — positions drift over days, they do
      // not become nonsense — so an old catalog beats no catalog by a wide
      // margin.
      console.warn("TLE download failed; serving the cached catalog", error);
      return { tles: cache.tles, source: "cache" };
    }

    console.warn("TLE download unavailable; using bundled fallback", error);
    return { tles: [SAMPLE_TLE], source: "bundled" };
  }
}

/**
 * Returns the active satellite catalog, degrading in this order:
 * cached-and-fresh -> network -> cached-but-stale -> the single bundled TLE.
 *
 * It never rejects. `source` says how far down that list it had to go, so the
 * caller can decide what to make of it: a single bundled satellite keeps the
 * app renderable but is not a sky, and boot treats it as a failure worth
 * telling the user about rather than quietly showing one dot.
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

export { parseCatalogInSlices, parseTleCatalog } from "./tleCatalog";
export { classifySatellite } from "../satellite/categories";
export { clearTleCache } from "./tleCache";
