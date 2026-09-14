import { clamp } from "../math/angles";
import { FrameSize } from "./markerGeometry";
import { MARK_BLOOM, MARK_COLOR } from "./palette";

/**
 * The sky the app opens on: one satellite crossing the night above the app's
 * name, and nothing else.
 *
 * It is the logo rather than a decoration of it. `assets/icon.svg` is a single
 * point of light on a wide arc over a horizon, trailing a tail that fades to
 * nothing; this is that pass, moving. And the light is the overlay's own — the
 * same white point in the same cool bloom, faded by the same stops
 * (`COMET_FADE`, `GLOW_FADE`, `BLOOM_FADE`, `CORE_FADE`) — so what a person is
 * about to read against the real sky is already in front of them while it
 * loads.
 *
 * It used to be five solid satellites turning on five orbits around the name.
 * That was the logo as it was then — a disc with a separate solid trail — and
 * when the marks became light it was the one place left drawing them as
 * paint. Five of anything also made a diagram of it. One light is a sky.
 *
 * The motion is the whole of the loading indicator. There is no spinner, no
 * progress bar and no step list, because none of them told anyone anything
 * they could act on: the app either opens or comes back with a reason. So the
 * screen says only "something is still happening", which motion says on its
 * own, and it says it with the thing the app is for: something crossing your
 * sky.
 *
 * Nothing here knows about Skia, about a browser canvas or about React — the
 * same split as `markerScene`, and for the same reason. A pass is built once
 * and then only *turned*: its light keeps its shape as it goes along the arc, so
 * what changes per displayed frame is one angle and one alpha rather than the
 * geometry. `BootSky.tsx` draws it on the phone, `BootSky.web.tsx` in the replay
 * harness, and `tools/make-logo.mjs` holds its first frame still.
 */

/**
 * The space the composition is drawn in, in points: a phone's own frame,
 * mapped onto whatever the device's actually is by covering it. Portrait
 * because the app is portrait-only, and the light sizes below are quoted in it
 * so that they are the size on a phone that they read as here.
 */
export const BOOT_SKY_DESIGN: FrameSize = { width: 390, height: 844 };

/**
 * The night behind everything: darkest overhead, lifting towards the horizon
 * the phone is held above.
 *
 * Deliberately not a flat colour and not a glow round the middle — the old sky
 * had one, and it made the screen a spotlit stage. A sky is lighter near the
 * horizon than at the zenith, and a person holding a phone upright is looking
 * at the part of it just above the horizon.
 */
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

/**
 * One pass, in design points: an arc of a circle whose centre is below the
 * screen, so what shows is a shallow curve over the name — near enough the
 * path a satellite takes across the sky from horizon to horizon.
 */
export type BootPass = {
  /** How far from the top of the frame the arc peaks. */
  apex: number;
  radius: number;
  /** How far right of the middle the arc's centre, and so its peak, sits. */
  lean: number;
  /** 1 left to right, -1 right to left. */
  direction: 1 | -1;
};

/**
 * The passes, in the order they are flown, and then round again.
 *
 * Composed rather than random, so none of them can come out ugly: each peaks
 * well above the name, which sits at 422, and a few points' lean either way
 * keeps them from being the same arc four times. Alternate directions, because
 * real passes do not all go one way, and a run of them that did would read as a
 * progress bar.
 */
export const BOOT_PASSES: readonly BootPass[] = [
  { apex: 253, radius: 608, lean: 20, direction: 1 },
  { apex: 304, radius: 675, lean: -40, direction: -1 },
  { apex: 228, radius: 557, lean: -15, direction: 1 },
  { apex: 279, radius: 641, lean: 45, direction: -1 }
];

/** How a pass is flown. */
export const PASS_TIMING = {
  /** Seconds from one edge of the frame to the other. */
  periodSeconds: 8,
  /**
   * How far into the first pass the clock starts.
   *
   * A pass starts off the edge of the frame, and a boot can be over in two and
   * a half seconds (`MIN_BOOT_SCREEN_MS`). Starting at the edge would spend the
   * first second of that on an empty sky; starting part-way across, the light
   * is there on the first frame.
   */
  startProgress: 0.3,
  /** The share of a pass at each end over which its light fades in and out. */
  fadeShare: 0.12,
  /** How far past the frame's edge, in design points, a pass starts and ends. */
  marginPx: 40
} as const;

