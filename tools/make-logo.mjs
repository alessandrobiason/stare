import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Draws the app's logo, in the two shapes it is kept in:
 *
 * - `assets/icon.svg`, the mark on its own — one satellite, gold, on a square.
 * - `assets/logo-extended.svg`, the boot screen held still — that same mark
 *   five times over, on five orbits, in the five colours the satellite overlay
 *   itself uses. It is the picture the app opens on; on the phone it turns.
 *
 *     node tools/make-logo.mjs
 *
 * Both come out of one `trailPolygon` on purpose. They were drawn separately
 * once and had already drifted — the icon's trail thickened as the square root
 * of its length, the boot screen's linearly, so the icon was a fatter shape
 * than the thing it was supposed to be the single-satellite version of. One
 * function is what stops that happening again.
 *
 * The numbers below are `src/components/bootSky.ts`'s, restated: a build tool
 * cannot import TypeScript, and the alternative is a second copy of the
 * geometry that silently rots. `__tests__/bootSky.test.ts` fails if the two
 * disagree, so a change to the composition is a change to both, and this file
 * is what makes the second one a one-line command.
 *
 * No third-party imports on purpose, in keeping with the other generators here.
 */

/** Must match BOOT_SKY_DESIGN, BOOT_ORBITS, TRAIL_GAP and STARS in src/components/bootSky.ts. */
const DESIGN = { width: 1024, height: 1820 };
const BACKGROUND = "#070f1c";
const GLOW = {
  x: 0.5,
  y: 0.5,
  radius: 0.78,
  stops: [
    { offset: 0, color: "#12263f" },
    { offset: 0.52, color: "#0c1a2d" },
    { offset: 1, color: BACKGROUND }
  ]
};
/** `direction` is the orbit's, and it is which side of the body the trail lies on. */
const ORBITS = [
  { radius: 175, phaseDeg: -30, sweepDeg: 120, trailWidth: 14, bodyRadius: 28, color: "#48515c", direction: 1 },
  { radius: 300, phaseDeg: 150, sweepDeg: 104, trailWidth: 17, bodyRadius: 36, color: "#fdfdfd", direction: -1 },
  { radius: 420, phaseDeg: -110, sweepDeg: 92, trailWidth: 24, bodyRadius: 50, color: "#5fd0d4", direction: 1 },
  { radius: 500, phaseDeg: 60, sweepDeg: 84, trailWidth: 19, bodyRadius: 42, color: "#7a71cc", direction: -1 },
  { radius: 620, phaseDeg: -100, sweepDeg: 76, trailWidth: 34, bodyRadius: 72, color: "#ffcf5c", direction: 1 }
];
const TRAIL_GAP = 0.35;
const STARS = {
  seed: 11,
  count: 56,
  clearRadius: 130,
  radius: { minimum: 2, maximum: 5.5 },
  alpha: { minimum: 0.14, maximum: 0.48 },
  color: "#dbe6f2"
};

/**
 * The mark on its own: one satellite, on its own orbit, filling a square.
 *
 * Its own numbers rather than one of `ORBITS`, because it is not a crop of the
 * composition — a square crop of that cuts the outermost orbit off entirely,
 * and that gold arc *is* the icon. What it shares with the five is the shape:
 * same trail, same taper, same gap between trail and body.
 *
 * The orbit's centre is off the bottom of the square, so what the icon shows is
 * a piece of an arc rather than a ring — near enough a horizon, which is what
 * the app is pointed at.
 */
const ICON = {
  size: 1024,
  background: "#0b1220",
  /** The navigation gold: the outermost orbit's colour, and the app's own. */
  color: ORBITS[4].color,
  radius: 330,
  phaseDeg: -38,
  sweepDeg: 104,
  trailWidth: 46,
  bodyRadius: 100,
  /** Clockwise, like the gold orbit it takes its colour from: trail below, body ahead. */
  direction: 1,
  /** How much of the square the drawing spans, the rest being margin. */
  coverage: 0.74
};

/**
 * The frame the extended logo is drawn in: the design frame itself, which is
 * portrait because the app is.
 */
const WIDTH = DESIGN.width;
const HEIGHT = DESIGN.height;

const round = (value) => Number(value.toFixed(2));

function pointAt(cx, cy, radius, degrees) {
  const radians = degrees * (Math.PI / 180);
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/**
 * The icon's shape: an arc that begins at a point, thickens along the orbit,
 * and stops `clearance` short of the body's centre — see TRAIL_GAP.
 *
 * `direction` is the orbit's: the trail lies behind the body, which is against
 * the way it travels, so an anticlockwise orbit's runs the other way round.
 */
function trailPolygon(cx, cy, radius, headDeg, sweepDeg, width, clearance, direction) {
  const steps = Math.max(12, Math.round(sweepDeg / 2.5));
  const trailHeadDeg = headDeg - direction * (clearance / radius) * (180 / Math.PI);
  const tailDeg = trailHeadDeg - direction * sweepDeg;
  const outer = [];
  const inner = [];

  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps;
    const degrees = tailDeg + direction * sweepDeg * along;
    const half = (width * along) / 2;
    outer.push(pointAt(cx, cy, radius + half, degrees));
    inner.push(pointAt(cx, cy, radius - half, degrees));
  }

  return [...outer, ...inner.reverse()];
}

