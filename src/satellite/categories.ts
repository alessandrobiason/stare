/**
 * The satellite taxonomy used for filtering and coloring markers.
 *
 * `SATELLITE_CATEGORIES` is the single source of truth: the `SatelliteCategory`
 * union, the legend order and the "show all" default are all derived from it,
 * so a new category cannot be added in one place and forgotten in another.
 *
 * The categories answer "what is that, and why would I care?" rather than
 * naming an operator or an orbit. That matters because the two are not the
 * same question: an earlier split mixed a brand (Starlink), two purposes
 * (navigation, communications), an orbit (geostationary) and a residual, so
 * the entries were not alternatives to each other — Starlink *is*
 * communications, and a geostationary satellite almost always is too.
 *
 * Colour carries the purpose and nothing else. Whether an object is parked
 * over the equator is drawn as a shape instead (see `isParked`), because that
 * is a behaviour rather than a purpose, and because five is about the limit of
 * what colour alone can separate: searched numerically in OKLab, the best
 * achievable separation between marker colours falls from 0.24 at four to
 * 0.15 at six, and below roughly 0.15 two swatches start to be guessed at.
 */
export const SATELLITE_CATEGORIES = [
  "LANDMARK",
  "NAVIGATION",
  "EARTH",
  "COMMS",
  "OTHER"
] as const;

export type SatelliteCategory = (typeof SATELLITE_CATEGORIES)[number];

/** What the legend calls each category, in words a non-specialist can use. */
export const CATEGORY_LABELS: Record<SatelliteCategory, string> = {
  LANDMARK: "LANDMARKS",
  NAVIGATION: "NAVIGATION",
  EARTH: "EARTH WATCH",
  COMMS: "INTERNET & TV",
  OTHER: "OTHER"
};

/**
 * Marker colours for a night sky, arranged as a descending lightness ladder:
 * white, gold, cyan, violet, slate.
 *
 * Two properties come out of that ordering. The palette still reads when the
 * hues collapse — every pair stays at least 0.116 apart in OKLab under
 * deuteranopia, protanopia and tritanopia alike, which is the best five
 * colours can do — and salience follows rarity rather than fighting it. The
 * two categories at the bottom are together 92% of the catalogue, so they are
 * the quietest things on a night sky; white, the loudest colour available
 * against it, is spent on the couple of dozen objects worth looking up for.
 *
 * None of them can be read against a *daylit* sky: at that end the ladder
 * contrasts between 1.2 and 6.6 to one, and the tier that matters most is the
 * worst of them — white on a bright sky is 1.2. That is a property of any
 * single set of fills rather than of these choices, since a bright sky needs a
 * dark mark and a dark sky needs a bright one, so there is a second set for the
 * other end of the day (`CATEGORY_COLORS_DAYLIGHT`) and a dark outline under
 * every mark in either.
 */
export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  LANDMARK: "#fdfdfd",
  NAVIGATION: "#ffcf5c",
  EARTH: "#5fd0d4",
  COMMS: "#7a71cc",
  OTHER: "#48515c"
};

/**
 * The same five categories against a daylit sky: the ladder inverted, as ink
 * rather than as light.
 *
 * Same hues, so a category is recognisably itself at either end of the day, but
 * the ladder's two ends change places along with the reason for the ordering.
 * Salience on a bright sky is darkness rather than light, so the landmark tier
 * is near-black and reads at 15 to one against it, while the residual 92% is a
 * light slate at 3 to one and stays the quietest thing on the frame; the three
 * purposes in between clear 5 to one. The night ladder scores 1.2 to 6.6 there,
 * and the tier that matters most is its worst.
 *
 * Held to the same separation bar as the night set and searched numerically for
 * it: no two are closer than 0.169 in OKLab, or 0.123 under the three
 * dichromacies, against 0.185 and 0.116 for the night ladder. Read on a night
 * sky these are 1.0 to 5.2 to one — a near-black landmark on a night sky is
 * invisible, which is the mirror of white being invisible at noon, and why
 * which set is drawn is decided from the sun rather than left to a setting.
 */
export const CATEGORY_COLORS_DAYLIGHT: Record<SatelliteCategory, string> = {
  LANDMARK: "#121212",
  NAVIGATION: "#745913",
  EARTH: "#164547",
  COMMS: "#4e1dbc",
  OTHER: "#808790"
};

