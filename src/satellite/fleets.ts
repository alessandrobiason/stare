/**
 * What to call the fleet a satellite belongs to, for the breakdown behind the
 * marker count.
 *
 * The count in the corner says how many marks are on the sky; this says what
 * they are. "Twelve" is a number, and "eight Starlink, one ISS, three others"
 * is an answer — and it is the answer to the question anyone asks second,
 * having asked what the number is first.
 *
 * **Proper nouns only.** A fleet is listed here when it has a name someone
 * could repeat: Starlink, Iridium, the ISS. It is deliberately *not* listed
 * when the only honest description of it is a phrase — "Russian military
 * comms", "a cubesat" — because this panel is translated into twelve languages
 * and a row of untranslated English in the middle of an Italian list is worse
 * than no row at all. Everything unnamed falls into the residual, which the
 * panel labels in the reader's own language (`scene.breakdown.other`).
 *
 * The naming conventions are the same ones `briefing.ts` matches a paragraph
 * with, and the two tables are kept in the same order for that reason. They are
 * separate because they answer different questions at different granularities:
 * a card can say "an Earth-observation satellite the catalogue does not
 * classify" and be useful, and a one-word row in a list cannot.
 */

/** A naming convention, and the name of the fleet answering to it. */
type Fleet = {
  /** Tested against the upper-cased catalogue name. First match wins. */
  match: RegExp;
  /**
   * What the row says. Not translated, and not translatable: these are the
   * names their operators gave them, and there is no Italian for "Starlink".
   */
  name: string;
};

/**
 * The fleets, in the order they are tried.
 *
 * Ordered rather than keyed, because catalogue names overlap — `SES-` is a
 * fleet and `SENTINEL` is another — and the first match wins. The landmarks
 * come first and match whole names: they arrive here already carrying the name
 * the overlay labels them with (`displayName`), and each of them is one object
 * rather than a fleet, so a row of its own is the whole point of it.
 */