/**
 * The light, in design points.
 *
 * The overlay's own mark at the size a satellite would be drawn nearest, and a
 * little over — the boot screen has one light, not seventy, and can afford to
 * let it be seen. The alphas are the overlay's at full strength (`GLOW_ALPHA`,
 * `BLOOM_ALPHA` in `markerScene`); the tail is longer than a marker's twelve
 * seconds, since here it is the whole of what says which way the light is
 * going.
 */
const LIGHT = {
  coreRadius: 2.6,
  glow: { radius: 14, alpha: 0.8 },
  bloom: { radius: 40, alpha: 0.35 },
  tail: { width: 2.6, length: 130, alpha: 0.85 }
} as const;

/**
 * The star field, as the parameters that generate it.
 *
 * Generated rather than listed, and from a fixed seed, so the same sky comes
 * out of every run — the still frame in `assets/logo-extended.svg` is the same
 * picture as the first frame on the phone, rather than a similar one. Pinpricks
 * rather than dots: the stars are what the light is seen *against*, and the old
 * field's larger ones competed with the satellites.
 */
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

/** Light fading out from a centre to `radius`, at `alpha` at the centre. */
export type SkyGlow = { radius: number; alpha: number };

/**
 * The satellite, at rest at the top of its arc. Layout pixels.
 *
 * Drawn the way a mark is: the bloom, the glow, the tail, and the point over
 * them, each faded by the overlay's stop for it.
 */
export type SkyLight = {
  x: number;
  y: number;
  color: string;
  bloomColor: string;
  coreRadius: number;
  glow: SkyGlow;
  bloom: SkyGlow;
  tail: {
    /**
     * A closed polygon as flat `x, y` pairs: out along one edge from the head
     * to the tip, and back along the other. It follows the arc and tapers to
     * nothing, so it is neither a stroke nor a triangle.
     */
    points: number[];
    /** The point it tapers to, which is where `COMET_FADE` reaches nothing. */
    tipX: number;
    tipY: number;
    alpha: number;
  };
};