export function allCategories(): Set<SatelliteCategory> {
  return new Set(SATELLITE_CATEGORIES);
}

/**
 * The permanent landmarks, by catalogue number.
 *
 * Names are the wrong key for these. CelesTrak calls the Hubble Space
 * Telescope `HST` and Chandra `CXO`, so a name test for "HUBBLE" matches
 * neither — it matches `HUBBLE 6` and `HUBBLE 7`, which are unrelated
 * satellites. In the other direction the station module `POISK` carries
 * nothing in its name to tie it to the ISS. There are only a couple of dozen
 * objects in this tier, they outlive their names, and their catalogue numbers
 * do not change, so they are listed.
 */
const LANDMARK_NORAD_IDS = new Set([
  25544, // ISS (ZARYA) — the International Space Station
  48274, // CSS (TIANHE) — the Chinese Space Station
  20580, // HST — Hubble
  25867, // CXO — Chandra
  25989, // XMM-Newton
  28485, // Swift
  38358, // NuSTAR
  42758, // HXMT (Huiyan)
  44874, // CHEOPS
  49954, // IXPE
  58753, // Einstein Probe
  60089 // SVOM
]);

/**
 * What to call a landmark on screen.
 *
 * The catalogue's own names are working identifiers, not names anyone uses:
 * the station is `ISS (ZARYA)` after its first module, Hubble is `HST` and
 * Chandra is `CXO`. These are the only markers that get a label at all, so the
 * label may as well be the name the person holding the phone would recognise.
 */
const LANDMARK_NAMES: Record<number, string> = {
  25544: "ISS",
  48274: "Tiangong",
  20580: "Hubble",
  25867: "Chandra",
  25989: "XMM-Newton",
  28485: "Swift",
  38358: "NuSTAR",
  42758: "Huiyan",
  44874: "CHEOPS",
  49954: "IXPE",
  58753: "Einstein Probe",
  60089: "SVOM"
};

/** The name to show for an entry, which for most of the catalogue is its own. */
export function displayName(name: string, line1?: string): string {
  if (line1 === undefined) return name;
  return LANDMARK_NAMES[noradId(line1)] ?? name;
}

/**
 * Extra catalogue entries for objects already listed above.
 *
 * Both stations are catalogued a module at a time — five entries for the ISS,
 * three for the CSS — and they are one object in one place in the sky. Drawn
 * as catalogued they stack five markers and five labels on a single
 * coordinate. `ISS OBJECT …` entries are shed debris rather than the station,
 * and are simply not landmarks; they fall through to the residual like
 * anything else unrecognised.
 */
const DUPLICATE_NORAD_IDS = new Set([
  25575, // ISS (UNITY)
  26400, // ISS (ZVEZDA)
  26700, // ISS (DESTINY)
  49044, // ISS (NAUKA)
  36086, // POISK
  53239, // CSS (WENTIAN)
  54216 // CSS (MENGTIAN)
]);

/**
 * Crew and cargo vehicles, which are named per mission and so renumbered every
 * few months. A name test is the right tool here for the same reason it is the
 * wrong one above.
 */
const CREWED_VEHICLE_NAME = /^(SHENZHOU|TIANZHOU|SOYUZ-MS|PROGRESS-MS|CREW DRAGON|CARGO DRAGON|DRAGON|CYGNUS|STARLINER)/;

const NAVIGATION_NAME = /GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|QZSS|IRNSS|NAVIC|CENTISPACE/;

/** Imaging, weather and environmental monitoring — anything pointed downwards. */
const EARTH_NAME =
  /YAOGAN|FLOCK|LEMUR|ICEYE|GAOFEN|JILIN|SENTINEL|NOAA|LANDSAT|TERRA|AQUA|SUOMI|METEOR|METOP|SKYSAT|CAPELLA|UMBRA|HAWK|SITRO|GEESAT|IRIDE|TIANMU|PLANET|DOVE|SPOT|PLEIADES|WORLDVIEW|RADARSAT|COSMO-SKYMED|TERRASAR|PAZ|KOMPSAT|CARTOSAT|CBERS|NUSAT|BLACKSKY|ZHUHAI|SHIYAN|YUNHAI|FENGYUN|GOES|ELEKTRO|HIMAWARI|ARKTIKA|TIANHUI|GRUS|GHGSAT|HAIYANG|TOMORROW|GRACE|ICESAT|SWOT|AMAZONIA|RESOURCESAT|OCEANSAT|EROS|FORMOSAT|SUPERVIEW/;

