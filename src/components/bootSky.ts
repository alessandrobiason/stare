import type { FrameSize } from "./markerGeometry";

/**
 * The S orbitale identity, shared by both boot renderers and the asset generator.
 * Coordinates use one square view box, so the icon and the floating boot mark
 * have precisely the same silhouette. No platform or runtime imports here:
 * tools/make-logo.mjs reads this module through loadFromSource.
 */
export const ORBITAL_LOGO = {
  size: 256,
  background: "#050b16",
  color: "#eef4fb",
  accent: "#4da6ff",
  paths: [
    "M 161 62 C 91 67 36 94 57 125 C 69 143 101 152 134 156 C 89 139 65 124 78 107 C 93 88 128 74 162 68 Z",
    "M 107 116 C 171 141 200 192 43 197 C 115 215 192 199 192 165 C 192 145 158 127 107 116 Z"
  ],
  dot: { x: 184, y: 64, radius: 14 },
  pulse: { periodSeconds: 3.2, depth: 0.08 }
} as const;

/** The indicator shares the blue satellite's colour, rather than a category. */
export const BOOT_LIGHT_COLORS = { color: ORBITAL_LOGO.accent, bloom: ORBITAL_LOGO.accent } as const;
export const BOOT_SKY_DESIGN: FrameSize = { width: 390, height: 844 };

const SKY = {
  /** Top to bottom of the design frame. */
  stops: [
    { offset: 0, color: "#03060d" },
    { offset: 0.55, color: "#07101f" },
    { offset: 1, color: "#0d1c33" }
  ],
  /**
   * The faint breath of light over the horizon, below the bottom of the frame.
   * Fractions of the design frame: `x` of its width, `y` and `radius` of its
   * height.
   */
  horizon: { x: 0.5, y: 1.12, radius: 0.75, color: "#406eaa", alpha: 0.2 }
} as const;

/**
 * The colour behind the drawing, for the frame before the first one lands:
 * the middle of the night's own gradient, which is the single colour nearest
 * to all of it.
 */
export const BOOT_SKY_BACKGROUND = SKY.stops[1].color;

const STARS = {
  seed: 7,
  count: 64,
  /** Design points around the middle left clear, where the name is. */
  clearRadius: 80,
  radius: { minimum: 0.35, maximum: 1.15 },
  alpha: { minimum: 0.12, maximum: 0.54 },
  /**
   * How much of a star's light comes and goes, and how fast, in radians a
   * second. Slow and shallow: it is there to keep a still sky from looking
   * frozen, not to be noticed.
   */
  twinkle: { depth: 0.22, rate: { minimum: 0.5, maximum: 1.5 } }
} as const;

/** The colour of a star, which is the sky's own light rather than a satellite's. */
export const STAR_COLOR = "#dbe6f2";

export type SkyStar = {
  /** Centre, in layout pixels from the frame's top-left. */
  x: number;
  y: number;
  radius: number;
  /** Its brightest; see `starAlpha`. */
  alpha: number;
  twinkleRate: number;
  twinklePhase: number;
};

/** The night, in layout pixels. */
export type SkyNight = {
  /** Where the top-to-bottom gradient starts and ends. */
  fromY: number;
  toY: number;
  stops: readonly { offset: number; color: string }[];
  horizon: { x: number; y: number; radius: number; color: string; alpha: number };
};

export type BootSkyScene = {
  frame: FrameSize;
  /** Layout pixels per design point, and where the design frame's corner lands. */
  scale: number;
  offsetX: number;
  offsetY: number;
  night: SkyNight;
  stars: SkyStar[];
};

/**
 * The night and the stars for a frame.
 *
 * The design frame is scaled to *cover* the device's, so the composition keeps
 * its proportions on any shape of screen and loses only what runs off the
 * edges.
 */
export function bootSkyScene(frame: FrameSize): BootSkyScene {
  const scale = Math.max(
    frame.width / BOOT_SKY_DESIGN.width,
    frame.height / BOOT_SKY_DESIGN.height
  );
  const offsetX = (frame.width - BOOT_SKY_DESIGN.width * scale) / 2;
  const offsetY = (frame.height - BOOT_SKY_DESIGN.height * scale) / 2;
  const { horizon } = SKY;

  return {
    frame,
    scale,
    offsetX,
    offsetY,
    night: {
      fromY: offsetY,
      toY: offsetY + BOOT_SKY_DESIGN.height * scale,
      stops: SKY.stops,
      horizon: {
        x: offsetX + horizon.x * BOOT_SKY_DESIGN.width * scale,
        y: offsetY + horizon.y * BOOT_SKY_DESIGN.height * scale,
        radius: horizon.radius * BOOT_SKY_DESIGN.height * scale,
        color: horizon.color,
        alpha: horizon.alpha
      }
    },
    stars: starsFor(scale, offsetX, offsetY)
  };
}

export type BootLogo = { x: number; y: number; size: number; scale: number };

/** Fit above the centred wordmark, including on the smallest supported phone. */
export function bootLogo(frame: FrameSize): BootLogo {
  const size = Math.min(frame.width * 0.4, frame.height * 0.2);
  return {
    x: (frame.width - size) / 2,
    y: frame.height / 2 - 32 - size,
    size,
    scale: size / ORBITAL_LOGO.size
  };
}

/** A quiet, seamless breath; holding elapsed time also holds a failed boot. */
export function logoDotRadius(elapsedSeconds: number): number {
  const { periodSeconds, depth } = ORBITAL_LOGO.pulse;
  return ORBITAL_LOGO.dot.radius *
    (1 + depth * Math.sin(Math.max(0, elapsedSeconds) * Math.PI * 2 / periodSeconds));
}

/** How bright a star is after `elapsedSeconds`: slowly, and never far from its best. */
export function starAlpha(star: SkyStar, elapsedSeconds: number): number {
  const { depth } = STARS.twinkle;
  const wave = Math.sin(star.twinkleRate * elapsedSeconds + star.twinklePhase);
  return star.alpha * (1 - depth + depth * wave);
}

function starsFor(scale: number, offsetX: number, offsetY: number): SkyStar[] {
  let state: number = STARS.seed;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const between = (range: { minimum: number; maximum: number }) =>
    range.minimum + random() * (range.maximum - range.minimum);

  const centreX = BOOT_SKY_DESIGN.width / 2;
  const centreY = BOOT_SKY_DESIGN.height / 2;
  const stars: SkyStar[] = [];
  // The rejection below can in principle refuse for ever; it cannot run long.
  for (let attempt = 0; attempt < STARS.count * 60 && stars.length < STARS.count; attempt += 1) {
    const x = random() * BOOT_SKY_DESIGN.width;
    const y = random() * BOOT_SKY_DESIGN.height;
    const radius = between(STARS.radius);
    const alpha = between(STARS.alpha);
    const twinkleRate = between(STARS.twinkle.rate);
    const twinklePhase = random() * Math.PI * 2;
    if (Math.hypot(x - centreX, y - centreY) < STARS.clearRadius) continue;
    stars.push({
      x: offsetX + x * scale,
      y: offsetY + y * scale,
      radius: radius * scale,
      alpha,
      twinkleRate,
      twinklePhase
    });
  }
  return stars;
}
