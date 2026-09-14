import { BLOOM_FADE, CORE_FADE, FadeStop, GLOW_FADE, TAIL_FADE } from "./markerScene";
import { Skia, TileMode } from "./skia";
import type { SkColor, SkShader } from "./skia";

/**
 * The light a satellite is drawn in, as the Skia shaders that draw it.
 *
 * Shared by the two things on the phone that draw a satellite: the overlay
 * (`SatelliteMarkers`) and the boot screen's pass (`BootSky`). Both are meant to
 * be the same light — the one on the screen the app opens on is the one a person
 * is about to read against the real sky — and the way to keep them the same is
 * one gradient each rather than two copies of it.
 */

/** The fades drawn out from a mark's centre, by the scene's name for each. */
export type RadialFade = "glow" | "bloom" | "core";
export type Fade = RadialFade | "tail";

const FADES: Record<Fade, readonly FadeStop[]> = {
  tail: TAIL_FADE,
  glow: GLOW_FADE,
  bloom: BLOOM_FADE,
  core: CORE_FADE
};

/**
 * `#rrggbb` as Skia wants it, parsed once per colour rather than per marker.
 *
 * A palette is a handful of colours — five categories and their blooms, the
 * edge, the halo — against several hundred draws a frame, and the fade between
 * the day and night sets has a fixed number of steps (`daylightFractionAt`), so this cannot grow without
 * bound over a long session.
 */
const colors = new Map<string, SkColor>();
export function skiaColor(color: string): SkColor {
  const known = colors.get(color);
  if (known) return known;
  const made = Skia.Color(color);
  colors.set(color, made);
  return made;
}

/**
 * A colour faded out along a unit of distance, as a shader: along `+x` from
 * nought to one for a tail, and out from the origin to radius one for a glow,
 * a bloom or a point.
 *
 * Built once per kind and colour, bounded for the reason `skiaColor` is. The
 * fade itself is the scene's (`TAIL_FADE`, `GLOW_FADE`, `BLOOM_FADE`,
 * `CORE_FADE`); the paint's own alpha is what scales it for the mark being
 * drawn, and the canvas is what places it.
 */
const shaders = new Map<string, SkShader>();
export function fadeShader(kind: Fade, color: string): SkShader {
  const key = `${kind}:${color}`;
  const known = shaders.get(key);
  if (known) return known;

  const stops = FADES[kind];
  const base = skiaColor(color);
  const ramp = stops.map((stop) =>
    Float32Array.of(base[0], base[1], base[2], base[3] * stop.strength)
  );
  const offsets = stops.map((stop) => stop.at);
  const origin = Skia.Point(0, 0);
  const made =
    kind === "tail"
      ? Skia.Shader.MakeLinearGradient(origin, Skia.Point(1, 0), ramp, offsets, TileMode.Clamp)
      : Skia.Shader.MakeRadialGradient(origin, 1, ramp, offsets, TileMode.Clamp);
  shaders.set(key, made);
  return made;
}
