import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Draws the app's logo, in the two shapes it is kept in:
 *
 * - `assets/icon.svg`, the mark on its own — one satellite as a point of light
 *   on a wide arc over a horizon, trailing a tail that fades to nothing — and
 *   `assets/icon.png`, the same picture rasterised: the app icon proper,
 *   because `app.json` can only point iOS at a PNG.
 * - `assets/logo-extended.svg`, the boot screen held still — the night, the
 *   stars and the first pass, at the moment the phone first draws it, at three
 *   times the design frame's points, which is a current iPhone's pixels.
 *
 *     node tools/make-logo.mjs
 *
 * Both are drawn in the overlay's own light: a white point, a tight white glow
 * and a wide cool bloom, faded by the stops `src/components/markerScene.ts`
 * fades every mark by. The satellites on the sky became light rather than paint,
 * and a logo that stayed a disc with a solid trail was a picture of a different
 * app.
 *
 * The numbers below are `src/components/bootSky.ts`'s and `markerScene.ts`'s,
 * restated: a build tool cannot import TypeScript, and the alternative is a
 * second copy of the geometry that silently rots. `__tests__/bootSky.test.ts`
 * fails if the two disagree, so a change to the composition is a change to
 * both, and this file is what makes the second one a one-line command.
 *
 * No third-party imports on purpose, in keeping with the other generators here.
 */

/** Must match COMET_FADE (as `tail`), GLOW_FADE, BLOOM_FADE and CORE_FADE in src/components/markerScene.ts. */
const FADES = {
  tail: [
    { at: 0, strength: 1 },
    { at: 0.3, strength: 0.5 },
    { at: 0.65, strength: 0.15 },
    { at: 1, strength: 0 }
  ],
  glow: [
    { at: 0, strength: 1 },
    { at: 0.12, strength: 0.7 },
    { at: 0.35, strength: 0.22 },
    { at: 1, strength: 0 }
  ],
  bloom: [
    { at: 0, strength: 1 },
    { at: 0.2, strength: 0.45 },
    { at: 0.5, strength: 0.12 },
    { at: 1, strength: 0 }
  ],
  core: [
    { at: 0, strength: 1 },
    { at: 0.5, strength: 1 },
    { at: 1, strength: 0 }
  ]
};
/** Must match MARK_COLOR and MARK_BLOOM in src/components/palette.ts. */
const MARK_COLOR = "#ffffff";
const MARK_BLOOM = "#a9c9ff";

/**
 * Must match BOOT_SKY_DESIGN, SKY, BOOT_PASSES[0], PASS_TIMING, LIGHT, STARS and
 * STAR_COLOR in src/components/bootSky.ts.
 */
const DESIGN = { width: 390, height: 844 };
const SKY = {
  stops: [
    { offset: 0, color: "#03060d" },
    { offset: 0.55, color: "#07101f" },
    { offset: 1, color: "#0d1c33" }
  ],
  horizon: { x: 0.5, y: 1.12, radius: 0.75, color: "#406eaa", alpha: 0.2 }
};
const FIRST_PASS = { apex: 253, radius: 608, lean: 20, direction: 1 };
const PASS_TIMING = { startProgress: 0.3, fadeShare: 0.12, marginPx: 40 };
const LIGHT = {
  coreRadius: 2.6,
  glow: { radius: 14, alpha: 0.8 },
  bloom: { radius: 40, alpha: 0.35 },
  tail: { width: 2.6, length: 130, alpha: 0.85 }
};
const STARS = {
  seed: 7,
  count: 64,
  clearRadius: 80,
  radius: { minimum: 0.35, maximum: 1.15 },
  alpha: { minimum: 0.12, maximum: 0.54 },
  twinkle: { depth: 0.22, rate: { minimum: 0.5, maximum: 1.5 } }
};
const STAR_COLOR = "#dbe6f2";

/** The still is the design frame at this many pixels a point. */
const EXTENDED_SCALE = 3;

