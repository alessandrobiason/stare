import { startSlicing } from "../timeSlice";
import { Tle } from "../types";
import { isUsableSatrec, parseTle, SatRec } from "./propagator";
import { SatelliteCategory } from "./categories";

/** One catalog entry, ready to propagate. */
export type CatalogEntry = {
  name: string;
  category: SatelliteCategory;
  parked: boolean;
  satrec: SatRec;
};

/** One TLE as a catalog entry, or `null` where SGP4 cannot make one of it. */
function toEntry(tle: Tle): CatalogEntry | null {
  try {
    const satrec = parseTle(tle);
    // twoline2satrec signals malformed elements through its return value
    // rather than throwing; dropping them here keeps the hot loop simple.
    if (!isUsableSatrec(satrec)) return null;
    return { name: tle.name, category: tle.category, parked: tle.parked, satrec };
  } catch {
    // Unparseable entry: drop it rather than failing the whole catalog.
    return null;
  }
}

/**
 * A parsed TLE catalog that can be re-propagated cheaply.
 *
 * Building the SGP4 records is about twice as expensive as propagating them
 * (~240 ms vs ~100 ms for CelesTrak's 16k-entry active catalog), so parsing
 * them on every tick would put a full sweep out of reach. Parsing once up
 * front and reusing the records is what makes `SkyTracker` affordable.
 *
 * That once is still the longest uninterrupted stretch of JavaScript the app
 * ever runs, and boot runs it while the boot sky is turning over it — a third
 * of a second on a desktop, the better part of a second on a phone, every
 * millisecond of it on the thread those frames are drawn from. So there are two
 * ways in. `build` is the one boot uses: the same work, handing the thread back
 * every few milliseconds so the sky keeps its frames. The constructor is the
 * same work in one go, for callers with nothing on screen to keep smooth.
 */
export class SatelliteCatalog {
  private readonly built: CatalogEntry[] = [];

  /** Builds the whole catalog now, holding the thread until it is done. */
  constructor(tles: readonly Tle[] = []) {
    for (const tle of tles) {
      const entry = toEntry(tle);
      if (entry) this.built.push(entry);
    }
  }

  /**
   * The same catalog, in slices, so that whatever is animating over it keeps
   * drawing while it is built. See `src/timeSlice.ts`.
   */
  static async build(tles: readonly Tle[]): Promise<SatelliteCatalog> {
    const catalog = new SatelliteCatalog();
    const slices = startSlicing();
    for (const tle of tles) {
      const entry = toEntry(tle);
      if (entry) catalog.built.push(entry);
      if (slices.spent()) await slices.handOver();
    }
    return catalog;
  }

  get entries(): readonly CatalogEntry[] {
    return this.built;
  }

  get size(): number {
    return this.built.length;
  }
}
