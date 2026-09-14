/**
 * The satellite taxonomy the filter sorts by, the card names and the marks are
 * coloured by.
 *
 * `SATELLITE_CATEGORIES` is the single source of truth: the `SatelliteCategory`
 * union, the legend order and the "show all" default are all derived from it,
 * so a new category cannot be added in one place and forgotten in another.
 *
 * The categories answer "what is that, and why would I care?" rather than
 * naming an operator or an orbit. Where one of them is still two quite
 * different things to somebody looking up, it is split once more into
 * subcategories (`SUBCATEGORIES_OF`): each is a switch of its own in the filter
 * and a word on the card, but not a colour of its own — six colours is already
 * about the limit of what pastels alone can keep apart.
 *
 * Communications used to be one category, and it was the one that made no
 * sense: ten thousand Starlinks and the rest of the internet constellations
 * sweeping across low orbit, filed together with the television satellites
 * parked over the equator and the handful of fleets that carry phone calls and
 * sensor messages. So it is two now, by what the service is:
 *
 * - `INTERNET`, the broadband constellations — mostly low orbit, and most of
 *   the marks on any sky. Starlink on its own, being half the catalogue, and
 *   the rest (OneWeb, Kuiper, Qianfan, Guowang, O3b) beside it.
 * - `TELECOM`, the older industry: television and data relayed from the
 *   geostationary belt, and satellite phones and machine messaging (Iridium,
 *   Globalstar, Orbcomm, Inmarsat…) wherever they fly.
 *
 * Earth observation splits the same way, into weather — a few dozen satellites
 * anyone has heard the output of — and the imaging and radar fleets that are
 * most of the category.
 *
 * Colour carries the category and nothing else (`CATEGORY_COLORS`). Whether an
 * object is parked over the equator is drawn as a shape instead (see
 * `isParked`), because that is a behaviour someone can see rather than a
 * purpose they have to be told.
 */
export const SATELLITE_CATEGORIES = [
  "LANDMARK",
  "NAVIGATION",
  "EARTH",
  "INTERNET",
  "TELECOM",
  "OTHER"
] as const;

export type SatelliteCategory = (typeof SATELLITE_CATEGORIES)[number];

/** Every subcategory, in legend order. */
export const SATELLITE_SUBCATEGORIES = [
  "WEATHER",
  "IMAGING",
  "STARLINK",
  "CONSTELLATIONS",
  "BROADCAST",
  "MOBILE"
] as const;

export type SatelliteSubcategory = (typeof SATELLITE_SUBCATEGORIES)[number];

/**
 * Which subcategories a category is split into, in the order the legend lists
 * them. Empty for a category that is one thing already. Every object in a split
 * category belongs to exactly one of its subcategories (`subcategoryOf`).
 */
export const SUBCATEGORIES_OF: Record<SatelliteCategory, readonly SatelliteSubcategory[]> = {
  LANDMARK: [],
  NAVIGATION: [],
  EARTH: ["WEATHER", "IMAGING"],
  INTERNET: ["STARLINK", "CONSTELLATIONS"],
  TELECOM: ["BROADCAST", "MOBILE"],
  OTHER: []
};

/*
 * What the legend calls each category and subcategory is user-facing text and
 * lives in `src/i18n` with the rest of it (`Strings["filter"]`), in words a
 * non-specialist can use, in both languages. The names in the unions above
 * are keys and are never shown.
 */

