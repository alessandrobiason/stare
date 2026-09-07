import { NativeModules } from "react-native";
import {
  activeLocale,
  localeReport,
  resolveLocale,
  setLocaleForTesting
} from "../src/i18n/locale";

/**
 * How the app decides what language to speak, against the shapes the platform
 * actually hands it.
 *
 * This file exists because the first version of the detection shipped, and the
 * app came up in English on an Italian iPhone. Every one of these is a way that
 * failed, or a way it could: none of them throw, none of them log, and all of
 * them look exactly like "the phone is set to English" from the outside.
 */

/** Installs a fake native module for one test, and takes it away after. */
function withNativeModule(name: string, value: unknown, run: () => void): void {
  const modules = NativeModules as unknown as Record<string, unknown>;
  const had = name in modules;
  const previous = modules[name];
  modules[name] = value;
  setLocaleForTesting(undefined);
  try {
    run();
  } finally {
    if (had) modules[name] = previous;
    else delete modules[name];
    setLocaleForTesting("en");
  }
}

describe("reading the phone's preferred languages", () => {
  test("the new architecture keeps its constants behind getConstants()", () => {
    // The bug that shipped. `SettingsManager` is a TurboModule, so its
    // constants are behind that call rather than spread onto the module —
    // reading `.settings` directly, which is how it worked on the old
    // architecture, returns undefined on every current iPhone, and the app
    // falls back to English with nothing on screen to say why.
    withNativeModule(
      "SettingsManager",
      { getConstants: () => ({ settings: { AppleLanguages: ["it-IT", "en-GB"] } }) },
      () => {
        expect(activeLocale()).toBe("it");
        expect(localeReport().source).toBe("settingsManager");
      }
    );
  });

  test("the old architecture spreads them onto the module, and still works", () => {
    withNativeModule("SettingsManager", { settings: { AppleLanguages: ["de-DE"] } }, () => {
      expect(activeLocale()).toBe("de");
    });
  });

  test("a phone that reports only one locale rather than a list", () => {
    withNativeModule("SettingsManager", { getConstants: () => ({ settings: { AppleLocale: "fr_FR" } }) }, () => {
      expect(activeLocale()).toBe("fr");
    });
  });

  test("a module that throws is a wrong language, not a crash on the way to boot", () => {
    withNativeModule("SettingsManager", {
      getConstants: () => {
        throw new Error("no bridge");
      }
    }, () => {
      expect(() => activeLocale()).not.toThrow();
    });
  });

  test("nothing usable in the module falls through to the next source", () => {
    // An empty list, or a shape nothing recognises, must not count as an
    // answer: it has to fall through to `Intl` rather than stopping at English.
    withNativeModule("SettingsManager", { getConstants: () => ({ settings: {} }) }, () => {
      expect(localeReport().source).not.toBe("settingsManager");
    });
  });

  test("with no native module at all, the engine's own locale answers", () => {
    // Hermes is built for Apple platforms with Intl on and backed by
    // Foundation, so this reads NSLocale without a native module in the way.
    setLocaleForTesting(undefined);
    const report = localeReport();
    expect(report.source).toBe("intl");
    expect(report.tags.length).toBeGreaterThan(0);
    setLocaleForTesting("en");
  });

  test("what answered is on the console page, not left to be guessed at", () => {
    withNativeModule(
      "SettingsManager",
      { getConstants: () => ({ settings: { AppleLanguages: ["ja-JP", "en"] } }) },
      () => {
        expect(localeReport()).toEqual({
          locale: "ja",
          source: "settingsManager",
          tags: ["ja-JP", "en"]
        });
      }
    );
  });

  test("the answer is read once and held", () => {
    // The panels read it on every frame, and nothing but the picker moves it —
    // iOS restarts an app whose own language setting changed. See
    // `setLocale`, and `languageChoice.test.tsx` for the picker's half of it.
    withNativeModule("SettingsManager", { getConstants: () => ({ settings: { AppleLanguages: ["ko-KR"] } }) }, () => {
      expect(activeLocale()).toBe("ko");
      const modules = NativeModules as unknown as Record<string, unknown>;
      modules.SettingsManager = { getConstants: () => ({ settings: { AppleLanguages: ["ru-RU"] } }) };
      expect(activeLocale()).toBe("ko");
    });
  });
});

describe("matching a preference list to what the app speaks", () => {
  test("Apple's underscore form and script subtags both reduce to a language", () => {
    expect(resolveLocale(["en_US"])).toBe("en");
    expect(resolveLocale(["zh-Hans-CN"])).toBe("zh");
  });

  test("the first supported entry wins, not the first entry", () => {
    expect(resolveLocale(["ca-ES", "es-ES", "en"])).toBe("es");
  });
});