/**
 * Anything that moves bits: the internet constellations, the phone and
 * messaging fleets, and the broadcast satellites parked over the equator.
 * They share a colour because they are one industry; the ring that marks a
 * parked object is what separates the television satellite from the internet
 * one on screen.
 */
const COMMS_NAME =
  /STARLINK|ONEWEB|KUIPER|QIANFAN|HULIANWANG|GUOWANG|TELESAT|IRIDIUM|GLOBALSTAR|ORBCOMM|SES-|O3B|INMARSAT|THURAYA|ASTROCAST|SWARM|KINEIS|GONETS|LYNK|BLUEBIRD|CONNECTA|TIANQI|EUTELSAT|INTELSAT|ASTRA|HOTBIRD|VIASAT|ECHOSTAR|DIRECTV|YAMAL|EXPRESS-|CHINASAT|APSTAR|MEASAT|NILESAT|ARABSAT|TURKSAT|HISPASAT|AMOS-|BADR|SKYNET|WGS|MUOS|SICRAL|SYRACUSE|GSAT|JCSAT|OPTUS|NSS-|TELSTAR|GALAXY|ANIK|BSAT|SUPERBIRD|KOREASAT|THAICOM|VINASAT|PALAPA|BELINTERSAT|ABS-|AZERSPACE|ANGOSAT|NIGCOMSAT|RASCOM/;

/** Mean motion (revolutions per day) occupies columns 53-63 of TLE line 2. */
const MEAN_MOTION_COLUMNS: [number, number] = [52, 63];
/** The catalogue number occupies columns 3-7 of either element line. */
const NORAD_ID_COLUMNS: [number, number] = [2, 7];
/** A geosynchronous orbit completes very close to one revolution per day. */
const GEOSYNCHRONOUS_REVS_PER_DAY: [number, number] = [0.9, 1.1];

export function meanMotionRevsPerDay(line2: string): number {
  return Number.parseFloat(line2.slice(...MEAN_MOTION_COLUMNS));
}

export function noradId(line: string): number {
  return Number.parseInt(line.slice(...NORAD_ID_COLUMNS), 10);
}

/**
 * Whether the object holds station over the equator, and so does not appear to
 * move at all.
 *
 * Drawn as a ring rather than a colour. In one frame of sky a geostationary
 * satellite crosses 0.000 degrees per second against 0.22 to 0.31 for
 * everything in low orbit, and that difference is legible without a legend as
 * soon as the marker's shape says it: the rings sit still while the dots slide
 * past them.
 */
export function isParked(line2?: string): boolean {
  const meanMotion = line2 ? meanMotionRevsPerDay(line2) : Number.NaN;
  const [minimum, maximum] = GEOSYNCHRONOUS_REVS_PER_DAY;
  return meanMotion > minimum && maximum > meanMotion;
}

/** Whether this entry duplicates another already in the catalogue. */
export function isDuplicateEntry(line1?: string): boolean {
  return line1 !== undefined && DUPLICATE_NORAD_IDS.has(noradId(line1));
}

/**
 * Classifies a catalog entry by what it is for, falling back to the residual.
 *
 * Landmarks are matched by catalogue number first, then crew vehicles by name;
 * the rest is name matching, because CelesTrak's "active" catalog carries no
 * purpose field. A parked object that nothing else claimed is treated as
 * communications, which is what the great majority of the geostationary belt
 * is.
 */
export function classifySatellite(name: string, line2?: string, line1?: string): SatelliteCategory {
  const idLine = line1 ?? line2;
  if (idLine !== undefined && LANDMARK_NORAD_IDS.has(noradId(idLine))) return "LANDMARK";

  const normalized = name.toUpperCase();
  if (CREWED_VEHICLE_NAME.test(normalized)) return "LANDMARK";
  if (NAVIGATION_NAME.test(normalized)) return "NAVIGATION";
  if (EARTH_NAME.test(normalized)) return "EARTH";
  if (COMMS_NAME.test(normalized)) return "COMMS";
  if (isParked(line2)) return "COMMS";

  return "OTHER";
}