/**
 * The colour of a mark, by what the satellite is for: its point, its glow and
 * its tail, on the sky, in the filter and on the card.
 *
 * Pastels, and one set for the whole day. The marks were white for a while,
 * because white reads at both ends of the day and no one fill of the old two
 * ladders did; a pastel is most of the way to white, so it keeps that — light
 * on a night sky, a light centre inside a dark edge on a daylit one
 * (`CATEGORY_EDGES`) — and spends what is left on a hue. Nothing here is
 * saturated: seventy marks in signal colours over a photograph of the sky read
 * as an instrument panel rather than as lights in it.
 *
 * Set in OKLCH and converted, so the hues are spaced by eye rather than by RGB:
 *
 * - `LANDMARK` champagne, the lightest and warmest, for the couple of dozen
 *   objects worth looking up for.
 * - `NAVIGATION` a coral blush, `EARTH` a mint sage.
 * - `INTERNET` a lavender, and `TELECOM` a sky blue: the two halves of what was
 *   one category, on either side of the wheel from the warm hues.
 * - `OTHER` a warm stone grey, with next to no chroma and the least light, so
 *   the residual is the quietest thing on the frame.
 *
 * No two are closer than 0.11 in OKLab, which is as far apart as six colours
 * can get while all staying pastel; every one is over seven to one against a
 * night sky.
 */
export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  LANDMARK: "#fbe6af",
  NAVIGATION: "#faa29f",
  EARTH: "#a1e4ae",
  INTERNET: "#c09aeb",
  TELECOM: "#85d0ee",
  OTHER: "#a9a49e"
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
  LANDMARK: "#e6c77c",
  NAVIGATION: "#ea7d76",
  EARTH: "#6bc987",
  INTERNET: "#a573da",
  TELECOM: "#46b2dd",
  OTHER: "#8e8479"
};

/**
 * The edge a mark is drawn inside by day, or over anything bright in the
 * picture: the same hue again, taken most of the way down to dark.
 *
 * Near-black was the obvious edge and it was a heavy one — every mark a
 * sticker with a black outline. The same colour in a deep shade does the same
 * work, since what separates a pale fill from a bright sky is the drop in
 * lightness rather than the absence of hue, and it keeps the mark one object
 * in one colour rather than a coloured centre in a black ring. Every one is at
 * OKLCH lightness 0.36 to 0.40, which is dark enough to hold against cloud.
 */
export const CATEGORY_EDGES: Record<SatelliteCategory, string> = {
  LANDMARK: "#564519",
  NAVIGATION: "#632d2a",
  EARTH: "#255032",
  INTERNET: "#482f62",
  TELECOM: "#09495f",
  OTHER: "#413c38"
};

export function allCategories(): Set<SatelliteCategory> {
  return new Set(SATELLITE_CATEGORIES);
}

export function allSubcategories(): Set<SatelliteSubcategory> {
  return new Set(SATELLITE_SUBCATEGORIES);
}