/** One satellite, as the two shapes every backend draws it with. */
function satellite(cx, cy, orbit, scale) {
  const radius = orbit.radius * scale;
  const points = trailPolygon(
    cx,
    cy,
    radius,
    orbit.phaseDeg,
    orbit.sweepDeg,
    orbit.trailWidth * scale,
    orbit.bodyRadius * (1 + TRAIL_GAP) * scale,
    orbit.direction
  );
  const [bodyX, bodyY] = pointAt(cx, cy, radius, orbit.phaseDeg);
  return { points, bodyX, bodyY, bodyRadius: orbit.bodyRadius * scale };
}

function group(color, { points, bodyX, bodyY, bodyRadius }, transform = "") {
  const path = points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L ");
  return `  <g${transform ? ` transform="${transform}"` : ""} fill="${color}">
    <path d="M ${path} Z"/>
    <circle cx="${round(bodyX)}" cy="${round(bodyY)}" r="${round(bodyRadius)}"/>
  </g>`;
}

function stars(scale, offsetX, offsetY) {
  let state = STARS.seed;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const centreX = DESIGN.width / 2;
  const centreY = DESIGN.height / 2;
  const drawn = [];
  for (let attempt = 0; attempt < STARS.count * 60 && drawn.length < STARS.count; attempt += 1) {
    const x = random() * DESIGN.width;
    const y = random() * DESIGN.height;
    const radius = STARS.radius.minimum + random() * (STARS.radius.maximum - STARS.radius.minimum);
    const alpha = STARS.alpha.minimum + random() * (STARS.alpha.maximum - STARS.alpha.minimum);
    if (Math.hypot(x - centreX, y - centreY) < STARS.clearRadius) continue;
    drawn.push(
      `    <circle cx="${round(offsetX + x * scale)}" cy="${round(offsetY + y * scale)}" ` +
        `r="${round(radius * scale)}" opacity="${round(alpha)}"/>`
    );
  }
  return drawn;
}

/** The square mark: drawn about its orbit's centre, then fitted to the square. */
function iconSvg() {
  const middle = ICON.size / 2;
  const drawn = satellite(middle, middle, ICON, 1);
  const xs = [
    ...drawn.points.map(([x]) => x),
    drawn.bodyX - drawn.bodyRadius,
    drawn.bodyX + drawn.bodyRadius
  ];
  const ys = [
    ...drawn.points.map(([, y]) => y),
    drawn.bodyY - drawn.bodyRadius,
    drawn.bodyY + drawn.bodyRadius
  ];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  // Fitted on the longer side and centred on its own bounding box, so the gap
  // the trail leaves does not push the mark off the middle of the square.
  const scale = (ICON.size * ICON.coverage) / Math.max(right - left, bottom - top);
  const transform =
    `translate(${middle},${middle}) scale(${scale.toFixed(4)}) ` +
    `translate(${round(-(left + right) / 2)},${round(-(top + bottom) / 2)})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON.size}" height="${
    ICON.size
  }" viewBox="0 0 ${ICON.size} ${ICON.size}">
  <rect width="${ICON.size}" height="${ICON.size}" fill="${ICON.background}"/>
${group(ICON.color, drawn, transform)}
</svg>
`;
}

/** The composition: the design frame scaled to cover the drawing, as `bootSkyScene` scales it. */
function extendedSvg() {
  const scale = Math.max(WIDTH / DESIGN.width, HEIGHT / DESIGN.height);
  const offsetX = (WIDTH - DESIGN.width * scale) / 2;
  const offsetY = (HEIGHT - DESIGN.height * scale) / 2;
  const centreX = offsetX + (DESIGN.width / 2) * scale;
  const centreY = offsetY + (DESIGN.height / 2) * scale;

  const satellites = ORBITS.map((orbit) => group(orbit.color, satellite(centreX, centreY, orbit, scale)));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="sky" gradientUnits="userSpaceOnUse" cx="${round(centreX)}" cy="${round(
      centreY
    )}" r="${round(GLOW.radius * DESIGN.height * scale)}">
${GLOW.stops
  .map((stop) => `      <stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`)
  .join("\n")}
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  <g fill="${STARS.color}">
${stars(scale, offsetX, offsetY).join("\n")}
  </g>
${satellites.join("\n")}
</svg>
`;
}

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
for (const [name, svg] of [
  ["icon.svg", iconSvg()],
  ["logo-extended.svg", extendedSvg()]
]) {
  const out = join(assets, name);
  writeFileSync(out, svg);
  console.log(`wrote ${out}`);
}
