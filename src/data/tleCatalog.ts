import {
  classifySatellite,
  displayName,
  isDuplicateEntry,
  isParked
} from "../satellite/categories";
import { startSlicing } from "../timeSlice";
import { Tle } from "../types";

/**
 * CelesTrak's three-line ("TLE") catalog format: a name line followed by
 * element lines 1 and 2.
 *
 * Two ways in, as with `SatelliteCatalog` and for the same reason. The active
 * catalog is a couple of megabytes and tens of thousands of entries, so reading
 * it is tens of milliseconds on a desktop and a fair fraction of a second on a
 * phone — long enough to be seen, because boot does it while the boot sky is
 * turning on the same thread. `parseCatalogInSlices` hands that thread back as
 * it goes; `parseTleCatalog` is the same work in one go.
 */

/** The lines of a catalog, trimmed, with the blank ones dropped. */
function catalogLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The entry starting at `index`, and how far to step past it.
 *
 * Entries that do not match are skipped rather than failing the parse, because
 * the live feed occasionally carries stray lines. `tle` is null for those, and
 * for the entries deliberately dropped.
 */
function entryAt(lines: string[], index: number): { tle: Tle | null; step: number } {
  const [name, line1, line2] = [lines[index], lines[index + 1], lines[index + 2]];
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) return { tle: null, step: 1 };

  // Both space stations are catalogued a module at a time. Kept, they draw
  // several markers and several labels on one coordinate; the entry that
  // stands for the station is the one that survives.
  if (isDuplicateEntry(line1)) return { tle: null, step: 3 };

  return {
    tle: {
      // Renamed here rather than at the marker, so the HUD, the legend and the
      // label all call the same object the same thing.
      name: displayName(name, line1),
      line1,
      line2,
      category: classifySatellite(name, line2, line1),
      parked: isParked(line2)
    },
    step: 3
  };
}

/** Parses the whole catalog now, holding the thread until it is done. */
export function parseTleCatalog(text: string): Tle[] {
  const lines = catalogLines(text);
  const tles: Tle[] = [];

  for (let index = 0; index + 2 < lines.length; ) {
    const { tle, step } = entryAt(lines, index);
    if (tle) tles.push(tle);
    index += step;
  }

  return tles;
}

/**
 * The same parse, in slices, so that whatever is animating over it keeps
 * drawing while it runs. See `src/timeSlice.ts`.
 */
export async function parseCatalogInSlices(text: string): Promise<Tle[]> {
  const lines = catalogLines(text);
  const tles: Tle[] = [];
  const slices = startSlicing();

  for (let index = 0; index + 2 < lines.length; ) {
    const { tle, step } = entryAt(lines, index);
    if (tle) tles.push(tle);
    index += step;
    if (slices.spent()) await slices.handOver();
  }

  return tles;
}