const FLEETS: readonly Fleet[] = [
  // ---- The landmarks, one object each, by the name the overlay gives them.
  { match: /^ISS$/, name: "ISS" },
  { match: /^TIANGONG$/, name: "Tiangong" },
  { match: /^HUBBLE$/, name: "Hubble" },
  { match: /^CHANDRA$/, name: "Chandra" },
  { match: /^XMM-NEWTON$/, name: "XMM-Newton" },
  { match: /^SWIFT$/, name: "Swift" },
  { match: /^NUSTAR$/, name: "NuSTAR" },
  { match: /^HUIYAN$/, name: "Huiyan" },
  { match: /^CHEOPS$/, name: "CHEOPS" },
  { match: /^IXPE$/, name: "IXPE" },
  { match: /^EINSTEIN PROBE$/, name: "Einstein Probe" },
  { match: /^SVOM$/, name: "SVOM" },

  // ---- Visiting vehicles, which share the station's patch of sky.
  { match: /^SOYUZ-MS/, name: "Soyuz" },
  { match: /^PROGRESS-MS/, name: "Progress" },
  { match: /^(CREW DRAGON|CARGO DRAGON|DRAGON)/, name: "Dragon" },
  { match: /^CYGNUS/, name: "Cygnus" },
  { match: /^STARLINER/, name: "Starliner" },
  { match: /^SHENZHOU/, name: "Shenzhou" },
  { match: /^TIANZHOU/, name: "Tianzhou" },

  // ---- Navigation.
  { match: /GPS|NAVSTAR/, name: "GPS" },
  { match: /GALILEO/, name: "Galileo" },
  { match: /GLONASS/, name: "GLONASS" },
  { match: /BEIDOU/, name: "BeiDou" },
  { match: /QZSS|MICHIBIKI/, name: "QZSS" },
  { match: /IRNSS|NAVIC/, name: "NavIC" },
  { match: /CENTISPACE/, name: "CentiSpace" },

  // ---- Communications. The internet constellations first: on most skies they
  // are most of the markers, and Starlink alone is a good half of the catalogue.
  { match: /^STARLINK/, name: "Starlink" },
  { match: /^ONEWEB/, name: "OneWeb" },
  { match: /KUIPER/, name: "Kuiper" },
  { match: /QIANFAN|SPACESAIL/, name: "Qianfan" },
  { match: /GUOWANG|HULIANWANG/, name: "Guowang" },
  { match: /^IRIDIUM/, name: "Iridium" },
  { match: /GLOBALSTAR/, name: "Globalstar" },
  { match: /ORBCOMM/, name: "Orbcomm" },
  { match: /^(SES-|O3B|ASTRA \d)/, name: "SES" },
  { match: /^(INTELSAT|GALAXY)/, name: "Intelsat" },
  { match: /^(EUTELSAT|HOTBIRD)/, name: "Eutelsat" },
  { match: /^(VIASAT|INMARSAT)/, name: "Viasat" },
  { match: /^(ECHOSTAR|DIRECTV)/, name: "EchoStar" },
  { match: /^(TELESAT|LIGHTSPEED)/, name: "Telesat" },
  { match: /^(SPACEMOBILE|BLUEBIRD|BW3)/, name: "AST SpaceMobile" },
  { match: /^LYNK/, name: "Lynk" },
  { match: /^KINEIS/, name: "Kinéis" },
  { match: /^ASTROCAST/, name: "Astrocast" },
  { match: /^(SWARM|SPACEBEE)/, name: "SpaceBEE" },
  { match: /^GONETS/, name: "Gonets" },
  { match: /^YAMAL/, name: "Yamal" },
  { match: /^EXPRESS-/, name: "Ekspress" },
  { match: /^(CHINASAT|ZHONGXING)/, name: "ChinaSat" },
  { match: /^APSTAR/, name: "APStar" },
  { match: /^TIANLIAN/, name: "Tianlian" },
  { match: /^TIANQI/, name: "Tianqi" },
  { match: /^SKYNET/, name: "Skynet" },
  { match: /^TDRS/, name: "TDRS" },
  { match: /^(GEESAT|GEELY)/, name: "Geespace" },

  // ---- Earth observation.
  { match: /^(FLOCK|DOVE|SKYSAT|PELICAN|TANAGER)/, name: "Planet" },
  { match: /^LEMUR/, name: "Lemur" },
  { match: /^ICEYE/, name: "ICEYE" },
  { match: /^CAPELLA/, name: "Capella" },
  { match: /^UMBRA/, name: "Umbra" },
  { match: /^BLACKSKY/, name: "BlackSky" },
  { match: /^(LEGION|WORLDVIEW|GEOEYE|QUICKBIRD)/, name: "WorldView" },
  { match: /^SENTINEL/, name: "Sentinel" },
  { match: /^(NOAA|JPSS|SUOMI)/, name: "NOAA" },
  { match: /^GOES/, name: "GOES" },
  { match: /^METOP/, name: "MetOp" },
  { match: /^(METEOSAT|MSG-)/, name: "Meteosat" },
  { match: /^LANDSAT/, name: "Landsat" },
  { match: /^(TERRA|AQUA|AURA)\b/, name: "Terra & Aqua" },
  { match: /^FENGYUN/, name: "Fengyun" },
  { match: /^YAOGAN/, name: "Yaogan" },
  { match: /^GAOFEN/, name: "Gaofen" },
  { match: /^JILIN/, name: "Jilin" },
  { match: /^(COSMO-SKYMED|CSG-)/, name: "COSMO-SkyMed" },
  { match: /^PLEIADES/, name: "Pléiades" },
  { match: /^SPOT /, name: "SPOT" },
  { match: /^IRIDE/, name: "Iride" },
  { match: /^(KOMPSAT|ARIRANG)/, name: "KOMPSAT" },
  { match: /^CARTOSAT/, name: "Cartosat" },
  { match: /^QPS-SAR/, name: "QPS-SAR" },
  { match: /^STRIX/, name: "StriX" },
  { match: /^GRUS/, name: "Grus" },
  { match: /^GHGSAT/, name: "GHGSat" },
  { match: /^TOMORROW/, name: "Tomorrow.io" },
  { match: /^(SATELLOGIC|NUSAT|GLOBAL-)/, name: "Satellogic" },
  { match: /^(METEOR-M|RESURS|KANOPUS|ELEKTRO|ARKTIKA)/, name: "Meteor & Resurs" },
  { match: /^COSMOS/, name: "Kosmos" },
  { match: /^CBERS/, name: "CBERS" },
  { match: /^(SHIYAN|SHIJIAN|SJ-)/, name: "Shiyan & Shijian" },

  // ---- Odds and ends with a name of their own.
  { match: /^(LAGEOS|ETALON|STARLETTE|STELLA|AJISAI|LARES)/, name: "Geodetic spheres" },
  { match: /^(AO-|SO-|FO-|CAS-|CAS |OSCAR|JAS-|RS-\d|HO-|LO-)/, name: "OSCAR" }
];

