import { MINIMUM_SATELLITE_ELEVATION_DEG } from "../constants";
import {
  azimuthDeg,
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt
} from "../coordinates/transform";
import { wrapDegrees360 } from "../math/angles";
import { Slices } from "../timeSlice";
import { ObserverLocation } from "../types";
import { CatalogEntry, SatelliteCatalog } from "./catalog";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "./categories";
import { fleetOf } from "./fleets";
import { instantOf, propagateIn } from "./propagator";

/**
 * The catalogue as something to look things up in, rather than as something to
 * draw.
 *
 * Everywhere else in `src/satellite/` the question is "what is above the
 * observer, where, and how bright" — asked of the sky and answered per frame.
 * This asks the question the other way round: *the thing I came looking for,
 * where is it*. An object below the horizon has no mark to tap, and most of the
 * catalogue is below the horizon from anywhere at any moment, so nothing the
 * overlay draws can be the way in to it.
 *
 * Two answers, and they need different machinery:
 *
 * - **What is in there**, which is a question about names and costs no
 *   arithmetic at all: sixteen thousand objects sorted into the fleets
 *   `fleets.ts` already recognises, under the six categories the sky is
 *   coloured by. Built once from a catalog and then only read.
 * - **Where each one is**, which is a propagation apiece and is asked only of
 *   the handful of objects a screen is showing — or, when a whole fleet is
 *   opened, of that fleet, in slices, because Starlink is eight thousand of
 *   them and the camera underneath is still drawing frames (`locateAll`).
 *
 * Nothing here decides what is worth looking at. That is `nakedEye.ts` and the
 * card, and an object reached from this module opens the same card its own mark
 * would have.
 */

/**
 * One row of the index: a fleet, and the objects flying under its name.
 *
 * A fleet rather than a category, because a category is six rows and a name is
 * what somebody is actually looking for — "the Galileo satellites", "one of the
 * NOAA ones". The fleets are `fleets.ts`'s, unchanged and for its reasons: they
 * are proper nouns, they are not translated, and everything with no name worth
 * printing falls into a residual the panel labels in the reader's own language.
 *
 * A group of one is an object, and the screen draws it as one rather than as a
 * way in to a list with a single thing in it (`isSingleObject`). Every landmark
 * is its own fleet — `FLEETS` names them individually — so the highlights fall
 * out of this rather than being a second kind of thing beside it.
 */
export type DirectoryGroup = {
  /** Stable across rebuilds, and what an open group is remembered by. */
  id: string;
  /**
   * The fleet's own name, or `null` for the objects the catalogue does not
   * name — which the panel calls what the marker breakdown calls them.
   */
  name: string | null;
  /** What colour its swatch is, and which heading it is listed under. */
  category: SatelliteCategory;
  /** Its members, in catalogue order. Never empty. */
  entries: readonly CatalogEntry[];
};

/** The groups under one heading, in the order the screen lists them. */
export type DirectorySection = {
  category: SatelliteCategory;
  groups: readonly DirectoryGroup[];
};

/**
 * The whole catalogue as an index, in the order it is read.
 *
 * Sections in the legend's own order, so the catalog and the filter sort the
 * sky the same way; groups within a section largest first and then
 * alphabetically, which is `tallyFleets`'s ordering and for the same reason — a
 * list that reshuffles two equal rows on nothing but the order they came out of
 * a loop is a list nobody can find anything in twice. The residual is last
 * wherever it appears, because it is the one row that is not a name.
 *
 * One walk of the catalog and one `fleetOf` per entry, which is memoised: a few
 * milliseconds for sixteen thousand objects, spent when the tab is first opened
 * and then held for as long as the catalog itself lives.
 */
export function buildDirectory(catalog: SatelliteCatalog): DirectorySection[] {
  const groups = new Map<string, { name: string | null; entries: CatalogEntry[] }>();

  for (const entry of catalog.entries) {
    const fleet = fleetOf(entry.name);
    // The residual is one group per category rather than one for the whole
    // catalogue: "everything unnamed" across sixteen thousand objects is not a
    // row anybody would open, and "the unnamed Earth-observation satellites" is.
    const id = fleet ?? `${RESIDUAL_PREFIX}${entry.category}`;
    const group = groups.get(id);
    if (group) group.entries.push(entry);
    else groups.set(id, { name: fleet, entries: [entry] });
  }

  const sections = new Map<SatelliteCategory, DirectoryGroup[]>(
    SATELLITE_CATEGORIES.map((category) => [category, []])
  );
  for (const [id, group] of groups) {
    const category = headingFor(group.entries);
    sections.get(category)!.push({ id, name: group.name, category, entries: group.entries });
  }

  return SATELLITE_CATEGORIES.map((category) => ({
    category,
    groups: sections.get(category)!.sort(byPlaceInList)
  })).filter((section) => section.groups.length > 0);
}