/**
 * The mark on its own: one satellite, on its own arc, filling a square.
 *
 * Its own numbers rather than a crop of the boot screen, because at the size
 * of a home screen a light a few points across in a phone-sized sky is a speck.
 * What it shares with the boot screen is everything else: the same night going
 * lighter towards the horizon, the same kind of arc with its centre below the
 * square, the same light made of the same fades.
 *
 * The one fade it does not share is the tail's. The overlay's spends most of a
 * tail's strength in its first third, which at sixty points across is a stub;
 * the icon's holds on further along so the arc still reads as an arc there.
 */
const ICON = {
  size: 1024,
  night: [
    { offset: 0, color: "#040811" },
    { offset: 1, color: "#12284a" }
  ],
  horizon: { x: 0.5, y: 1.25, radius: 0.95, color: "#3f78c8", alpha: 0.26 },
  /** The arc's centre as fractions of the square, and its radius in pixels. */
  arc: { cx: 0.43, cy: 0.97, radius: 600 },
  /** Past the top of the arc and heading down it, clockwise: tail behind, rising from the left. */
  headDeg: -66,
  sweepDeg: 58,
  direction: 1,
  coreRadius: 34,
  glow: { radius: 150, alpha: 0.8 },
  bloom: { radius: 320, alpha: 0.45 },
  tail: { width: 42, alpha: 0.9 },
  tailFade: [
    { at: 0, strength: 1 },
    { at: 0.35, strength: 0.5 },
    { at: 0.75, strength: 0.12 },
    { at: 1, strength: 0 }
  ]
};

const round = (value) => Number(value.toFixed(2));
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function pointAt(cx, cy, radius, degrees) {
  const radians = degrees * (Math.PI / 180);
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/**
 * A tail laid back along an arc from a head at `headDeg`: full width under the
 * head, tapering to nothing at its tip. Out along the far edge and back along
 * the near one, so the polygon closes on the point it started at.
 */
function tailOnArc(cx, cy, radius, headDeg, sweepDeg, width, direction) {
  const steps = Math.max(16, Math.round(sweepDeg / 1.5));
  const outer = [];
  const inner = [];
  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps;
    const degrees = headDeg - direction * sweepDeg * along;
    const half = (width / 2) * (1 - along);
    outer.push(pointAt(cx, cy, radius + half, degrees));
    inner.push(pointAt(cx, cy, radius - half, degrees));
  }
  return { points: [...outer, ...inner.reverse()], tip: outer[outer.length - 1] };
}

function crossingDeg(cx, radius, x) {
  return -Math.acos(clamp((x - cx) / radius, -1, 1)) * (180 / Math.PI);
}

/* ---- The boot screen, held still. ---------------------------------------- */

/** `bootSkyScene`, `skyPass(scene, 0)` and `passPose` at `skyMoment(0)`, for the still's frame. */
function bootStill() {
  const scale = EXTENDED_SCALE;
  const width = DESIGN.width * scale;
  const height = DESIGN.height * scale;
  const pass = FIRST_PASS;
  const radius = pass.radius * scale;
  const cx = (DESIGN.width / 2 + pass.lean) * scale;
  const cy = (pass.apex + pass.radius) * scale;
  const margin = PASS_TIMING.marginPx * scale;
  const left = crossingDeg(cx, radius, -margin);
  const right = crossingDeg(cx, radius, width + margin);
  const [fromDeg, toDeg] = pass.direction === 1 ? [left, right] : [right, left];

  const progress = PASS_TIMING.startProgress;
  const edge = clamp(Math.min(progress, 1 - progress) / PASS_TIMING.fadeShare, 0, 1);
  const pose = {
    angleDeg: fromDeg + (toDeg - fromDeg) * progress + 90,
    alpha: edge * edge * (3 - 2 * edge)
  };

  const [x, y] = pointAt(cx, cy, radius, -90);
  const sweepDeg = ((LIGHT.tail.length * scale) / radius) * (180 / Math.PI);
  const tail = tailOnArc(cx, cy, radius, -90, sweepDeg, LIGHT.tail.width * scale, pass.direction);

  return {
    width,
    height,
    scale,
    pass: { cx, cy },
    pose,
    light: {
      x,
      y,
      coreRadius: LIGHT.coreRadius * scale,
      glow: { radius: LIGHT.glow.radius * scale, alpha: LIGHT.glow.alpha },
      bloom: { radius: LIGHT.bloom.radius * scale, alpha: LIGHT.bloom.alpha },
      tail: { ...tail, alpha: LIGHT.tail.alpha },
      tailFade: FADES.tail
    }
  };
}

