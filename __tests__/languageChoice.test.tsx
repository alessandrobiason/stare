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
 * Changing the language from inside the app.
 *
 * The phone decides it, and is right nearly always — but the launch where it
 * is wrong is the launch where every word on screen is in a language the
 * reader may not have, including the words that would explain how to fix it.
 * The way out is the language row in settings, and a choice that outlives the
 * launch it was made in.
 */

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

describe("what the choice is worth after it is made", () => {
  test("it is remembered on the device, or the picker did nothing", () => {
    const store = fakeStore();
    setLocaleStoreForTesting(store);

    setLocale("it");

    expect(store.contents).toBe('{"locale":"it"}');
  });

  test("and read back ahead of whatever the phone says its language is", () => {
    setLocaleStoreForTesting(fakeStore('{"locale":"it"}'));
    setLocaleForTesting(undefined);

    expect(localeReport()).toEqual({ locale: "it", source: "chosen", tags: ["it"] });
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

    expect(() => setLocale("it")).not.toThrow();
    expect(activeLocale()).toBe("it");
  });

  test("forgetting it follows the phone again", () => {
    const store = fakeStore('{"locale":"it"}');
    setLocaleStoreForTesting(store);
    setLocaleForTesting(undefined);
    expect(activeLocale()).toBe("it");

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

    setLocale("it");
    setLocale("en");
    unsubscribe();
    setLocale("it");

    expect(heard).toEqual(["it", "en"]);
  });
});
