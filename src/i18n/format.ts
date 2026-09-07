import { fill, strings } from "./index";
import { activeLocale, Locale } from "./locale";

/**
 * The figures on the satellite card, in the reader's own conventions.
 *
 * A number is not language-independent. `1,240` is twelve hundred to an
 * English reader and one-point-two-four to a German one, and `7.6 km/s` is
 * `7,6 km/s` across most of Europe — a decimal point read as a thousands
 * separator is a factor of a thousand, which is the sort of mistake worth a
 * module of its own.
 *
 * Digits stay Latin everywhere, including in Arabic. The marker count in the
 * corner is a bare JavaScript number and always will be, and one screen that
 * counts in `12` while its card measures in `١٢٤٠` is worse than either
 * convention held to consistently.
 */

/** Grouped whole number: 35786 -> `35,786`, `35.786`, `35 786`. */
export function groupNumber(value: number, locale: Locale = activeLocale()): string {
  return numberFormat(value, locale, 0, 0) ?? Math.round(value).toString().replace(GROUPS, ",");
}

/** Thousands, from the right — the fallback when the platform has no `Intl`. */
const GROUPS = /\B(?=(\d{3})+(?!\d))/g;

/** One decimal place, for a speed. */
function oneDecimal(value: number, locale: Locale = activeLocale()): string {
  return numberFormat(value, locale, 1, 1) ?? value.toFixed(1);
}

/**
 * `Intl` where the platform has it, `null` where it does not.
 *
 * Hermes and every browser this runs in carry `Intl`, but a formatter is not
 * something to let throw on the way to drawing a card: the fallbacks above are
 * English conventions, which is the right thing to be wrong in.
 */
function numberFormat(
  value: number,
  locale: Locale,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): string | null {
  try {
    // The `-u-nu-latn` extension pins the digits, for the reason at the top.
    return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
      minimumFractionDigits,
      maximumFractionDigits
    }).format(value);
  } catch {
    return null;
  }
}

/**
 * A distance in whole kilometres.
 *
 * Whole kilometres throughout: the figures run from a few hundred to the
 * thirty-six thousand of the geostationary belt, and a satellite's own
 * position moves by kilometres between two frames of the card anyway.
 */
export function kilometres(value: number): string {
  return fill(strings().units.km, { value: groupNumber(value) });
}

export function speed(kmPerSecond: number): string {
  return fill(strings().units.kmPerSecond, { value: oneDecimal(kmPerSecond) });
}

/**
 * How long one orbit takes, in the units that make it readable: minutes for
 * anything in low orbit, hours and minutes once a period runs past a couple of
 * hours — a geostationary object comes out at a day, which is the whole reason
 * it appears to hold still.
 */
export function orbitPeriod(minutes: number): string {
  const t = strings();
  if (!Number.isFinite(minutes) || minutes <= 0) return t.units.unknown;
  if (minutes < 120) return fill(t.units.minutes, { value: groupNumber(minutes) });
  const whole = Math.round(minutes);
  return fill(t.units.hoursMinutes, {
    hours: groupNumber(Math.floor(whole / 60)),
    minutes: (whole % 60).toString()
  });
}

/** The eight-point compass direction a bearing falls in, in the local compass. */
export function compassPoint(azimuthDeg: number): string {
  const points = strings().compass;
  const sector = Math.round(azimuthDeg / 45) % points.length;
  return points[(sector + points.length) % points.length];
}

/**
 * Where to point yourself: the compass bearing, and how far up from there.
 *
 * The bearing is given as a compass point as well as a number, because a
 * number on its own is only useful to someone already holding a compass — and
 * the elevation is worded rather than signed, since a satellite that has set
 * is below the horizon rather than at a negative angle.
 */
export function lookDirection(look: { azimuthDeg: number; elevationDeg: number }): string {
  const t = strings();
  const bearing = `${compassPoint(look.azimuthDeg)} ${Math.round(look.azimuthDeg)}°`;
  const elevation =
    look.elevationDeg >= 0
      ? fill(t.units.up, { degrees: Math.round(look.elevationDeg) })
      : fill(t.units.below, { degrees: Math.round(-look.elevationDeg) });
  return `${bearing} · ${elevation}`;
}
