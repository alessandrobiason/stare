/**
 * Which language the app speaks: the phone's own setting, unless someone here
 * has said otherwise.
 *
 * The phone is asked first and is right nearly always — someone has told it
 * what language they read, usually years ago. What it cannot answer for is the
 * phone that is not the reader's: a shared one, a work one set to the language
 * of the company that issued it, or one whose owner reads a language the app
 * does not ship and would rather have their second than English. So there is a
 * picker, in the two places it can be found without hunting — the top right
 * corner of the intro, and the console's STATUS page — and what it chooses is
 * remembered on the device (`chosenLocale`) and beats every source below.
 *
 * **Resolved once and then held, and changed only by that picker.** Nothing
 * else can move it: iOS restarts an app whose language setting changed, and
 * the web build reloads. So a reading is a plain module-level lookup rather
 * than a context, and the handful of components that render words subscribe
 * with `subscribeLocale` — see `useLocale` — rather than the whole tree
 * re-rendering behind a provider at sixty frames a second.
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

import { PersistentStore, persistentStore } from "../data/persistentStore";

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

/**
 * Each language in its own words, for the picker.
 *
 * Endonyms, and untranslated: someone looking for their language in a list is
 * looking for the word they would write it with, and "Japanese" is no use to
 * anyone who cannot already read the language the list is currently in. This
 * is the one list in the app that reads the same in all twelve.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  nl: "Nederlands",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية"
};

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
  /** Picked here, by whoever is holding the phone, and remembered on it. */
  | "chosen"
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
  // no languages on it, which falls through to the next source. Node also
  // defines a global `navigator` (since Node 21) with a real `.languages`,
  // which would otherwise win here in every Jest run and any other Node
  // context this module is evaluated in — `document` is what tells the two
  // apart, since only an actual browser ever defines it.
  () => ({ source: "navigator", tags: navigatorLanguages() }),
  () => ({ source: "settingsManager", tags: appleLanguages() }),
  () => ({ source: "i18nManager", tags: androidLocale() }),
  () => ({ source: "intl", tags: intlLocale() })
];

function navigatorLanguages(): string[] {
  if (typeof document === "undefined") return [];
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
  // Ahead of every source, because it is the one answer that was given by the
  // person reading the screen rather than inferred on their behalf.
  const chosen = chosenLocale();
  if (chosen) return { locale: chosen, source: "chosen", tags: [chosen] };

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
  announce();
}

/**
 * The language chosen on this device, kept between launches.
 *
 * Written the moment the picker is used and read before anything asks the
 * platform, so a language chosen once stays chosen: an app that reverted to
 * the phone's setting on the next launch would be a picker that does not work.
 *
 * A file of two dozen bytes beside the intro flag and the catalogue — see
 * `persistentStore` for where that lands on each platform. Anything unreadable,
 * unparseable, or naming a language this build does not ship reads as no
 * choice at all, and the phone is asked as it always was.
 */
type StoredLocale = { locale: Locale };

const store = persistentStore({
  fileName: "locale.json",
  storageKey: "stare.locale"
});

/** Test seam: swaps the backing store. Pass `undefined` to restore detection. */
export function setLocaleStoreForTesting(next: PersistentStore | null | undefined): void {
  store.setForTesting(next);
}

function chosenLocale(): Locale | null {
  try {
    const raw = store.get()?.read();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const named = (parsed as Partial<StoredLocale> | null)?.locale;
    return LOCALES.find((locale) => locale === named) ?? null;
  } catch {
    return null;
  }
}

/**
 * Whoever is holding the phone says what language it should be in.
 *
 * Takes effect on the frame after this returns rather than at the next launch:
 * the components that render words subscribe below, and the intro's pages are
 * rebuilt from the new table. Storage is best effort — a device that cannot be
 * written to still changes language for this session, and asks the phone again
 * next launch, which is a better failure than a picker that appears to do
 * nothing.
 */
export function setLocale(locale: Locale): void {
  current = { locale, source: "chosen", tags: [locale] };
  try {
    store.get()?.write(JSON.stringify({ locale } satisfies StoredLocale));
  } catch {
    // Nothing to do, and nothing worth saying about it on screen.
  }
  announce();
}

/** Forgets the choice and follows the phone again. A test seam, for now. */
export function clearChosenLocale(): void {
  try {
    store.get()?.remove();
  } catch {
    // Unreachable either way.
  }
  current = null;
  announce();
}

/**
 * Told when the language changes, which is the only time it ever does.
 *
 * A set of callbacks rather than a React context: the scene under these panels
 * re-renders at display rate, and a provider around it would put every word on
 * screen behind that render. What subscribes is `useLocale`, in the four or
 * five components that actually say something.
 */
const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(): void {
  // A copy, so a listener that unsubscribes as it is called does not skip the
  // one behind it.
  for (const listener of [...listeners]) listener();
}

