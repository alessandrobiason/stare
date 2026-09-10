import { NakedEyeVerdict, SkyDarkness } from "../satellite/nakedEye";
import { fill, strings } from "./index";
import { activeLocale, Locale, LocaleReport, localeReport } from "./locale";

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

/**
 * A clock time, in the reader's own convention: `21:14` or `9:14 PM`.
 *
 * The one figure written on the sky itself rather than on a card — the moment a
 * landmark reaches the point on its path the name is written at (`markerScene`).
 * A time rather than a countdown, because it is read once and remembered, and
 * because a countdown on a line redrawn sixty times a second is a number that
 * never stops moving.
 *
 * Whether that is a 24-hour clock or a 12-hour one is not something the app's
 * own language can answer. `LOCALES` is one entry per *language* — `en` covers
 * both London and Chicago, which disagree about this — so the clock is
 * formatted against the tags the platform actually offered
 * (`LocaleReport.tags`) and falls back to the language only when there are
 * none. That is the same argument the numbers above are formatted on, one level
 * further down: a time is a regional convention rather than a linguistic one,
 * and the phone knows its region even where this app does not. A language
 * chosen by hand still wins, because choosing one leaves it as the only tag.
 *
 * Digits stay Latin, for the reason at the top of this module. Not the console's
 * `clockTime` (`src/debug/format.ts`), which prints UTC to the millisecond for
 * a reader comparing it against a sensor trace: that one is a readout and this
 * one is the time to be outside by.
 *
 * The formatter is kept because building one is tens of microseconds and this
 * is called from the frame path, where the same handful of times is formatted
 * again on every frame. There is one per set of tags, and a session has one.
 */
export function clockTime(when: Date): string {
  const formatter = clockFormat(localeReport());
  if (formatter) return formatter.format(when);
  return `${when.getHours()}:${when.getMinutes().toString().padStart(2, "0")}`;
}

const clockFormats = new Map<string, Intl.DateTimeFormat | null>();

function clockFormat(report: LocaleReport): Intl.DateTimeFormat | null {
  const preferred = [...report.tags, report.locale];
  const key = preferred.join(",");
  const known = clockFormats.get(key);
  if (known !== undefined) return known;

  // The platform's own tags first, then the language on its own: `Intl` throws
  // on the whole list if the first tag in it is malformed, and a tag arrives
  // here as whatever the platform put in it.
  const made = timeFormat(preferred) ?? timeFormat([report.locale]);
  clockFormats.set(key, made);
  return made;
}

function timeFormat(tags: readonly string[]): Intl.DateTimeFormat | null {
  try {
    // The `-u-nu-latn` extension pins the digits, as above.
    return new Intl.DateTimeFormat(
      tags.map((tag) => `${tag}-u-nu-latn`),
      { hour: "numeric", minute: "2-digit" }
    );
  } catch {
    return null;
  }
}

/**
 * Whether this object can be seen from here, right now, in one line.
 *
 * The question the whole card leads up to, and the one the overlay had no way
 * of answering: a satellite is sunlight bounced off metal, so it needs the sun
 * on it and darkness underneath it, and for most of the day neither the marker
 * nor any figure beside it said which of those was missing.
 *
 * The brightness is appended only where there is one to append and it is the
 * thing being judged. An object in the Earth's shadow has no magnitude worth
 * printing — it is reflecting nothing, and the arithmetic says so by running
 * off to infinity — and in daylight the sky rules out every object overhead
 * whatever its own brightness, so a figure there would be a number offered in
 * support of a sentence that does not rest on it. See
 * `src/satellite/nakedEye.ts`.
 */
export function seeing(look: {
  nakedEye: NakedEyeVerdict;
  apparentMagnitude: number | null;
  magnitudeMeasured: boolean;
}): string {
  const t = strings().card.seeing;
  const verdict = t[look.nakedEye];
  const magnitude = look.apparentMagnitude;
  if (!JUDGED_ON_BRIGHTNESS.has(look.nakedEye)) return verdict;
  if (magnitude === null || !Number.isFinite(magnitude)) return verdict;

  // Hedged where the standard magnitude behind it is an estimate from the size
  // and class of the spacecraft rather than somebody's observation.
  const figure = fill(look.magnitudeMeasured ? t.magnitude : t.aboutMagnitude, {
    value: oneDecimal(magnitude)
  });
  return `${verdict} · ${figure}`;
}

/**
 * Whether any of what is drawn can actually be seen, in one line.
 *
 * The count in the corner is a fact about the overlay: this many marks are on
 * the picture. That is not the same fact as "this many satellites are up there
 * to look at", and for most of the day the two are as far apart as they get —
 * at noon the frame carries seventy marks and the sky above it is empty to the
 * eye, because a satellite is sunlight bounced off metal and the sun is
 * drowning all of it.
 *
 * So the panel that opens to say *what* the marks are says this first, in the
 * order the two questions matter: is it dark enough here to see anything at
 * all, and are the objects themselves in the sunlight. See `SceneStatus`.
 */
export function sunlightSummary(sky: {
  count: number;
  sunlit: number;
  darkness: SkyDarkness;
}): string {
  const t = strings().scene.sunlight;
  if (sky.darkness === "daylight") return t.daylight;
  if (sky.sunlit === 0) return t.none;
  return sky.sunlit === sky.count ? t.all : fill(t.some, { count: sky.sunlit });
}

/** The verdicts that rest on a magnitude, and so are worth printing one beside. */
const JUDGED_ON_BRIGHTNESS = new Set<NakedEyeVerdict>(["visible", "binoculars", "tooFaint"]);

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
