import { CATEGORY_COLORS } from "../satellite/categories";
import { FrameSize } from "./markerGeometry";

/**
 * The sky the app opens on: five satellites turning around the middle of the
 * screen, and nothing else.
 *
 * It is the logo rather than a decoration of it. `assets/icon.svg` is one
 * tapered trail with a body at its head; this is that shape five times over,
 * on five orbits, in the five colours the overlay itself uses — one satellite
 * per category, so the palette a person will read against the real sky is
 * already in front of them while it loads.
 *
 * The turning is the whole of the loading indicator. There is no spinner, no
 * progress bar and no step list, because none of them told anyone anything
 * they could act on: the app either opens or comes back with a reason. So the
 * screen says only "something is still happening", which motion says on its
 * own, and it says it in the one image the app is named for.
 *
 * Nothing here knows about Skia, about a browser canvas or about React — the
 * same split as `markerScene`, and for the same reason. The geometry is built
 * once per frame size and then only *turned*: a satellite's trail keeps its
 * shape as it goes round, so what changes per displayed frame is one angle per
 * orbit rather than two hundred points. `BootSky.tsx` draws it on the phone,
 * `BootSky.web.tsx` in the replay harness, and both only have to be able to
 * fill a polygon and a circle.
 */

/**
 * The space the composition is drawn in: a tall frame, mapped onto whatever
 * the device's actually is by covering it. Portrait because the app is
 * portrait-only, and cropping the sides of a picture arranged around its own
 * centre costs it nothing.
 */
export const BOOT_SKY_DESIGN: FrameSize = { width: 1024, height: 1820 };

/** The colour behind the drawing, for the frame before the first one lands. */
export const BOOT_SKY_BACKGROUND = "#070f1c";

/** The glow behind the satellites: a night sky is not one flat colour. */
const GLOW = {
  /** Fraction of the design frame, from its top-left. */
  x: 0.5,
  y: 0.5,
  /** Radius as a fraction of the design frame's height. */
  radius: 0.78,
  stops: [
    { offset: 0, color: "#12263f" },
    { offset: 0.52, color: "#0c1a2d" },
    { offset: 1, color: BOOT_SKY_BACKGROUND }
  ]
} as const;

/**
 * One orbit, in design pixels.
 *
 * `sweep` is how much of the circle the trail shows behind the body, and
 * `phaseDeg` where the body starts — measured from the orbit's centre, with
 * zero to the right and angles increasing downwards, as the frame's own
 * coordinates do.
 *
 * The periods are not physical. They are spread so the five never come back
 * into the same arrangement within the time a boot takes, which is what keeps
 * a screen made of circles from looking like it is stuck.
 */
type Orbit = {
  radius: number;
  phaseDeg: number;
  sweepDeg: number;
  /** Width of the trail where it meets the body; it tapers to nothing. */
  trailWidth: number;
  bodyRadius: number;
  color: string;
  /** Seconds for one turn, and its sign: 1 clockwise, -1 anticlockwise. */
  periodSeconds: number;
  direction: 1 | -1;
};

/**
 * The five orbits, inner to outer, drawn in that order so the largest body
 * passes in front rather than behind.
 *
 * Colour is `CATEGORY_COLORS` rather than a palette of its own: the gold arc
 * of the icon is the navigation colour, and the other four follow from it.
 */
export const BOOT_ORBITS: readonly Orbit[] = [
  {
    radius: 175,
    phaseDeg: -30,
    sweepDeg: 120,
    trailWidth: 14,
    bodyRadius: 28,
    color: CATEGORY_COLORS.OTHER,
    periodSeconds: 5.5,
    direction: 1
  },
  {
    radius: 300,
    phaseDeg: 150,
    sweepDeg: 104,
    trailWidth: 17,
    bodyRadius: 36,
    color: CATEGORY_COLORS.LANDMARK,
    periodSeconds: 8,
    direction: -1
  },
  {
    radius: 420,
    phaseDeg: -110,
    sweepDeg: 92,
    trailWidth: 24,
    bodyRadius: 50,
    color: CATEGORY_COLORS.EARTH,
    periodSeconds: 10.5,
    direction: 1
  },
  {
    radius: 500,
    phaseDeg: 60,
    sweepDeg: 84,
    trailWidth: 19,
    bodyRadius: 42,
    color: CATEGORY_COLORS.COMMS,
    periodSeconds: 14,
    direction: -1
  },
  {
    radius: 620,
    phaseDeg: -100,
    sweepDeg: 76,
    trailWidth: 34,
    bodyRadius: 72,
    color: CATEGORY_COLORS.NAVIGATION,
    periodSeconds: 18.5,
    direction: 1
  }
];

/**
 * The star field, as the parameters that generate it.
 *
 * Generated rather than listed, and from a fixed seed, so the same sky comes
 * out of every run — the still frame in `assets/logo-extended.svg` is the same
 * picture as the first frame on the phone, rather than a similar one.
 */
const STARS = {
  seed: 11,
  count: 56,
  /** Design pixels around the centre left clear, where the orbits are busiest. */
  clearRadius: 130,
  radius: { minimum: 2, maximum: 5.5 },
  alpha: { minimum: 0.14, maximum: 0.48 }
} as const;

export type SkyStar = {
  /** Centre, in layout pixels from the frame's top-left. */
  x: number;
  y: number;
  radius: number;
  alpha: number;
};