/** `starsFor`, with each star at the brightness `starAlpha` gives it on the first frame. */
function stars(scale) {
  let state = STARS.seed;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const between = (range) => range.minimum + random() * (range.maximum - range.minimum);

  const centreX = DESIGN.width / 2;
  const centreY = DESIGN.height / 2;
  const drawn = [];
  for (let attempt = 0; attempt < STARS.count * 60 && drawn.length < STARS.count; attempt += 1) {
    const x = random() * DESIGN.width;
    const y = random() * DESIGN.height;
    const radius = between(STARS.radius);
    const alpha = between(STARS.alpha);
    between(STARS.twinkle.rate);
    const phase = random() * Math.PI * 2;
    if (Math.hypot(x - centreX, y - centreY) < STARS.clearRadius) continue;
    const { depth } = STARS.twinkle;
    const shown = alpha * (1 - depth + depth * Math.sin(phase));
    drawn.push(
      `    <circle cx="${round(x * scale)}" cy="${round(y * scale)}" ` +
        `r="${round(radius * scale)}" opacity="${round(shown)}"/>`
    );
  }
  return drawn;
}

/* ---- SVG. ---------------------------------------------------------------- */

function stopsSvg(fade, color) {
  return fade
    .map((stop) => `      <stop offset="${round(stop.at * 100)}%" stop-color="${color}" stop-opacity="${stop.strength}"/>`)
    .join("\n");
}

/**
 * One light, as the four shapes every backend draws it with: bloom, glow, tail
 * and point, each filled with its fade. Gradients in user space, so a light
 * inside a turned group turns with its gradients.
 */
function lightSvg(id, light, alpha, transform = "") {
  const { x, y, tail } = light;
  const path = tail.points.map(([px, py]) => `${round(px)} ${round(py)}`).join(" L ");
  const radial = (name, radius, fade, color) => `    <radialGradient id="${id}-${name}" gradientUnits="userSpaceOnUse" cx="${round(x)}" cy="${round(
    y
  )}" r="${round(radius)}">
${stopsSvg(fade, color)}
    </radialGradient>`;

  const defs = `  <defs>
${radial("bloom", light.bloom.radius, FADES.bloom, MARK_BLOOM)}
${radial("glow", light.glow.radius, FADES.glow, MARK_COLOR)}
${radial("core", light.coreRadius, FADES.core, MARK_COLOR)}
    <linearGradient id="${id}-tail" gradientUnits="userSpaceOnUse" x1="${round(x)}" y1="${round(y)}" x2="${round(
      tail.tip[0]
    )}" y2="${round(tail.tip[1])}">
${stopsSvg(light.tailFade, MARK_COLOR)}
    </linearGradient>
  </defs>`;

  const shapes = `  <g${transform ? ` transform="${transform}"` : ""}>
    <circle cx="${round(x)}" cy="${round(y)}" r="${round(light.bloom.radius)}" fill="url(#${id}-bloom)" opacity="${round(
      light.bloom.alpha * alpha
    )}"/>
    <circle cx="${round(x)}" cy="${round(y)}" r="${round(light.glow.radius)}" fill="url(#${id}-glow)" opacity="${round(
      light.glow.alpha * alpha
    )}"/>
    <path d="M ${path} Z" fill="url(#${id}-tail)" opacity="${round(tail.alpha * alpha)}"/>
    <circle cx="${round(x)}" cy="${round(y)}" r="${round(light.coreRadius)}" fill="url(#${id}-core)" opacity="${round(alpha)}"/>
  </g>`;

  return `${defs}\n${shapes}`;
}

