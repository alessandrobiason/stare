import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadFromSource } from "./screenshots/tsModule.mjs";

/**
 * Generate the opaque App Store icon, its SVG master, the boot sky still and
 * the README thumbnail from the app's actual geometry. Run after changing
 * src/components/bootSky.ts: node tools/make-logo.mjs
 * No geometry or animation constants are duplicated in this generator.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { ORBITAL_LOGO: logo, BOOT_SKY_DESIGN, bootSkyScene, bootLogo, starAlpha, STAR_COLOR } =
  await loadFromSource(join(root, "src/components/bootSky.ts"));
const round = (value) => Number(value.toFixed(4));

function markSvg() {
  return logo.paths.map((path) => `    <path d="${path}" fill="${logo.color}"/>`).join("\n") +
    `\n    <circle cx="${logo.dot.x}" cy="${logo.dot.y}" r="${logo.dot.radius}" fill="${logo.accent}"/>`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${logo.size} ${logo.size}">
  <rect width="${logo.size}" height="${logo.size}" fill="${logo.background}"/>
${markSvg()}
</svg>
`;
}

/** The drawn background and mark; BootScreen supplies the live word and bar. */
function extendedSvg() {
  const frame = { width: BOOT_SKY_DESIGN.width * 3, height: BOOT_SKY_DESIGN.height * 3 };
  const { night, stars } = bootSkyScene(frame);
  const placement = bootLogo(frame);
  const { horizon } = night;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">
  <defs>
    <linearGradient id="night" gradientUnits="userSpaceOnUse" x1="0" y1="${night.fromY}" x2="0" y2="${night.toY}">
${night.stops.map((stop) => `      <stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join("\n")}
    </linearGradient>
    <radialGradient id="horizon" gradientUnits="userSpaceOnUse" cx="${horizon.x}" cy="${horizon.y}" r="${horizon.radius}">
      <stop offset="0%" stop-color="${horizon.color}" stop-opacity="${horizon.alpha}"/>
      <stop offset="100%" stop-color="${horizon.color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${frame.width}" height="${frame.height}" fill="url(#night)"/>
  <rect width="${frame.width}" height="${frame.height}" fill="url(#horizon)"/>
  <g id="stars" fill="${STAR_COLOR}">
${stars.map((star) => `    <circle cx="${round(star.x)}" cy="${round(star.y)}" r="${round(star.radius)}" opacity="${round(starAlpha(star, 0))}"/>`).join("\n")}
  </g>
  <g id="orbital-logo" transform="translate(${round(placement.x)} ${round(placement.y)}) scale(${round(placement.scale)})">
${markSvg()}
  </g>
</svg>
`;
}

/** Flatten the master's M/C/Z paths for the small, dependency-free rasteriser. */
function polygonFor(path) {
  const tokens = path.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
  const points = [];
  let current;
  let at = 0;
  const point = () => [Number(tokens[at++]), Number(tokens[at++])];
  while (at < tokens.length) {
    const command = tokens[at++];
    if (command === "M") {
      current = point();
      points.push(current);
    } else if (command === "C") {
      const from = current;
      const first = point();
      const second = point();
      const to = point();
      for (let step = 1; step <= 128; step++) {
        const t = step / 128;
        const u = 1 - t;
        points.push([0, 1].map((axis) =>
          u ** 3 * from[axis] + 3 * u ** 2 * t * first[axis] +
          3 * u * t ** 2 * second[axis] + t ** 3 * to[axis]));
      }
      current = to;
    } else if (command !== "Z") {
      throw new Error(`Unsupported logo path command: ${command}`);
    }
  }
  return points;
}

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Four-by-four subpixels keep both the 1024 master and README thumbnail crisp. */
function iconPng(size) {
  const samples = 4;
  const highSize = size * samples;
  const scale = highSize / logo.size;
  const coverage = new Uint8Array(size * size);
  const polygons = logo.paths.map(polygonFor);
  const dot = Array.from({ length: 512 }, (_, index) => {
    const angle = index / 512 * Math.PI * 2;
    return [logo.dot.x + Math.cos(angle) * logo.dot.radius,
      logo.dot.y + Math.sin(angle) * logo.dot.radius];
  });
  const pixels = Buffer.alloc(size * size * 3);
  const background = rgb(logo.background);
  for (let index = 0; index < pixels.length; index += 3) {
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = background[channel];
  }
  for (const [shapes, color] of [[polygons, logo.color], [[dot], logo.accent]]) {
    coverage.fill(0);
    for (const polygon of shapes) {
      for (let y = 0; y < highSize; y++) {
        const across = (y + 0.5) / scale;
        const intersections = [];
        for (let at = 0; at < polygon.length; at++) {
          const a = polygon[at];
          const b = polygon[(at + 1) % polygon.length];
          if ((a[1] > across) !== (b[1] > across)) {
            intersections.push((a[0] + (across - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) * scale);
          }
        }
        intersections.sort((a, b) => a - b);
        for (let at = 0; at < intersections.length; at += 2) {
          const from = Math.max(0, Math.ceil(intersections[at] - 0.5));
          const to = Math.min(highSize, Math.ceil(intersections[at + 1] - 0.5));
          for (let x = from; x < to; x++) coverage[Math.floor(y / samples) * size + Math.floor(x / samples)]++;
        }
      }
    }
    const ink = rgb(color);
    for (let index = 0; index < coverage.length; index++) {
      const alpha = Math.min(1, coverage[index] / (samples * samples));
      if (alpha === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const offset = index * 3 + channel;
        pixels[offset] = Math.round(pixels[offset] + (ink[channel] - pixels[offset]) * alpha);
      }
    }
  }
  return encodePng(size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tag, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const tagged = Buffer.concat([Buffer.from(tag, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged));
  return Buffer.concat([length, tagged, crc]);
}

/**
 * Truecolour, 8 bits, no alpha — colour type 2.
 *
 * The alpha channel is the point: App Store Connect rejects an icon that has
 * one at all, opaque or not (ITMS-90717), which is what `tools/check-icon-opaque.mjs`
 * guards on the Linux gate. Every layer is flattened onto the night here rather
 * than kept as transparency, so there is no channel to reject.
 */
function encodePng(size, pixels) {
  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 1; // Sub: neighbouring pixels differ little across a row.
    for (let x = stride - 1; x >= 0; x -= 1) {
      const value = pixels[y * stride + x] - (x >= 3 ? pixels[y * stride + x - 3] : 0);
      raw[y * (stride + 1) + 1 + x] = value & 0xff;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const [file, contents] of [
  ["assets/icon.svg", iconSvg()],
  ["assets/icon.png", iconPng(1024)],
  ["assets/logo-extended.svg", extendedSvg()],
  ["docs/readme/icon.png", iconPng(192)]
]) {
  writeFileSync(join(root, file), contents);
  console.log(`wrote ${file}`);
}