/** One satellite: a shape, and the point it turns about. */
export type SkySatellite = {
  color: string;
  /** The centre of its orbit, in layout pixels from the frame's top-left. */
  cx: number;
  cy: number;
  /**
   * The trail as a closed polygon — flat `x, y` pairs in layout pixels, at
   * zero rotation. Points rather than an arc because the shape tapers, so it
   * is not a stroke of constant width that either backend could describe.
   */
  trail: number[];
  /** The body at the trail's head, at zero rotation. */
  bodyX: number;
  bodyY: number;
  bodyRadius: number;
  /** How far it turns each second, in degrees. Signed. */
  degreesPerSecond: number;
};

/** The wash of colour behind everything, in layout pixels. */
export type SkyGlow = {
  x: number;
  y: number;
  radius: number;
  stops: readonly { offset: number; color: string }[];
};

export type BootSkyScene = {
  glow: SkyGlow;
  stars: SkyStar[];
  satellites: SkySatellite[];
};

/** Points on a circle, with the frame's y axis pointing down. */
function pointAt(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = degrees * (Math.PI / 180);
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/**
 * The icon's shape: an arc that begins at a point and thickens to its head.
 *
 * Walked out along the far edge and back along the near one, which is what
 * makes the taper — the two edges start on the same point and separate to the
 * full trail width by the time they reach the body.
 */
function trailPolygon(
  cx: number,
  cy: number,
  radius: number,
  headDeg: number,
  sweepDeg: number,
  width: number
): number[] {
  // About two and a half degrees a segment: past that the outer edge of the
  // widest trail visibly flattens, and below it costs points for nothing.
  const steps = Math.max(12, Math.round(sweepDeg / 2.5));
  const tailDeg = headDeg - sweepDeg;
  const outer: number[] = [];
  const inner: number[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps;
    const degrees = tailDeg + sweepDeg * along;
    const half = (width * along) / 2;
    outer.push(...pointAt(cx, cy, radius + half, degrees));
    inner.push(...pointAt(cx, cy, radius - half, degrees));
  }

  // Back along the near edge, so the polygon closes on the point it started at.
  const returning: number[] = [];
  for (let index = inner.length - 2; index >= 0; index -= 2) {
    returning.push(inner[index], inner[index + 1]);
  }
  return [...outer, ...returning];
}

/**
 * The star field for a frame.
 *
 * A linear congruential generator rather than `Math.random`, because the field
 * has to come out the same every time: see `STARS`.
 */
function starsFor(scale: number, offsetX: number, offsetY: number): SkyStar[] {
  let state: number = STARS.seed;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const centreX = BOOT_SKY_DESIGN.width / 2;
  const centreY = BOOT_SKY_DESIGN.height / 2;
  const stars: SkyStar[] = [];
  // The rejection below can in principle refuse for ever; it cannot run long.
  for (let attempt = 0; attempt < STARS.count * 60 && stars.length < STARS.count; attempt += 1) {
    const x = random() * BOOT_SKY_DESIGN.width;
    const y = random() * BOOT_SKY_DESIGN.height;
    const radius = STARS.radius.minimum + random() * (STARS.radius.maximum - STARS.radius.minimum);
    const alpha = STARS.alpha.minimum + random() * (STARS.alpha.maximum - STARS.alpha.minimum);
    if (Math.hypot(x - centreX, y - centreY) < STARS.clearRadius) continue;
    stars.push({
      x: offsetX + x * scale,
      y: offsetY + y * scale,
      radius: radius * scale,
      alpha
    });
  }
  return stars;
}

/** The colour of a star, which is the sky's own light rather than a category. */
export const STAR_COLOR = "#dbe6f2";

/**
 * The whole drawing for a frame, at rest.
 *
 * Built once per frame size and then turned — see `skyAngleDeg`. The design
 * frame is scaled to *cover* the device's, so the composition keeps its
 * proportions on any shape of screen and loses only what runs off the sides.
 */
export function bootSkyScene(frame: FrameSize): BootSkyScene {
  const scale = Math.max(
    frame.width / BOOT_SKY_DESIGN.width,
    frame.height / BOOT_SKY_DESIGN.height
  );
  const offsetX = (frame.width - BOOT_SKY_DESIGN.width * scale) / 2;
  const offsetY = (frame.height - BOOT_SKY_DESIGN.height * scale) / 2;
  const toFrameX = (x: number) => offsetX + x * scale;
  const toFrameY = (y: number) => offsetY + y * scale;

  const centreX = toFrameX(BOOT_SKY_DESIGN.width / 2);
  const centreY = toFrameY(BOOT_SKY_DESIGN.height / 2);

  const satellites = BOOT_ORBITS.map((orbit): SkySatellite => {
    const radius = orbit.radius * scale;
    const [bodyX, bodyY] = pointAt(centreX, centreY, radius, orbit.phaseDeg);
    return {
      color: orbit.color,
      cx: centreX,
      cy: centreY,
      trail: trailPolygon(
        centreX,
        centreY,
        radius,
        orbit.phaseDeg,
        orbit.sweepDeg,
        orbit.trailWidth * scale
      ),
      bodyX,
      bodyY,
      bodyRadius: orbit.bodyRadius * scale,
      degreesPerSecond: (360 / orbit.periodSeconds) * orbit.direction
    };
  });

  return {
    glow: {
      x: toFrameX(GLOW.x * BOOT_SKY_DESIGN.width),
      y: toFrameY(GLOW.y * BOOT_SKY_DESIGN.height),
      radius: GLOW.radius * BOOT_SKY_DESIGN.height * scale,
      stops: GLOW.stops
    },
    stars: starsFor(scale, offsetX, offsetY),
    satellites
  };
}

/** How far a satellite has turned about its orbit's centre, in degrees. */
export function skyAngleDeg(satellite: SkySatellite, elapsedSeconds: number): number {
  return satellite.degreesPerSecond * elapsedSeconds;
}
