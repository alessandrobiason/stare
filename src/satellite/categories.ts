/**
 * The satellite taxonomy the filter sorts by, the card names and the marks are
 * coloured by.
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
 * Colour carries the purpose and nothing else (`CATEGORY_COLORS`). Whether an
 * object is parked over the equator is drawn as a shape instead (see
 * `isParked`), because that is a behaviour someone can see rather than a
 * purpose they have to be told, and because five is about the limit of what
 * colour alone can separate.
 */
export const SATELLITE_CATEGORIES = [
  "LANDMARK",
  "NAVIGATION",
  "EARTH",
  "COMMS",
  "OTHER"
] as const;

export type SatelliteCategory = (typeof SATELLITE_CATEGORIES)[number];

/*
 * What the legend calls each category is user-facing text and lives in
 * `src/i18n` with the rest of it (`Strings["filter"]["categories"]`), in words
 * a non-specialist can use, in twelve languages. The names in the union above
 * are keys and are never shown.
 */

/**
 * The colour of a mark, by what the satellite is for: its point, its glow and
 * its tail, on the sky, in the filter and on the card.
 *
 * Pastels, and one set for the whole day. The marks were white for a while,
 * because white on a dark edge reads at both ends of the day and no one fill
 * of the old two ladders did; a pastel is most of the way to white, so it keeps
 * that — light on a night sky, a light centre inside the near-black edge on a
 * daylit one (`palette.ts`) — and spends what is left on a hue. Nothing here is
 * saturated: seventy marks in signal colours over a photograph of the sky read
 * as an instrument panel rather than as lights in it.
 *
 * Set in OKLCH and converted, so the hues are spaced by eye rather than by RGB:
 *
 * - `LANDMARK` champagne, the lightest and warmest, for the couple of dozen
 *   objects worth looking up for — nearest the white they carry a halo and a
 *   name beside.
 * - `NAVIGATION` a coral blush, `EARTH` a sage, `COMMS` a lavender.
 * - `OTHER` a misted slate, the least chroma and the least light, since it is
 *   most of the catalogue and should be the quietest thing on the frame.
 *
 * No two are closer than 0.11 in OKLab, which is as far apart as five colours
 * can get while all staying pastel; every one is over seven to one against a
 * night sky and against the edge it sits in by day.
 */
export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  LANDMARK: "#fbe6af",
  NAVIGATION: "#fba8a0",
  EARTH: "#90e1c5",
  COMMS: "#bfa4f0",
  OTHER: "#92a9b4"
};

/**
 * The wide bloom a mark's glow sits in, by category: the same hue, deeper.
 *
 * What makes a point read as light giving off colour rather than as a dot of
 * paint. A pastel spread thin over a dark sky is a grey haze; the same hue with
 * more chroma, at the bloom's low strength, is a tint of the mark's own colour
 * in the air around it.
 */
export const CATEGORY_BLOOMS: Record<SatelliteCategory, string> = {
  LANDMARK: "#e9c67d",
  NAVIGATION: "#eb827b",
  EARTH: "#52caa5",
  COMMS: "#9d80e7",
  OTHER: "#7598ad"
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
 *
 * Exported because it is not the only list of these objects: `standardMagnitude.ts`
 * records how bright each one is, and a landmark added here without a brightness
 * there is one the card cannot answer "can I see it?" for. The suite holds the
 * two together.
 */
export const LANDMARK_NORAD_IDS = new Set([
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

/**
 * Starlink, which is a filter of its own rather than a category.
 *
 * It is communications and it is coloured as communications, because that is
 * what it is for and the taxonomy above is about purpose. But it is also
 * something no other name in that table is: a single operator holding a good
 * half of the active catalogue, and therefore a good half of the marks on any
 * given sky. Filtered only through `COMMS`, the two useful views are "most of
 * the sky is one constellation" and "no communications satellites at all", and
 * neither of those is the view someone wants when they ask what else is up
 * there.
 *
 * So it gets a switch beside the five, and nothing else about it changes: same
 * colour, same category on the card, same row in the breakdown. `^` anchored
 * because the name is the fleet's — `STARLINK-1007` — and an unanchored test
 * would be a substring match on a catalogue nobody controls the names in. Case
 * insensitive rather than upper-casing the name first: this is asked per
 * satellite per frame, and an anchored test costs nothing where a new string
 * does.
 */
const STARLINK_NAME = /^STARLINK/i;

/** Whether an entry belongs to the constellation the filter singles out. */
export function isStarlink(name: string): boolean {
  return STARLINK_NAME.test(name);
}

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
