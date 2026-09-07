import { useSyncExternalStore } from "react";
import { activeLocale, Locale, subscribeLocale } from "../i18n/locale";

/**
 * The language the app is currently speaking, and a re-render when it changes.
 *
 * The locale is a module-level lookup rather than a context (`src/i18n/locale.ts`),
 * which is what keeps `strings()` free to be called from a component that
 * renders every animation frame. The cost of that is a component holding a
 * translated string has nothing to tell it the string has changed — so the
 * few that render words call this, and only they re-render when the picker is
 * used.
 *
 * Where a component is memoised, or sits under one that is, this is what gets
 * the new language through the barrier: `CategoryLegend` is `React.memo`, and
 * its props do not change when the language does.
 *
 * The same snapshot serves the server render: the tests render these panels to
 * static markup, and `useSyncExternalStore` throws there without one.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, activeLocale, activeLocale);
}
