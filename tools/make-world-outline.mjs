import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Draws the coastline the ground-track map is drawn on:
 * `src/data/worldOutline.ts`, the world's land as one encoded string.
 *
 *     node tools/make-world-outline.mjs
 *
 * The source is Natural Earth's 110m land layer, which is in the **public
 * domain** — no attribution required, no licence to carry, nothing to break if
 * the project moves. That mattered more than the shape of the coastline: the
 * map is a backdrop about the size of a business card, and at that size the
 * choice between one open dataset and another is invisible, while the choice
 * between "bundled" and "fetched from somebody's tile server" is the difference
 * between a card that works on a phone with no signal and one that does not.
 *
 * It is fetched rather than vendored, and the output is committed, so the app
 * depends on a file in its own repository and this script is only run when
 * somebody wants the coastline redrawn.
 *
 * What it does to the data is three things, all of them about size:
 *
 * 1. **Simplify** (Douglas–Peucker, `TOLERANCE_DEG`). At the card's width one
 *    degree of longitude is about a pixel, so anything finer than a third of a
 *    degree is detail nobody can see, and 5,143 points of coastline become
 *    around a thousand.
 * 2. **Quantise** to a `GRID_PER_DEGREE` grid, which turns floating-point
 *    coordinates into small integers.
 * 3. **Delta-encode** those integers as zig-zag varints in base64url, so a
 *    step along a coast costs one character and a jump costs two.
 *
 * The result is a few kilobytes of string in a TypeScript file, decoded once on
 * first use (`src/data/worldOutline.ts`).
 *
 * No third-party imports on purpose, in keeping with the other generators here.
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";

/**
 * How far a point may be from the line that replaces it, in degrees, before
 * the simplifier has to keep it.
 *
 * The map is drawn about 330 points wide for 360 degrees of longitude, so a
 * degree is a little under a pixel and this is a third of one. Set it much
 * finer and the extra points are spent below the resolution of any phone; set
 * it much coarser and Italy stops having a boot.
 */
const TOLERANCE_DEG = 0.3;

/**
 * The grid coordinates are rounded onto, in steps per degree.
 *
 * Twenty is a twentieth of a degree — about a twentieth of a pixel on the
 * drawn map, and well inside the tolerance above, so quantising costs nothing
 * the simplifier has not already spent. It is what keeps the deltas small
 * enough to be one character each.
 */
const GRID_PER_DEGREE = 20;

/**
 * The smallest ring worth carrying, as the diagonal of its bounding box in
 * degrees.
 *
 * Below this a landmass is a couple of pixels of speckle on the map rather
 * than a shape anybody recognises. The 110m layer is already only the large
 * islands and up, so this drops a handful of them rather than a continent.
 */
const MIN_RING_SPAN_DEG = 1.2;

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, "..", "src", "data", "worldOutline.ts");

/** base64url, which is what a varint's six-bit groups are written in. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

main();

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`${SOURCE_URL}: HTTP ${response.status}`);
  const collection = await response.json();

  const rings = [];
  for (const feature of collection.features) {
    for (const ring of ringsOf(feature.geometry)) {
      const simplified = simplify(ring, TOLERANCE_DEG);
      if (simplified.length < 4) continue;
      if (spanOf(simplified) < MIN_RING_SPAN_DEG) continue;
      rings.push(simplified);
    }
  }

  const before = collection.features
    .flatMap((feature) => ringsOf(feature.geometry))
    .reduce((total, ring) => total + ring.length, 0);
  const after = rings.reduce((total, ring) => total + ring.length, 0);

  const encoded = rings.map(encodeRing).join("!");
  writeFileSync(OUT_PATH, source(encoded, { rings: rings.length, before, after }));
  console.log(
    `${OUT_PATH}: ${rings.length} rings, ${before} points -> ${after}, ` +
      `${(encoded.length / 1024).toFixed(1)} kB encoded`
  );
}

/** Every outer and inner ring of a GeoJSON polygon or multipolygon. */
function ringsOf(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flat();
}

/** The diagonal of a ring's bounding box, in degrees. */
function spanOf(ring) {
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
}

/**
 * Douglas–Peucker, iteratively so a long coastline cannot overflow the stack.
 *
 * Planar, in degrees, which is the projection the map is drawn in anyway: the
 * simplification and the drawing then agree about what is straight, which is
 * the only property that matters here.
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    let worst = -1;
    let worstAt = -1;
    for (let index = from + 1; index < to; index += 1) {
      const distance = perpendicular(points[index], points[from], points[to]);
      if (distance > worst) {
        worst = distance;
        worstAt = index;
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([from, worstAt], [worstAt, to]);
    }
  }

  return points.filter((_point, index) => keep[index] === 1);
}

/** Distance from `point` to the segment `from`–`to`, in degrees. */
function perpendicular(point, from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point[0] - from[0], point[1] - from[1]);
  const along = Math.max(
    0,
    Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / length)
  );
  return Math.hypot(point[0] - (from[0] + along * dx), point[1] - (from[1] + along * dy));
}

