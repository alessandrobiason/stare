import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Draws assets/logo-extended.svg, the app's logo as the boot screen shows it.
 *
 * `assets/icon.svg` is one tapered trail with a body at its head. This is that
 * shape five times over on five orbits, in the five colours the satellite
 * overlay itself uses — the picture the app opens on, held still. On the phone
 * it turns; nothing here animates, because this file is for the places a logo
 * goes rather than for the app, which draws the same composition from
 * `src/components/bootSky.ts`.
 *
 *     node tools/make-extended-logo.mjs
 *
 * The numbers below are that module's, restated: a build tool cannot import
 * TypeScript, and the alternative is a second copy of the geometry that
 * silently rots. `__tests__/bootSky.test.ts` fails if the two disagree, so a
 * change to the composition is a change to both, and this file is what makes
 * the second one a one-line command.
 *
 * No third-party imports on purpose, in keeping with the other generators here.
 */

/** Must match BOOT_SKY_DESIGN, BOOT_ORBITS and STARS in src/components/bootSky.ts. */
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
const ORBITS = [
  { radius: 175, phaseDeg: -30, sweepDeg: 120, trailWidth: 14, bodyRadius: 28, color: "#48515c" },
  { radius: 300, phaseDeg: 150, sweepDeg: 104, trailWidth: 17, bodyRadius: 36, color: "#fdfdfd" },
  { radius: 420, phaseDeg: -110, sweepDeg: 92, trailWidth: 24, bodyRadius: 50, color: "#5fd0d4" },
  { radius: 500, phaseDeg: 60, sweepDeg: 84, trailWidth: 19, bodyRadius: 42, color: "#7a71cc" },
  { radius: 620, phaseDeg: -100, sweepDeg: 76, trailWidth: 34, bodyRadius: 72, color: "#ffcf5c" }
];
const STARS = {
  seed: 11,
  count: 56,
  clearRadius: 130,
  radius: { minimum: 2, maximum: 5.5 },
  alpha: { minimum: 0.14, maximum: 0.48 },
  color: "#dbe6f2"
};

/**
 * The frame the logo is drawn in: the design frame itself, which is portrait
 * because the app is.
 *
 * Not the square `assets/icon.svg` is. A square crop of this composition cuts
 * the outermost orbit off entirely — and that is the gold one, the arc the
 * icon already is. What would be left is the extended logo with the original
 * missing from it.
 */
const WIDTH = DESIGN.width;
const HEIGHT = DESIGN.height;

const round = (value) => Number(value.toFixed(2));

function pointAt(cx, cy, radius, degrees) {
  const radians = degrees * (Math.PI / 180);
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/** The icon's shape: an arc that begins at a point and thickens to its head. */
function trailPolygon(cx, cy, radius, headDeg, sweepDeg, width) {
  const steps = Math.max(12, Math.round(sweepDeg / 2.5));
  const tailDeg = headDeg - sweepDeg;
  const outer = [];
  const inner = [];

  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps;
    const degrees = tailDeg + sweepDeg * along;
    const half = (width * along) / 2;
    outer.push(pointAt(cx, cy, radius + half, degrees));
    inner.push(pointAt(cx, cy, radius - half, degrees));
  }

  return [...outer, ...inner.reverse()];
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

/** The design frame scaled to cover the drawing, as `bootSkyScene` scales it. */
const scale = Math.max(WIDTH / DESIGN.width, HEIGHT / DESIGN.height);
const offsetX = (WIDTH - DESIGN.width * scale) / 2;
const offsetY = (HEIGHT - DESIGN.height * scale) / 2;
const centreX = offsetX + (DESIGN.width / 2) * scale;
const centreY = offsetY + (DESIGN.height / 2) * scale;

const satellites = ORBITS.map((orbit) => {
  const radius = orbit.radius * scale;
  const points = trailPolygon(
    centreX,
    centreY,
    radius,
    orbit.phaseDeg,
    orbit.sweepDeg,
    orbit.trailWidth * scale
  );
  const path = points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L ");
  const [bodyX, bodyY] = pointAt(centreX, centreY, radius, orbit.phaseDeg);
  return `  <g fill="${orbit.color}">
    <path d="M ${path} Z"/>
    <circle cx="${round(bodyX)}" cy="${round(bodyY)}" r="${round(orbit.bodyRadius * scale)}"/>
  </g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
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

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "logo-extended.svg");
writeFileSync(out, svg);
console.log(`wrote ${out}`);
