import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { IntroScreen } from "../src/components/IntroScreen";
import { LanguagePicker } from "../src/components/LanguagePicker";
import { PersistentStore } from "../src/data/persistentStore";
import {
  activeLocale,
  clearChosenLocale,
  localeReport,
  setLocale,
  setLocaleForTesting,
  setLocaleStoreForTesting,
  subscribeLocale
} from "../src/i18n/locale";

/**
 * A whole screen, mounted the way the app mounts one.
 *
 * Anything that lays its panels out in the safe area needs the provider that
 * knows where the notch is (`SafeAreaLayer`), and it needs to be told the
 * insets rather than left to measure them: a static render runs no effects, so
 * a provider that has not been handed any would render nothing at all. Zero on
 * every edge, which is what a browser reports and what the harness runs
 * against.
 */
function onAScreen(screen: React.ReactElement): React.ReactElement {
  return (
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 }
      }}
    >
      {screen}
    </SafeAreaProvider>
  );
}

/**
 * Changing the language from inside the app.
 *
 * The phone decides it, and is right nearly always — but the launch where it
 * is wrong is the launch where every word on screen is in a language the
 * reader may not have, including the words that would explain how to fix it.
 * The way out is the intro's corner (`LanguagePicker`), and a choice that
 * outlives the launch it was made in.
 */

/** The rendered element as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/** A device's storage, in memory: what was written to it, and nothing else. */
function fakeStore(initial: string | null = null): PersistentStore & { contents: string | null } {
  const store = {
    contents: initial,
    read: () => store.contents,
    write: (contents: string) => {
      store.contents = contents;
    },
    remove: () => {
      store.contents = null;
    }
  };
  return store;
}

afterEach(() => {
  setLocaleStoreForTesting(undefined);
  setLocaleForTesting(undefined);
});

describe("the picker in the corner of the intro", () => {
  test("says the language it is currently in, in that language", () => {
    // Not the word "Language" translated: someone looking for their own
    // language is looking for the word they write it with, and the label of a
    // control they cannot read is no help at all.
    setLocaleForTesting("it");
    expect(textOf(<LanguagePicker />)).toContain("Italiano");

    setLocaleForTesting("ja");
    expect(textOf(<LanguagePicker />)).toContain("日本語");
  });

  test("is a list of twelve that is only a list when it is asked for", () => {
    // Closed, it is one pill in a corner of a screen whose whole middle is the
    // sky the app is about to draw.
    const closed = textOf(<LanguagePicker />);

    expect(closed).toContain("English");
    expect(closed).not.toContain("Nederlands");
    expect(closed).not.toContain("العربية");
  });

  test("is on the intro itself, which is the screen that most needs it", () => {
    // Six pages to be read, and no way past them but reading one: a wrongly
    // detected language costs the whole of onboarding at once.
    setLocaleForTesting("it");
    const markup = renderToStaticMarkup(onAScreen(<IntroScreen onDone={() => undefined} />));

    expect(markup).toContain('aria-label="Lingua: Italiano"');
  });

  test("names itself in the reader's own language for anyone not seeing it", () => {
    setLocaleForTesting("it");
    const markup = renderToStaticMarkup(<LanguagePicker />);

    expect(markup).toContain('aria-label="Lingua: Italiano"');
  });
});

describe("what the choice is worth after it is made", () => {
  test("it is remembered on the device, or the picker did nothing", () => {
    const store = fakeStore();
    setLocaleStoreForTesting(store);

    setLocale("de");

    expect(store.contents).toBe('{"locale":"de"}');
  });

  test("and read back ahead of whatever the phone says its language is", () => {
    setLocaleStoreForTesting(fakeStore('{"locale":"ko"}'));
    setLocaleForTesting(undefined);

    expect(localeReport()).toEqual({ locale: "ko", source: "chosen", tags: ["ko"] });
  });

  test("nonsense in storage is no choice at all, not a broken launch", () => {
    // A half-written file, or a language dropped from a later build. Either
    // way the phone is asked as it always was.
    for (const contents of ["", "{", '{"locale":"is"}', '{"locale":42}', "null"]) {
      setLocaleStoreForTesting(fakeStore(contents));
      setLocaleForTesting(undefined);

      expect(localeReport().source).not.toBe("chosen");
    }
  });

  test("a device that cannot be written to still changes language now", () => {
    // Out of space, or storage the platform will not give us. The cost of the
    // failed write is being asked again next launch, which is a great deal
    // better than a picker that appears to do nothing.
    setLocaleStoreForTesting({
      read: () => null,
      write: () => {
        throw new Error("no space left on device");
      },
      remove: () => undefined
    });

    expect(() => setLocale("es")).not.toThrow();
    expect(activeLocale()).toBe("es");
  });

  test("forgetting it follows the phone again", () => {
    const store = fakeStore('{"locale":"ru"}');
    setLocaleStoreForTesting(store);
    setLocaleForTesting(undefined);
    expect(activeLocale()).toBe("ru");

    clearChosenLocale();

    expect(store.contents).toBeNull();
    expect(localeReport().source).not.toBe("chosen");
  });

  test("the panels that say something are told, since nothing else would", () => {
    // The locale is a module-level lookup rather than a context — see
    // `useLocale`, and the scene that re-renders sixty times a second under
    // it. This is the whole of what makes a change visible without a relaunch.
    setLocaleStoreForTesting(fakeStore());
    const heard: string[] = [];
    const unsubscribe = subscribeLocale(() => heard.push(activeLocale()));

    setLocale("nl");
    setLocale("pt");
    unsubscribe();
    setLocale("zh");

    expect(heard).toEqual(["nl", "pt"]);
  });
});