/**
 * One ring as varints: the first point against the grid's origin, and every
 * point after it against the one before.
 */
function encodeRing(ring) {
  let lon = 0;
  let lat = 0;
  let out = "";
  for (const point of ring) {
    const x = Math.round(point[0] * GRID_PER_DEGREE);
    const y = Math.round(point[1] * GRID_PER_DEGREE);
    out += varint(x - lon) + varint(y - lat);
    lon = x;
    lat = y;
  }
  return out;
}

/**
 * One signed integer, zig-zagged so a small negative step is as cheap as a
 * small positive one, then written five bits at a time with the top bit of
 * each character saying whether another follows.
 */
function varint(value) {
  let remaining = value < 0 ? -value * 2 - 1 : value * 2;
  let out = "";
  for (;;) {
    const group = remaining & 0x1f;
    remaining >>>= 5;
    out += ALPHABET[remaining > 0 ? group | 0x20 : group];
    if (remaining === 0) return out;
  }
}

function source(encoded, stats) {
  return `/**
 * The world's land, as the ground-track map draws it.
 *
 * **Generated — do not edit.** \`node tools/make-world-outline.mjs\` rebuilds it
 * from Natural Earth's 110m land layer, which is in the public domain; that
 * script is where the simplification, the quantisation and the encoding are
 * explained, and it is the only place any of the numbers below come from.
 *
 * ${stats.rings} rings, ${stats.before} source points simplified to ${stats.after},
 * ${(encoded.length / 1024).toFixed(1)} kB of string.
 *
 * Bundled rather than fetched. The map is a backdrop the size of a business
 * card and this is a few kilobytes of it; a tile server would be a network
 * round trip, an attribution and a way for the card to be blank on a phone
 * held up at the sky with no signal.
 */

/** Steps per degree the coordinates below are rounded onto. */
const GRID_PER_DEGREE = ${GRID_PER_DEGREE};

/** base64url, which is what the varints are written in. */
const ALPHABET = ${JSON.stringify(ALPHABET)};

/** One closed ring of coastline: longitude and latitude in degrees, in pairs. */
export type OutlineRing = readonly (readonly [number, number])[];

/**
 * Rings are delta-encoded varints separated by \`!\`. See
 * \`tools/make-world-outline.mjs\`.
 */
const ENCODED =
${wrap(encoded)};

let decoded: readonly OutlineRing[] | null = null;

/**
 * Every ring of coastline, decoded on first use and kept.
 *
 * Lazy because most sessions never open a satellite's card, and eager decoding
 * would spend the work on every launch for a map nobody asked for. Kept because
 * the card is opened again and again, and the second decode would be a hitch
 * on a tap rather than on a launch.
 */
export function worldOutline(): readonly OutlineRing[] {
  if (decoded) return decoded;

  const rings: OutlineRing[] = [];
  for (const chunk of ENCODED.split("!")) {
    const ring: [number, number][] = [];
    let lon = 0;
    let lat = 0;
    let at = 0;
    while (at < chunk.length) {
      let value: number;
      [value, at] = readVarint(chunk, at);
      lon += value;
      [value, at] = readVarint(chunk, at);
      lat += value;
      ring.push([lon / GRID_PER_DEGREE, lat / GRID_PER_DEGREE]);
    }
    rings.push(ring);
  }

  decoded = rings;
  return rings;
}

/** One zig-zag varint from \`at\`, and where the next one starts. */
function readVarint(chunk: string, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    const code = ALPHABET.indexOf(chunk[at]);
    at += 1;
    value |= (code & 0x1f) << shift;
    if ((code & 0x20) === 0) break;
    shift += 5;
  }
  // Zig-zag: the low bit is the sign, so -1 is 1 and 1 is 2.
  return [value & 1 ? -((value + 1) / 2) : value / 2, at];
}
`;
}

/** The encoded string as a run of quoted lines, so the file stays readable. */
function wrap(encoded) {
  const width = 96;
  const lines = [];
  for (let at = 0; at < encoded.length; at += width) {
    lines.push(`  ${JSON.stringify(encoded.slice(at, at + width))}`);
  }
  return lines.join(" +\n");
}