/** The category a subcategory belongs to. */
export function parentOf(subcategory: SatelliteSubcategory): SatelliteCategory {
  return SATELLITE_CATEGORIES.find((category) =>
    SUBCATEGORIES_OF[category].includes(subcategory)
  )!;
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

/** Weather and climate: the part of Earth observation whose output is on the news every night. */
const WEATHER_NAME =
  /NOAA|METEOR|METOP|FENGYUN|GOES|ELEKTRO|HIMAWARI|ARKTIKA|GEO-KOMPSAT|EWS-G|TOMORROW|DMSP|SUOMI|JPSS|MTG-|MSG-|INSAT-3D|GRACE|ICESAT|SWOT|GHGSAT/;

/**
 * The broadband constellations: internet from space, mostly from low orbit.
 * O3b is the exception, a few thousand kilometres up, and belongs here all the
 * same — what it sells is the internet.
 */
const INTERNET_NAME = /STARLINK|ONEWEB|KUIPER|QIANFAN|HULIANWANG|GUOWANG|TELESAT|O3B/;

/**
 * Satellite phones and machine messaging: small terminals talking straight to
 * the satellite, in low orbit or from the geostationary belt.
 */
const MOBILE_NAME =
  /IRIDIUM|GLOBALSTAR|ORBCOMM|INMARSAT|THURAYA|ASTROCAST|SPACEBEE|KINEIS|GONETS|LYNK|BLUEBIRD|CONNECTA|TIANQI|SKYTERRA|TIANTONG/;

/**
 * Television, data and relays from the geostationary belt: the broadcasters,
 * the telecom operators, the military communications fleets and the relay
 * satellites that carry the space stations' own links.
 */
const BROADCAST_NAME =
  /^SES-|EUTELSAT|INTELSAT|^ASTRA|HOTBIRD|VIASAT|ECHOSTAR|DIRECTV|^YAMAL|^EXPRESS-|CHINASAT|ZHONGXING|APSTAR|ASIASAT|MEASAT|NILESAT|ARABSAT|TURKSAT|HISPASAT|^AMOS-|^BADR|^SKYNET|^WGS|^MUOS|^AEHF|^SICRAL|^SYRACUSE|^GSAT|JCSAT|^OPTUS|^NSS-|^TELSTAR|^GALAXY|^ANIK|^BSAT|SUPERBIRD|KOREASAT|THAICOM|VINASAT|^PALAPA|BELINTERSAT|^ABS-|AZERSPACE|ANGOSAT|NIGCOMSAT|RASCOM|^TDRS|TIANLIAN|^LUCH/;

/**
 * Parked objects nothing else claims but which are plainly not a television
 * service: early-warning and signals-intelligence satellites, experimental
 * series, and the US, Russian and Chinese military payloads catalogued under
 * anonymous series names. Without this they fell through to the parked rule
 * below and were filed as television.
 */
const DEFENCE_NAME = /^USA|SBIRS|^TJS|^COSMOS|^KOSMOS|^DSP|^SHIJIAN/;

/**
 * Starlink, which is a subcategory of its own.
 *
 * It is internet from space and coloured as that, because that is what it is
 * for. But it is also something no other name in that table is: a single
 * operator holding a good half of the active catalogue, and therefore a good
 * half of the marks on any given sky. Filtered only through `INTERNET`, the two
 * useful views are "most of the sky is one constellation" and "no internet
 * satellites at all", and neither is the view someone wants when they ask what
 * else is up there.
 *
 * `^` anchored because the name is the fleet's — `STARLINK-1007` — and an
 * unanchored test would be a substring match on a catalogue nobody controls
 * the names in.
 */
const STARLINK_NAME = /^STARLINK/i;

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
 * television and data, which is what the great majority of the geostationary
 * belt is — once the military series that are not have been set aside.
 */
export function classifySatellite(name: string, line2?: string, line1?: string): SatelliteCategory {
  const idLine = line1 ?? line2;
  if (idLine !== undefined && LANDMARK_NORAD_IDS.has(noradId(idLine))) return "LANDMARK";

  const normalized = name.toUpperCase();
  if (CREWED_VEHICLE_NAME.test(normalized)) return "LANDMARK";
  if (NAVIGATION_NAME.test(normalized)) return "NAVIGATION";
  // Before Earth observation, whose table is loose enough that `SKYTERRA`
  // would be read as `TERRA`.
  if (MOBILE_NAME.test(normalized)) return "TELECOM";
  if (EARTH_NAME.test(normalized) || WEATHER_NAME.test(normalized)) return "EARTH";
  if (INTERNET_NAME.test(normalized)) return "INTERNET";
  if (BROADCAST_NAME.test(normalized)) return "TELECOM";
  if (DEFENCE_NAME.test(normalized)) return "OTHER";
  if (isParked(line2)) return "TELECOM";

  return "OTHER";
}

/**
 * Which subcategory of its category an entry is, or `null` for a category that
 * is not split. Always one of `SUBCATEGORIES_OF[category]` otherwise: each split
 * names one kind outright and takes the rest of the category as the other.
 */
export function subcategoryOf(name: string, category: SatelliteCategory): SatelliteSubcategory | null {
  const normalized = name.toUpperCase();
  switch (category) {
    case "EARTH":
      return WEATHER_NAME.test(normalized) ? "WEATHER" : "IMAGING";
    case "INTERNET":
      return STARLINK_NAME.test(normalized) ? "STARLINK" : "CONSTELLATIONS";
    case "TELECOM":
      return MOBILE_NAME.test(normalized) ? "MOBILE" : "BROADCAST";
    default:
      return null;
  }
}
