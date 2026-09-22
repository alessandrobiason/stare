import { Tle } from "../types";
import { parseCatalogInSlices } from "./tleCatalog";

/**
 * The catalogue the app ships with, for when CelesTrak cannot be reached and
 * the phone has nothing newer of its own.
 *
 * A whole catalogue rather than a demonstration satellite. A first launch with
 * no signal, or on a day CelesTrak is down or has blocked the address, used to
 * be a boot screen with a retry button; with this it is the sky, a few days or
 * weeks out of date, and a line over it saying so (`CatalogNotice`). Elements
 * drift a kilometre or so a day in low orbit, which is a lot less wrong than no
 * satellites at all.
 *
 * Refreshed by `npm run bundle-tle` (`tools/bundle-tle.mjs`) before a release,
 * and dated by that download, which is what the notice measures its age from.
 */
export type BundledCatalog = {
  tles: Tle[];
  /** When the shipped elements were downloaded. */
  downloadedAtMs: number;
};

type BundledFile = {
  downloadedAtMs: number;
  catalog: string;
};

/**
 * Required on first use rather than imported, so that the couple of megabytes
 * of text in it are only turned into a module on the launches that fall back
 * on it — which should be few.
 */
const load = (): BundledFile =>
  require("./bundledCatalog.json") as BundledFile;

let parsed: Promise<BundledCatalog | null> | null = null;

async function parse(): Promise<BundledCatalog | null> {
  try {
    const file = load();
    const tles = await parseCatalogInSlices(file.catalog);
    if (tles.length === 0 || !(file.downloadedAtMs > 0)) return null;
    return { tles, downloadedAtMs: file.downloadedAtMs };
  } catch (error) {
    console.warn("The bundled TLE catalogue could not be read", error);
    return null;
  }
}

/**
 * The shipped catalogue, parsed once per process, or `null` if it is missing
 * or holds nothing — which a build should never do, and the caller treats as
 * there being no catalogue at all.
 */
export function readBundledCatalog(): Promise<BundledCatalog | null> {
  parsed ??= parse();
  return parsed;
}

/** Test seam: forgets the parse, so the next read takes the file again. */
export function forgetBundledCatalogForTesting(): void {
  parsed = null;
}