/** The composition: the boot screen's first frame, as `BootSky` draws it. */
function extendedSvg() {
  const still = bootStill();
  const { width, height, scale } = still;
  const horizon = SKY.horizon;
  const transform = `rotate(${round(still.pose.angleDeg)} ${round(still.pass.cx)} ${round(still.pass.cy)})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="night" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${height}">
${SKY.stops.map((stop) => `      <stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join("\n")}
    </linearGradient>
    <radialGradient id="horizon" gradientUnits="userSpaceOnUse" cx="${round(horizon.x * width)}" cy="${round(
      horizon.y * height
    )}" r="${round(horizon.radius * height)}">
      <stop offset="0%" stop-color="${horizon.color}" stop-opacity="${horizon.alpha}"/>
      <stop offset="100%" stop-color="${horizon.color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#night)"/>
  <rect width="${width}" height="${height}" fill="url(#horizon)"/>
  <g id="stars" fill="${STAR_COLOR}">
${stars(scale).join("\n")}
  </g>
${lightSvg("pass", still.light, still.pose.alpha, transform)}
</svg>
`;
}

/** The icon's light, placed in the square. */
function iconLight() {
  const S = ICON.size;
  const cx = ICON.arc.cx * S;
  const cy = ICON.arc.cy * S;
  const [x, y] = pointAt(cx, cy, ICON.arc.radius, ICON.headDeg);
  const tail = tailOnArc(cx, cy, ICON.arc.radius, ICON.headDeg, ICON.sweepDeg, ICON.tail.width, ICON.direction);
  return {
    x,
    y,
    coreRadius: ICON.coreRadius,
    glow: ICON.glow,
    bloom: ICON.bloom,
    tail: { ...tail, alpha: ICON.tail.alpha },
    tailFade: ICON.tailFade
  };
}

function iconSvg(light) {
  const S = ICON.size;
  const { horizon } = ICON;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="night" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${S}">
${ICON.night.map((stop) => `      <stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join("\n")}
    </linearGradient>
    <radialGradient id="horizon" gradientUnits="userSpaceOnUse" cx="${round(horizon.x * S)}" cy="${round(
      horizon.y * S
    )}" r="${round(horizon.radius * S)}">
      <stop offset="0%" stop-color="${horizon.color}" stop-opacity="${horizon.alpha}"/>
      <stop offset="100%" stop-color="${horizon.color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#night)"/>
  <rect width="${S}" height="${S}" fill="url(#horizon)"/>
