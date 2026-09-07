/**
 * Which language the app speaks, decided once from the phone's own setting.
 *
 * There is no language picker, and there should not be one. The phone already
 * carries the answer — someone has told it what language they read, usually
 * years ago — and a second setting inside one app is a second place to get it
 * wrong. So this reads the platform's ordered list of preferred languages and
 * takes the first one the app can actually speak.
 *
 * **Resolved once, at the first read, and never again.** The locale cannot
 * change while the app is open: iOS restarts an app when its language setting
 * changes, and the web build reloads. Caching it means the strings can be a
 * plain module-level lookup rather than a context every panel has to subscribe
 * to, on a screen that re-renders sixty times a second.
 *
 * **English is the fallback, and it is a real one.** Every string exists in
 * English, and a locale the app does not ship falls back to it whole rather
 * than to a half-translated screen. There is no per-string fallback for the
 * interface text — a locale file that is missing a key would not compile —
 * though the satellite briefings do fall back one entry at a time, because a
 * new fleet added to the catalogue should appear in English everywhere rather
 * than not at all outside English.
 */

/**
 * The languages the app is written in, English first.
 *
 * One entry per *language* rather than per region: `pt-BR` and `pt-PT` both
 * read the Portuguese file, and there is no separate Traditional Chinese set,
 * so `zh-Hant` reads the Simplified one. That is a real compromise and the
 * honest place to note it, rather than pretending a region tag is handled.
 */
export const LOCALES = [
  "en",
  "it",
  "es",
  "fr",
  "de",
  "pt",
  "nl",
  "ru",
  "zh",
  "ja",
  "ko",
  "ar"
] as const;

export type Locale = (typeof LOCALES)[number];

export const FALLBACK_LOCALE: Locale = "en";

/** Locales written right to left, which is the one layout question a language asks. */
const RIGHT_TO_LEFT = new Set<Locale>(["ar"]);

export function isRightToLeft(locale: Locale): boolean {
  return RIGHT_TO_LEFT.has(locale);
}

/**
 * The best supported match for an ordered list of BCP-47 tags.
 *
 * Matches on the primary subtag alone. The alternative — matching `pt-BR`
 * before `pt` — only pays off with region-specific files to match against, and
 * there are none; walking the whole preference list in order matters far more,
 * since a phone set to Catalan with Spanish second should get Spanish rather
 * than English.
 */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const primary = primarySubtag(tag);
    const match = LOCALES.find((locale) => locale === primary);
    if (match) return match;
  }
  return FALLBACK_LOCALE;
}

/** `pt-BR` -> `pt`, `zh-Hans-CN` -> `zh`, `en_US` (Apple's form) -> `en`. */
function primarySubtag(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * The languages the platform says are preferred, most preferred first.
 *
 * Three platforms, and each keeps the answer somewhere else. Nothing here
 * falls back to `Intl`: the browser and the phone both answer honestly, and
 * under a test runner `Intl` would answer with whatever locale the machine
 * running the suite happens to be set to — which is how a test suite starts
 * passing on one laptop and failing on another.
 */
function preferredLanguages(): string[] {
  const web = webLanguages();
  if (web.length > 0) return web;
  return nativeLanguages();
}

function webLanguages(): string[] {
  const navigator = (globalThis as { navigator?: Navigator }).navigator;
  if (!navigator) return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return [...navigator.languages];
  }
  return typeof navigator.language === "string" && navigator.language ? [navigator.language] : [];
}

/**
 * The phone's own setting, read through React Native's native modules.
 *
 * Wrapped, because this module is imported by the string tables and so by
 * everything: a platform that has moved these modules is a screen in the wrong
 * language, not a crash on the way to the first frame.
 */
function nativeLanguages(): string[] {
  try {
    // Required lazily rather than imported, so the web build — where this
    // module has no meaning — never pulls React Native's native module bridge
    // in at import time, and so a platform that has moved these is a wrong
    // language rather than a failure to load the app at all.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native") as {
      NativeModules?: Record<string, Record<string, unknown> | undefined>;
    };
    if (!NativeModules) return [];

    // iOS: the ordered preference list, with the single-locale form behind it.
    const settings = NativeModules.SettingsManager?.settings as
      | { AppleLanguages?: unknown; AppleLocale?: unknown }
      | undefined;
    const apple = settings?.AppleLanguages;
    if (Array.isArray(apple) && apple.length > 0) return apple.filter(isTag);
    if (isTag(settings?.AppleLocale)) return [settings.AppleLocale];

    // Android: one identifier, no preference list.
    const android = NativeModules.I18nManager?.localeIdentifier;
    if (isTag(android)) return [android];
  } catch {
    // No native modules reachable — English, and nothing said about it.
  }
  return [];
}

function isTag(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Resolved on the first read and held, for the reason given at the top. */
let current: Locale | null = null;

export function activeLocale(): Locale {
  current ??= resolveLocale(preferredLanguages());
  return current;
}

/**
 * Test seam: pins the language, or clears the pin with `undefined`.
 *
 * The suite renders every panel in every language to check that what they say
 * still fits the space they are given, which needs the locale to be settable
 * from outside.
 */
export function setLocaleForTesting(locale: Locale | undefined): void {
  current = locale ?? null;
}
