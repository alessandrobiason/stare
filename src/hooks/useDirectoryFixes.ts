import { MutableRefObject, useEffect, useState } from "react";
import { CatalogEntry } from "../satellite/catalog";
import { DirectoryFix, locateAll } from "../satellite/directory";
import { startSlicing } from "../timeSlice";
import { OrbitEpoch } from "../types";

/**
 * How often a list of rows is worked out again, in milliseconds.
 *
 * What these rows carry is a bearing and a height in whole degrees, and the
 * fastest thing in the catalogue moves about 1.2 degrees a second across the
 * sky. Three seconds is therefore a few degrees of drift at worst on the low
 * passes and none at all on everything higher — under the rounding for most of
 * the list — while a scan of the largest fleet in it costs about fifty
 * milliseconds of arithmetic, which at this cadence is under two per cent of
 * one thread.
 *
 * Faster would not read as more live. A list of names that reorders itself
 * every second is a list nobody can put a finger on, and the thing a row is for
 * — which way to turn — does not change at that rate.
 */
const REFRESH_MS = 3000;

/** What the screen has for a list of objects: the rows, or nothing yet. */
type Scan = {
  /** The list these fixes were worked out for, by identity. */
  of: readonly CatalogEntry[];
  fixes: DirectoryFix[];
};

/**
 * Where a list of catalogue objects is now, kept up to date while it is shown.
 *
 * The catalog tab's one moving part. Everything else on that screen is names
 * and counts read off an index that never changes (`buildDirectory`); this is
 * the arithmetic, and it is spent only on the objects a screen is actually
 * showing — a dozen highlights, a page of search results, or one fleet.
 *
 * `null` means the first scan of this list has not landed yet, which is a real
 * state rather than an empty one: a fleet-sized scan runs in slices so the
 * camera underneath keeps its frames (`locateAll`), and it takes long enough on
 * a phone to be worth a line saying so. It is told apart from "nothing is up"
 * by identity — the fixes are kept beside the list they belong to, so switching
 * groups reports `null` on the render the switch happens on rather than
 * flashing the previous group's rows under the new group's name.
 *
 * From the epoch ref rather than a clock of its own, for the reason every other
 * timer in the app reads it: under the replay harness the sky's clock is the
 * recording's, and a seek moves it by hours.
 */
export function useDirectoryFixes(
  entries: readonly CatalogEntry[],
  epochRef: MutableRefObject<OrbitEpoch>,
  floorDeg?: number
): DirectoryFix[] | null {
  const [scan, setScan] = useState<Scan | null>(null);

  useEffect(() => {
    let dropped = false;
    let scanning = false;

    const run = () => {
      // One scan at a time. A slice-by-slice walk of eight thousand objects can
      // outlast the interval on a slow phone, and two of them interleaved would
      // cost twice the arithmetic to publish the same answer twice.
      if (scanning) return;
      scanning = true;
      const { time, observer } = epochRef.current;
      // Not caught: this is the same SGP4 the frame loop runs sixty times a
      // second, so a throw here is a bug rather than a condition — and one
      // swallowed on a timer is a bug that never surfaces.
      void locateAll(entries, time.getTime(), observer, startSlicing(), floorDeg)
        .then((fixes) => {
          if (!dropped) setScan({ of: entries, fixes });
        })
        .finally(() => {
          scanning = false;
        });
    };

    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      dropped = true;
      clearInterval(timer);
    };
  }, [entries, epochRef, floorDeg]);

  return scan && scan.of === entries ? scan.fixes : null;
}