${lightSvg("light", light, 1)}
</svg>
`;
}

/* ---- PNG. ---------------------------------------------------------------- */

/**
 * The icon again, as pixels. `app.json` names a PNG because that is all an iOS
 * asset catalogue takes, and an SVG nothing on the build machine can rasterise
 * is how `assets/icon.png` came to be a different picture from `assets/icon.svg`
 * for a while — the App Store showed the older one, and a new build did not
 * change that. Drawing both here is what keeps them one picture.
 *
 * The SVG is two gradient-filled rectangles and a light, and every one of those
 * is a formula per pixel, so a compositor that evaluates each layer's gradient
 * the way SVG defines it and lays it over the last is the whole renderer — the
 * one edge that needs antialiasing, the tail's, gets a scanline coverage map.
 * Cheaper than a dependency, and it keeps the file's no-imports rule.
 */

/** Coverage is exact across a row and sampled down it, so this is what the arc's diagonals cost. */
const SUBSAMPLES = 16;

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** A fade's strength `t` of the way along it, interpolated between its stops as SVG does. */
function fadeAt(fade, t) {
  if (t <= fade[0].at) return fade[0].strength;
  for (let index = 1; index < fade.length; index += 1) {
    const stop = fade[index];
    if (t <= stop.at) {
      const previous = fade[index - 1];
      const share = (t - previous.at) / (stop.at - previous.at);
      return previous.strength + (stop.strength - previous.strength) * share;
    }
  }
  return fade[fade.length - 1].strength;
}

/** Adds a horizontal run's exact per-pixel overlap into one row of the coverage map. */
function addSpan(coverage, row, size, start, end) {
  for (let x = Math.max(0, Math.floor(start)); x < Math.min(size, Math.ceil(end)); x += 1) {
    const overlap = Math.min(end, x + 1) - Math.max(start, x);
    if (overlap > 0) coverage[row + x] += overlap / SUBSAMPLES;
  }
}

/** Coverage of a polygon, in [0, 1] per pixel, by even-odd scanline fill. */
function rasterise(size, polygon) {
  const coverage = new Float64Array(size * size);
  for (let step = 0; step < size * SUBSAMPLES; step += 1) {
    const y = (step + 0.5) / SUBSAMPLES;
    const crossings = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const [x0, y0] = polygon[i];
      const [x1, y1] = polygon[(i + 1) % polygon.length];
      // Half-open in y: a vertex on the scanline is counted once, not twice.
      if (y0 <= y === y1 <= y) continue;
      crossings.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    crossings.sort((a, b) => a - b);
    const row = Math.floor(y) * size;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      addSpan(coverage, row, size, crossings[i], crossings[i + 1]);
    }
  }
  return coverage;
}

/**
 * A little noise per pixel, the same on every run.
 *
 * Added before each channel is rounded to eight bits. A night that goes from
 * near-black to deep blue across a thousand pixels has fewer than fifty steps of
 * blue to spend on it, and without this they are bands a person can count.
 */
function dither(x, y) {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296 - 0.5;
}

function iconPng(light) {
  const S = ICON.size;
  const colour = new Float64Array(S * S * 3);
  const over = (index, [red, green, blue], alpha) => {
    if (!(alpha > 0)) return;
    colour[index] += (red - colour[index]) * alpha;
    colour[index + 1] += (green - colour[index + 1]) * alpha;
    colour[index + 2] += (blue - colour[index + 2]) * alpha;
  };

  const top = rgb(ICON.night[0].color);
  const bottom = rgb(ICON.night[1].color);
  const horizon = { ...ICON.horizon, x: ICON.horizon.x * S, y: ICON.horizon.y * S, radius: ICON.horizon.radius * S };
  const tail = rasterise(S, light.tail.points);
  const [tipX, tipY] = light.tail.tip;
  const alongX = tipX - light.x;
  const alongY = tipY - light.y;
  const alongSquared = alongX * alongX + alongY * alongY;
  const radial = (index, px, py, radius, fade, color, alpha) => {
    const distance = Math.hypot(px - light.x, py - light.y);
    if (distance < radius) over(index, color, alpha * fadeAt(fade, distance / radius));
  };
  const white = rgb(MARK_COLOR);
  const bloom = rgb(MARK_BLOOM);
  const breath = rgb(horizon.color);

  for (let y = 0; y < S; y += 1) {
    const py = y + 0.5;
    const t = py / S;
    const night = top.map((channel, index) => channel + (bottom[index] - channel) * t);
    for (let x = 0; x < S; x += 1) {
      const px = x + 0.5;
      const index = (y * S + x) * 3;
      colour[index] = night[0];
      colour[index + 1] = night[1];
      colour[index + 2] = night[2];

      const fromHorizon = Math.hypot(px - horizon.x, py - horizon.y) / horizon.radius;
      if (fromHorizon < 1) over(index, breath, horizon.alpha * (1 - fromHorizon));

      radial(index, px, py, light.bloom.radius, FADES.bloom, bloom, light.bloom.alpha);
      radial(index, px, py, light.glow.radius, FADES.glow, white, light.glow.alpha);

      const covered = tail[y * S + x];
      if (covered > 0) {
        const along = clamp(((px - light.x) * alongX + (py - light.y) * alongY) / alongSquared, 0, 1);
        over(index, white, Math.min(1, covered) * light.tail.alpha * fadeAt(light.tailFade, along));
      }

      radial(index, px, py, light.coreRadius, FADES.core, white, 1);
    }
  }

  const pixels = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const index = (y * S + x) * 3;
      const noise = dither(x, y);
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[index + channel] = clamp(Math.round(colour[index + channel] + noise), 0, 255);
      }
    }
  }
  return encodePng(S, pixels);
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

const light = iconLight();
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
for (const [name, contents] of [
  ["icon.svg", iconSvg(light)],
  ["icon.png", iconPng(light)],
  ["logo-extended.svg", extendedSvg()]
]) {
  const out = join(assets, name);
  writeFileSync(out, contents);
  console.log(`wrote ${out}`);
}
