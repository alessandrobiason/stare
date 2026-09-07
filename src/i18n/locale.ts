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
 *
 * **Asking the platform is the part that is easy to get wrong.** There is no
 * one API for this, the ones that exist move between React Native's two
 * architectures, and every way of failing looks the same from the outside: an
 * app in English on a phone that is not. So several sources are tried in
 * order, each is named, and which one answered is on the console's STATUS page
 * (`localeReport`) rather than left to be guessed at from a screenshot.
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

/** Where a list of preferred languages came from, for the console page. */
export type LocaleSource =
  | "navigator"
  | "settingsManager"
  | "i18nManager"
  | "intl"
  | "none"
  | "pinned";

/** What the app asked the platform, and what came back. */
export type LocaleReport = {
  locale: Locale;
  source: LocaleSource;
  /** Every tag the winning source offered, in its own order. */
  tags: readonly string[];
};

type Attempt = { source: LocaleSource; tags: string[] };

/**
 * Every way of asking, in the order they are asked.
 *
 * Ordered by how much each one knows rather than by how likely it is to
 * answer. The first two return the whole preference list, which is what lets a
 * phone set to Catalan-then-Spanish get Spanish; `Intl` knows only the one
 * locale at the top of that list, so it goes last even though on a current
 * iPhone it is the one that always works.
 */
const SOURCES: readonly (() => Attempt)[] = [
  // The web build, and nothing else: React Native defines a `navigator` with
  // no languages on it, which falls through to the next source.
  () => ({ source: "navigator", tags: navigatorLanguages() }),
  () => ({ source: "settingsManager", tags: appleLanguages() }),
  () => ({ source: "i18nManager", tags: androidLocale() }),
  () => ({ source: "intl", tags: intlLocale() })
];

function navigatorLanguages(): string[] {
  const navigator = (globalThis as { navigator?: Navigator }).navigator;
  if (!navigator) return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages.filter(isTag);
  }
  return isTag(navigator.language) ? [navigator.language] : [];
}

/**
 * iOS: `NSLocale.preferredLanguages`, by way of React Native's settings module.
 *
 * **Read through `getConstants()`.** `SettingsManager` is a TurboModule, and a
 * TurboModule's constants are behind that call rather than spread onto the
 * module object. Reading `NativeModules.SettingsManager.settings` — which is
 * how this worked under the old architecture, and how it is still written in a
 * good deal of advice about it — returns `undefined` on the new one, and an
 * app that silently falls back to English on every current iPhone.
 *
 * Both forms are tried, because the old architecture is still a thing this
 * could be built against, and the flattened one costs a property read.
 */
function appleLanguages(): string[] {
  const settings = nativeModule("SettingsManager");
  if (!settings) return [];

  const constants = call(settings, "getConstants") ?? settings;
  const values = (constants as { settings?: Record<string, unknown> }).settings;
  if (!values) return [];

  const preferred = values.AppleLanguages;
  if (Array.isArray(preferred)) {
    const tags = preferred.filter(isTag);
    if (tags.length > 0) return tags;
  }
  return isTag(values.AppleLocale) ? [values.AppleLocale] : [];
}

/** Android: one identifier, no preference list. */
function androidLocale(): string[] {
  const manager = nativeModule("I18nManager");
  const constants = manager ? (call(manager, "getConstants") ?? manager) : undefined;
  const identifier = (constants as { localeIdentifier?: unknown } | undefined)?.localeIdentifier;
  return isTag(identifier) ? [identifier] : [];
}

/**
 * The engine's own idea of the locale, which on a phone is the system's.
 *
 * Hermes is built for Apple platforms with `HERMES_ENABLE_INTL` on and backs
 * `Intl` with Foundation, so this reads `NSLocale` without a native module in
 * the way — which makes it the source that keeps working when the ones above
 * are moved or renamed between React Native versions.
 *
 * It is also why the suite pins a locale of its own (`jest.setup.ts`): left
 * alone this would answer with whatever language the machine running the tests
 * happens to be set to, and English assertions would pass or fail by laptop.
 */
function intlLocale(): string[] {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return isTag(locale) ? [locale] : [];
  } catch {
    return [];
  }
}

/**
 * One of React Native's native modules, or `undefined` off a phone.
 *
 * Required lazily rather than imported, so the web build — where this module
 * has no meaning — never pulls the native module bridge in at import time, and
 * so a platform that has moved these is a wrong language rather than a failure
 * to load the app at all.
 */
function nativeModule(name: string): object | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require("react-native") as {
      NativeModules?: Record<string, object | undefined>;
    };
    return NativeModules?.[name];
  } catch {
    return undefined;
  }
}

/** Calls a method if the object has one, swallowing a module that throws. */
function call(target: object, method: string): object | undefined {
  const fn = (target as Record<string, unknown>)[method];
  if (typeof fn !== "function") return undefined;
  try {
    const result = (fn as () => unknown).call(target);
    return typeof result === "object" && result !== null ? result : undefined;
  } catch {
    return undefined;
  }
}

function isTag(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Resolved on the first read and held, for the reason given at the top. */
let current: LocaleReport | null = null;

function detect(): LocaleReport {
  for (const ask of SOURCES) {
    const { source, tags } = ask();
    if (tags.length > 0) return { locale: resolveLocale(tags), source, tags };
  }
  return { locale: FALLBACK_LOCALE, source: "none", tags: [] };
}

export function activeLocale(): Locale {
  return localeReport().locale;
}

/**
 * The whole answer, for the console's STATUS page.
 *
 * An app in the wrong language looks identical whichever way the detection
 * failed, and none of the ways are visible from a screenshot of the sky. This
 * is one row that says which source answered and what it said.
 */
export function localeReport(): LocaleReport {
  current ??= detect();
  return current;
}

/**
 * Test seam: pins the language, or clears the pin with `undefined`.
 *
 * The suite renders every panel in every language to check that what they say
 * still fits the space they are given, which needs the locale to be settable
 * from outside. `jest.setup.ts` also pins English for the tests that assert it,
 * so that no source above can answer with the host machine's own language.
 */
export function setLocaleForTesting(locale: Locale | undefined): void {
  current = locale ? { locale, source: "pinned", tags: [locale] } : null;
}