/** Answers already worked out, keyed by catalogue name. See `fleetOf`. */
const memo = new Map<string, string | null>();

/**
 * Which fleet an object belongs to, or `null` for one with no name worth
 * printing.
 *
 * Memoised on the catalogue name, which is what makes this affordable four
 * times a second over every marker on the frame: the answer for one name never
 * changes, and a catalogue turns over a few thousand names in a session against
 * ninety-odd patterns each.
 */
export function fleetOf(name: string): string | null {
  const cached = memo.get(name);
  if (cached !== undefined) return cached;

  const upper = name.toUpperCase();
  let found: string | null = null;
  for (const fleet of FLEETS) {
    if (fleet.match.test(upper)) {
      found = fleet.name;
      break;
    }
  }
  memo.set(name, found);
  return found;
}

/** One line of the breakdown: a fleet, and how many of it are on the frame. */
export type FleetTally = { name: string; count: number };

/**
 * How many rows the breakdown names before it starts lumping.
 *
 * The panel is a pill over a camera picture, and a southward sky can carry
 * thirty different fleets at once. Eight is about what fits over the sky
 * without becoming the thing on screen — and past the eighth the counts are
 * ones and twos, which the residual says just as well.
 */
export const BREAKDOWN_ROWS = 8;

/** The breakdown of a frame: the named fleets, and everything else. */
export type FleetBreakdown = {
  /** Largest first, then alphabetically. Never longer than `BREAKDOWN_ROWS`. */
  rows: readonly FleetTally[];
  /** Markers in no named fleet, plus the ones past the last row. */
  other: number;
};

/**
 * What is on the frame, by fleet.
 *
 * Ties broken by name so the list does not reshuffle itself every quarter
 * second: two fleets of three markers each swap places on nothing but the order
 * they came out of the loop, and a list that reorders under a finger is a list
 * nobody can read.
 */
export function tallyFleets(
  markers: readonly { name: string }[],
  limit = BREAKDOWN_ROWS
): FleetBreakdown {
  const counts = new Map<string, number>();
  let other = 0;

  for (const marker of markers) {
    const fleet = fleetOf(marker.name);
    if (fleet === null) other += 1;
    else counts.set(fleet, (counts.get(fleet) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name));

  for (const tally of ranked.slice(limit)) other += tally.count;
  return { rows: ranked.slice(0, limit), other };
}

/**
 * One string that changes exactly when the breakdown does.
 *
 * The loop tallies four times a second and hands the result up as state; built
 * fresh every time, the array is a new object on every tally and re-renders the
 * scene whether or not anything moved. Comparing this instead means a sky that
 * is not changing costs nothing.
 */
export function breakdownSignature(breakdown: FleetBreakdown): string {
  return `${breakdown.other}|${breakdown.rows.map((row) => `${row.name}:${row.count}`).join(",")}`;
}
