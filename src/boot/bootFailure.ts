import { strings } from "../i18n";

/**
 * Why boot stopped, as something that can be said in any language.
 *
 * Every step of boot reaches for a different part of the phone — a permission,
 * a sensor, a download, a model — and each of them used to throw its own
 * English sentence, which then travelled all the way to the screen as an
 * `Error.message` and was printed as it stood. The result was a boot screen
 * whose title was Italian and whose reason, the only line on it worth reading,
 * was not.
 *
 * So a failure is a key from here plus, where the platform gave one, its own
 * words underneath. The key names the situation rather than the sentence: the
 * sentences live in `src/i18n/strings`, one per language, and the screen picks
 * the reader's at the moment it draws (`bootFailureText`).
 *
 * The technical detail is deliberately *not* translated. It is an AVFoundation
 * error, an HTTP status, a native exception — a thing to photograph and paste
 * into a bug report, and translating it would make it harder to search for, not
 * easier to read.
 */

/** One thing that can stop boot. */
export type BootFailureKey =
  /** The camera prompt was refused, and can be asked again. */
  | "cameraRefused"
  /** Refused for good: the switch is in the phone's settings now. */
  | "cameraBlocked"
  /** Granted, but the camera itself would not open. */
  | "cameraFailed"
  /** The location prompt was refused. */
  | "locationRefused"
  /** Granted, but location services are switched off for the whole phone. */
  | "locationOff"
  /** Granted and switched on, and still no fix. */
  | "locationUnavailable"
  /** No motion sensor: there is no attitude to aim the view with. */
  | "noMotionSensor"
  /** No magnetometer: a heading cannot be tied to north. */
  | "noMagnetometer"
  /** The sensors could not be probed at all. */
  | "sensorsUnknown"
  /** Nothing downloaded and nothing cached: there is no sky to draw. */
  | "catalogOffline"
  /** Something downloaded, and no usable orbit came out of it. */
  | "catalogEmpty"
  /** The download or the parse gave way, with the platform's reason under it. */
  | "catalogFailed"
  /** The segmentation model would not load, so nothing can be hidden behind terrain. */
  | "skyModelFailed"
  /** Anything else, including a crash after boot has finished. */
  | "unknown";

/**
 * The failures whose fix is a switch in the phone's own settings rather than
 * anything the app can do.
 *
 * A refusal that can still be asked again is in here too. Once iOS has been
 * told no it will not raise the prompt a second time, so "try again" on its
 * own is a button that fails identically — the settings page is the only route
 * back from any of these.
 */
const FIXED_IN_SETTINGS: ReadonlySet<BootFailureKey> = new Set([
  "cameraRefused",
  "cameraBlocked",
  "locationRefused",
  "locationOff"
]);

/**
 * A boot failure that knows which sentence belongs to it.
 *
 * Thrown by the boot tasks themselves — the camera, the fix, the sensor probe
 * — and carried out through `BootError.cause` to the screen. The `message` is
 * the key and the detail, which is what lands in a log; what a person reads is
 * `bootFailureText`.
 */
export class BootFailure extends Error {
  readonly key: BootFailureKey;
  /** The platform's own words, untranslated, or `null` where it gave none. */
  readonly detail: string | null;

  constructor(key: BootFailureKey, detail: string | null = null) {
    super(detail ? `${key}: ${detail}` : key);
    this.name = "BootFailure";
    this.key = key;
    this.detail = detail;
  }
}

/**
 * The failure behind whatever was thrown, or `null` for something that carries
 * no key of its own.
 *
 * Unwraps one level of `cause`, which is how a `BootError` carries the failure
 * its step threw: the outer error is the one that knows which step gave way,
 * and the inner one is the one that knows what to say about it.
 */
export function bootFailureOf(cause: unknown): BootFailure | null {
  if (cause instanceof BootFailure) return cause;
  if (cause instanceof Error && cause.cause instanceof BootFailure) return cause.cause;
  return null;
}

/**
 * What the boot screen writes under "Could not start", in the language the app
 * is in.
 *
 * Three cases, in this order: a failure with a key of its own, anything else
 * thrown with a message — a native exception, a crash after boot — which gets
 * the catch-all sentence with its own words kept underneath, and nothing at
 * all, which gets the catch-all alone.
 */
export function bootFailureText(cause: unknown): string {
  const t = strings().boot.errors;
  const failure = bootFailureOf(cause);
  if (failure) return withDetail(t[failure.key], failure.detail);

  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return withDetail(t.unknown, message || null);
}

/**
 * Whether this failure is one the phone's settings are the way out of, and so
 * whether the screen offers the button that opens them.
 *
 * Read off the key rather than off the words, because the words are a
 * translation and this is a decision about which control to draw.
 */
export function opensSettings(cause: unknown): boolean {
  const failure = bootFailureOf(cause);
  return failure !== null && FIXED_IN_SETTINGS.has(failure.key);
}

/**
 * The sentence, and the platform's own words under it where they add anything.
 *
 * Skipped when the detail is already part of the sentence — the sensors report
 * what they found as their whole reason — so a card does not say the same thing
 * twice in two languages.
 */
function withDetail(sentence: string, detail: string | null): string {
  if (!detail || sentence.includes(detail)) return sentence;
  return `${sentence}\n\n${detail}`;
}