/** One pass across a frame. */
export type SkyPass = {
  index: number;
  /** The centre of its arc, in layout pixels. */
  cx: number;
  cy: number;
  radius: number;
  direction: 1 | -1;
  /**
   * The light's angle about the centre where the pass begins and ends, in
   * degrees — zero to the right, increasing downwards as the frame's own
   * coordinates do, so the top of the arc is -90. Both are off the frame.
   */
  fromDeg: number;
  toDeg: number;
  light: SkyLight;
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

/** Where a pass is, in its own terms. */
export type SkyMoment = { index: number; progress: number };

/** Where the light has got to: turned from rest about its arc's centre, and faded. */
export type SkyPose = { angleDeg: number; alpha: number };

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

/** Which pass is being flown after `elapsedSeconds`, and how far through it. */
export function skyMoment(elapsedSeconds: number): SkyMoment {
  const along = Math.max(0, elapsedSeconds) / PASS_TIMING.periodSeconds + PASS_TIMING.startProgress;
  const index = Math.floor(along);
  return { index, progress: along - index };
}

/**
 * The `index`th pass across the scene's frame, at rest.
 *
 * Built once per pass and then posed (`passPose`). Where it starts and ends is
 * worked out from the frame rather than the design frame: the covering scale
 * crops the sides of a wide screen's composition and not a narrow one's, and a
 * pass that started at the design frame's edge would spend a second of it
 * invisible on the one and appear out of nowhere on the other.
 */
export function skyPass(scene: BootSkyScene, index: number): SkyPass {
  const { scale, offsetX, offsetY, frame } = scene;
  const pass = BOOT_PASSES[((index % BOOT_PASSES.length) + BOOT_PASSES.length) % BOOT_PASSES.length];
  const radius = pass.radius * scale;
  const cx = offsetX + (BOOT_SKY_DESIGN.width / 2 + pass.lean) * scale;
  const cy = offsetY + (pass.apex + pass.radius) * scale;
  const margin = PASS_TIMING.marginPx * scale;

  const left = crossingDeg(cx, radius, -margin);
  const right = crossingDeg(cx, radius, frame.width + margin);

  return {
    index,
    cx,
    cy,
    radius,
    direction: pass.direction,
    fromDeg: pass.direction === 1 ? left : right,
    toDeg: pass.direction === 1 ? right : left,
    light: lightAtRest(cx, cy, radius, pass.direction, scale)
  };
}

/**
 * Where the light is `progress` of the way through its pass.
 *
 * At a constant rate, as a satellite moves, and faded in and out over the ends
 * — smoothstepped, so it arrives and leaves rather than switching on.
 */
export function passPose(pass: SkyPass, progress: number): SkyPose {
  const along = clamp(progress, 0, 1);
  const headDeg = pass.fromDeg + (pass.toDeg - pass.fromDeg) * along;
  const edge = clamp(Math.min(along, 1 - along) / PASS_TIMING.fadeShare, 0, 1);
  return {
    angleDeg: headDeg - REST_DEG,
    alpha: edge * edge * (3 - 2 * edge)
  };
}

/** How bright a star is after `elapsedSeconds`: slowly, and never far from its best. */
export function starAlpha(star: SkyStar, elapsedSeconds: number): number {
  const { depth } = STARS.twinkle;
  const wave = Math.sin(star.twinkleRate * elapsedSeconds + star.twinklePhase);
  return star.alpha * (1 - depth + depth * wave);
}

/** The top of every arc, where a pass's light is built before it is turned. */
const REST_DEG = -90;

/**
 * The angle on the upper half of a circle at which it crosses a vertical line.
 *
 * Clamped, so a line the circle does not reach gives the nearest side rather
 * than nothing — which is only possible on a frame far wider than any phone.
 */
function crossingDeg(cx: number, radius: number, x: number): number {
  return -Math.acos(clamp((x - cx) / radius, -1, 1)) * (180 / Math.PI);
}

/** Points on a circle, with the frame's y axis pointing down. */
function pointAt(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = degrees * (Math.PI / 180);
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/**
 * The light at the top of its arc, its tail laid back along the arc behind it.
 *
 * "Behind" is against the way the pass is flown, so a right-to-left pass's tail
 * lies at *increasing* angles from the head rather than decreasing ones. The
 * tail is full width at the head, under the point, and tapers to nothing at its
 * tip: the widest part is covered by the light, and what shows is a streak
 * thinning out of it.
 */
function lightAtRest(
  cx: number,
  cy: number,
  radius: number,
  direction: 1 | -1,
  scale: number
): SkyLight {
  const [x, y] = pointAt(cx, cy, radius, REST_DEG);
  const sweepDeg = ((LIGHT.tail.length * scale) / radius) * (180 / Math.PI);
  // About a degree and a half a segment: an arc this shallow is straight to
  // well inside a pixel over that.
  const steps = Math.max(16, Math.round(sweepDeg / 1.5));
  const width = LIGHT.tail.width * scale;
  const outer: number[] = [];
  const inner: number[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps;
    const degrees = REST_DEG - direction * sweepDeg * along;
    const half = (width / 2) * (1 - along);
    outer.push(...pointAt(cx, cy, radius + half, degrees));
    inner.push(...pointAt(cx, cy, radius - half, degrees));
  }

  // Back along the near edge, so the polygon closes on the head it started at.
  const returning: number[] = [];
  for (let index = inner.length - 2; index >= 0; index -= 2) {
    returning.push(inner[index], inner[index + 1]);
  }

  return {
    x,
    y,
    color: MARK_COLOR,
    bloomColor: MARK_BLOOM,
    coreRadius: LIGHT.coreRadius * scale,
    glow: { radius: LIGHT.glow.radius * scale, alpha: LIGHT.glow.alpha },
    bloom: { radius: LIGHT.bloom.radius * scale, alpha: LIGHT.bloom.alpha },
    tail: {
      points: [...outer, ...returning],
      tipX: outer[outer.length - 2],
      tipY: outer[outer.length - 1],
      alpha: LIGHT.tail.alpha
    }
  };
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