/**
 * Heads a residual group's id.
 *
 * An id has to be unique across the whole index because it is what a group is
 * keyed and remembered by, and the residuals are the only groups with no name
 * to be keyed on. Lower case with a colon in it, which no fleet name is or has
 * — they are proper nouns (`fleets.ts`).
 */
const RESIDUAL_PREFIX = "unnamed:";

/**
 * Which heading a fleet is listed under: the category most of it is in.
 *
 * A fleet is not guaranteed to be one category. `COSMOS` is the Russian
 * catalogue's anonymous series and carries imaging satellites, early-warning
 * satellites and debris under one name; `TERRA & AQUA` is Earth observation
 * outright. Filing a group under the commonest category of its members puts it
 * where somebody would look for it and keeps every member in the one row,
 * which is the half that matters — splitting a fleet across two headings would
 * mean two rows with the same name on them and neither holding all of it.
 *
 * Ties go to the earlier category in the legend's order, which is the one thing
 * about them that is not arbitrary.
 */
function headingFor(entries: readonly CatalogEntry[]): SatelliteCategory {
  const counts = new Map<SatelliteCategory, number>();
  for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);

  let best = entries[0].category;
  let bestCount = 0;
  for (const category of SATELLITE_CATEGORIES) {
    const count = counts.get(category) ?? 0;
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/** Largest first, then alphabetically, with the unnamed residual last. */
function byPlaceInList(one: DirectoryGroup, other: DirectoryGroup): number {
  if ((one.name === null) !== (other.name === null)) return one.name === null ? 1 : -1;
  return other.entries.length - one.entries.length || labelOf(one).localeCompare(labelOf(other));
}

/**
 * The name a group's row will carry, which is what it is alphabetised by.
 *
 * A fleet of one is drawn as the object it is rather than as a list to open
 * (`CatalogScreen`), so what the reader is scanning down is the object's name —
 * `CREW DRAGON 12`, not the `Dragon` it flies under — and sorting by the other
 * one would leave a column of names that is almost, but not quite, in order.
 */
function labelOf(group: DirectoryGroup): string {
  return group.entries.length === 1 ? group.entries[0].name : group.name ?? "";
}

/** Whether this group is one object, and so a row that selects rather than opens. */
export function isSingleObject(group: DirectoryGroup): boolean {
  return group.entries.length === 1;
}

/** What a query found: the fleets it names, and the objects it names. */
export type DirectoryMatch = {
  /** Fleets whose name contains the query, largest first. */
  groups: readonly DirectoryGroup[];
  /** Objects whose catalogue name contains it, best match first, capped. */
  entries: readonly CatalogEntry[];
};

/**
 * What the catalogue has under a name.
 *
 * Both halves are needed and they are different answers. `star` is the Starlink
 * fleet — eight thousand objects nobody wants listed one by one — and it is
 * also `STARLETTE`, a geodetic sphere somebody may have come looking for. So
 * the fleets a query names come back as fleets, and the objects as objects —
 * except a fleet of one, which is an object and comes back as one.
 *
 * A plain case-insensitive substring, because the catalogue's names are
 * identifiers rather than prose: `NOAA 19`, `STARLINK-1234`, `ISS`. What a
 * fuzzier match would buy is a hit on a misspelling, and what it would cost is
 * every short query matching half the catalogue. Names that *start* with the
 * query come first, which is what makes `iss` find the station rather than
 * three hundred objects with those letters somewhere in the middle.
 *
 * Capped, because a list is read rather than counted: past a few dozen rows the
 * answer to a query this loose is "narrow it", and the fleet rows above are how.
 */
export function searchDirectory(
  sections: readonly DirectorySection[],
  query: string,
  limit: number
): DirectoryMatch {
  const wanted = query.trim().toUpperCase();
  if (wanted === "") return { groups: [], entries: [] };

  const groups: DirectoryGroup[] = [];
  /** Objects a fleet name found, which is the strongest match there is. */
  const named: CatalogEntry[] = [];
  const opening: CatalogEntry[] = [];
  const within: CatalogEntry[] = [];

  for (const section of sections) {
    for (const group of section.groups) {
      if (group.name !== null && group.name.toUpperCase().includes(wanted)) {
        // A fleet of one is that object, not a list with one thing in it: a
        // `Hubble · 1 in orbit` row above the Hubble row is a way in to a page
        // that says "0 of 1 above your horizon" and stops.
        if (isSingleObject(group)) named.push(group.entries[0]);
        else groups.push(group);
      }
      for (const entry of group.entries) {
        // Uppercased per test rather than held: the catalogue turns over on
        // its own schedule, and a second copy of sixteen thousand names is a
        // megabyte held for the seconds a search is open.
        const name = entry.name.toUpperCase();
        if (name.startsWith(wanted)) opening.push(entry);
        else if (name.includes(wanted)) within.push(entry);
      }
    }
  }

  // Deduplicated in that order, since a fleet name and its object's name are
  // usually the same word — `Hubble` matches both, and is one row.
  const entries = [...new Set([...named, ...opening, ...within])];
  return { groups: groups.sort(byPlaceInList), entries: entries.slice(0, limit) };
}

/** One object, and where to turn to face it. */
export type DirectoryFix = {
  /** The catalogue's name for it, which is the key its card is opened by. */
  name: string;
  category: SatelliteCategory;
  /** Holds station over the equator, so its swatch is a ring like its mark. */
  parked: boolean;
  /** Compass bearing, in degrees clockwise from north. */
  azimuthDeg: number;
  /** How far up, in degrees. Negative for an object that has not risen. */
  elevationDeg: number;
};

/**
 * The elevation at which this screen calls an object up.
 *
 * The overlay's own floor rather than a true horizon, so the catalog and the
 * sky agree: an object this list says is up has a mark on the picture to go and
 * find, and one it leaves out has none. The two degrees between a geometric
 * horizon and this are a roofline anyway.
 */
export const DIRECTORY_HORIZON_DEG = MINIMUM_SATELLITE_ELEVATION_DEG;

/**
 * Where each of these objects is, at `atMs`, from where the observer stands.
 *
 * One SGP4 propagation and one frame rotation apiece — the same pair the frame
 * loop runs, without any of what it does afterwards, because a row says which
 * way to turn and nothing else. What it costs is therefore set by how many
 * objects it is asked about, and that runs from a dozen (the highlights, or a
 * page of search results) to eight thousand (Starlink), which is why it takes
 * `Slices`: a fleet-sized scan is fifty milliseconds of arithmetic, and this
 * screen is a sheet over a camera that is still drawing.
 *
 * `floorDeg` is what the caller wants back rather than a fact about the sky.
 * A fleet is asked for what is up (`DIRECTORY_HORIZON_DEG`), because the row
 * that matters is the one somebody can go outside and see; the highlights are
 * asked for everything, because "34° below, to the south-east" is the honest
 * answer about a station that has not risen and is better than no row at all.
 *
 * Sidereal time is taken once for the whole scan rather than per object, as
 * `fixesAt` does per frame: the Earth turns a ten-thousandth of a degree in the
 * time the longest of these takes, which is under a pixel of anything.
 *
 * An object SGP4 cannot place is left out rather than reported as unknown. Its
 * elements have expired, which is a fact about the catalogue file rather than
 * about the sky, and the row it would fill would have nothing in it.
 */
export async function locateAll(
  entries: readonly CatalogEntry[],
  atMs: number,
  observer: ObserverLocation,
  slices: Slices,
  floorDeg = -90
): Promise<DirectoryFix[]> {
  const when = new Date(atMs);
  const gmst = gmstAt(when);
  const frame = createObserverFrame(observer);
  // Every object in this scan is placed at the same instant, so it is converted
  // once here rather than per entry — which on the largest fleet is ten
  // thousand conversions of one number. See `Instant`.
  const instant = instantOf(when);
  const fixes: DirectoryFix[] = [];

  for (const entry of entries) {
    const eci = propagateIn(entry.satrec, instant);
    if (eci) {
      const enu = eciToEnuInFrame(eci, gmst, frame);
      const elevation = elevationDeg(enu);
      // Written as a positive test so a non-finite elevation drops the object
      // rather than admitting it, as `fixesAt` does.
      if (elevation >= floorDeg) {
        fixes.push({
          name: entry.name,
          category: entry.category,
          parked: entry.parked,
          // Wrapped, because a bearing is read off a compass rather than
          // signed: due west is 270 degrees, not minus ninety.
          azimuthDeg: wrapDegrees360(azimuthDeg(enu)),
          elevationDeg: elevation
        });
      }
    }
    if (slices.spent()) await slices.handOver();
  }

  // Highest first, which is the order the question is asked in: what is most
  // clearly above me. Ties broken by name so a list of a fleet's worth of
  // identical objects does not reorder itself between two scans.
  return fixes.sort(
    (one, other) => other.elevationDeg - one.elevationDeg || one.name.localeCompare(other.name)
  );
}
