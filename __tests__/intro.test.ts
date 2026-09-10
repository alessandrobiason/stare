import { PersistentStore } from "../src/data/persistentStore";
import {
  clearIntroSeen,
  hasSeenIntro,
  markIntroSeen,
  setIntroStoreForTesting
} from "../src/onboarding/introStore";
import { introButtonLabel, introPages } from "../src/onboarding/introPages";
import { LOCALES, setLocaleForTesting } from "../src/i18n";

/** Stands in for the device's file system, and survives a simulated restart. */
function fakeDevice(): PersistentStore & { contents: string | null } {
  return {
    contents: null,
    read() {
      return this.contents;
    },
    write(next: string) {
      this.contents = next;
    },
    remove() {
      this.contents = null;
    }
  };
}

afterEach(() => {
  setIntroStoreForTesting(undefined);
  setLocaleForTesting(undefined);
});

test("the intro names every access the phone is about to ask for, and why", () => {
  const asked = introPages().flatMap((page) => page.access ?? []);

  // The two prompts a first launch actually produces, in the order boot raises
  // them (`requestAccess`). A prompt not explained here arrives with no reason
  // attached, which is how a permission gets refused.
  expect(asked.map((access) => access.name)).toEqual(["Camera", "Location"]);
  for (const access of asked) {
    expect(access.reason.length).toBeGreaterThan(20);
  }
});

test("and does so in every language, in the same order", () => {
  // The structure is built once in `introPages` and only the words come from
  // the locale, so this is a check that no translation quietly dropped one of
  // the two reasons — an access named with nothing after it is a prompt with
  // no explanation, which is the one thing this screen exists to prevent.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const asked = introPages().flatMap((page) => page.access ?? []);

    expect(asked).toHaveLength(2);
    for (const access of asked) {
      // Two characters is a real name in Chinese and Korean (相机, 위치); the
      // bound is only here to catch an empty or placeholder entry.
      expect(access.name.length).toBeGreaterThanOrEqual(2);
      // Long enough to be a reason rather than a restatement of the name. The
      // Chinese and Japanese pages say the same thing in far fewer characters
      // than the English one, which is why this is not the English bound.
      expect(access.reason.length).toBeGreaterThan(12);
    }
  }
});

test("nothing is listed that the phone never asks about", () => {
  // Motion is read without a prompt on the phone — the sensors this app reads
  // are not behind one, and the "Motion & Fitness" permission that looks like
  // theirs belongs to the pedometer (`readingsNeedPermission`). Listing it here
  // promised a prompt that never arrives, which is a page teaching someone to
  // distrust the next one.
  const asked = introPages().flatMap((page) => page.access ?? []);
  expect(asked.map((access) => access.name)).not.toContain("Motion & Fitness");

  // Still said, though: the sensors are read, and the page that says what the
  // app needs should not go quiet about the one thing it takes without asking.
  const said = introPages()
    .map((page) => `${page.body} ${page.footnote ?? ""}`)
    .join(" ");
  expect(said).toMatch(/motion sensors/i);
});

test("nothing is asked for before the app has said what it is", () => {
  // The permissions are the last page, reached by someone who now knows what
  // the app does with them, and what the screen they are about to see is made
  // of. Same shape in every language: the order is the structure's, not the
  // translation's.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const pages = introPages();

    expect(pages.map((page) => Boolean(page.access))).toEqual([false, false, false, false, true]);
    // The first page names the app in the middle of the sky rather than in the
    // card's title — see `wordmark`.
    expect(pages[0].wordmark).toBe(true);
    expect(pages[0].title).toBeUndefined();
    // Every other page is titled, or it is a wall of text with nothing to say
    // what it is about.
    for (const page of pages.slice(1)) expect(page.title).toBeTruthy();
  }
});

test("the middle pages are the key to the panels, and key all five of them", () => {
  // The complaint these pages answer: a bare number in the corner of a camera
  // view says nothing about what it counts. Every panel that carries a badge
  // rather than a caption has to be on one of them — and each row has to show
  // the badge as the real screen wears it, or it is a description rather than a
  // key. Five is the number of panels the overlay draws; a sixth added to the
  // screen and not to these pages is a badge nobody is ever told about.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const elements = introPages().flatMap((page) => page.elements ?? []);

    expect(elements).toHaveLength(5);
    // The three that report on the sky, then the two that are worked rather
    // than read. `any` for the two whose badge is the panel's own translated
    // word — the filter's title, and the countdown the passes pill carries.
    expect(elements.map((element) => element.badge)).toEqual([
      "12",
      expect.any(String),
      "●",
      expect.any(String),
      "CONSOLE"
    ]);
    for (const element of elements) {
      expect(element.where.length).toBeGreaterThan(1);
      expect(element.meaning.length).toBeGreaterThan(15);
    }
  }
});

test("the badges are copies of the panels rather than placeholders", () => {
  // Each row is a key: the badge has to be what the screen actually wears, in
  // the language being read, or the page is a description of a panel rather
  // than a picture of one. The two that come from the string table are the ones
  // that can silently drift — the filter's own title, and the countdown the
  // upcoming-passes pill carries.
  setLocaleForTesting("de");
  const badges = introPages().flatMap((page) => page.elements ?? []).map((one) => one.badge);

  expect(badges).toContain("FILTER");
  // `{value} Min.` filled with the sample: the right half of `ISS · 14 Min.`.
  expect(badges).toContain("14 Min.");
});

test("the button says what it does: the last page is the one that starts the app", () => {
  expect(introButtonLabel(0)).toBe("NEXT");
  expect(introButtonLabel(introPages().length - 1)).toBe("ALLOW ACCESS");

  // And says something different on the last page in every language, since
  // that is the button the system's own prompts come out from behind.
  for (const locale of LOCALES) {
    setLocaleForTesting(locale);
    const last = introPages().length - 1;
    expect(introButtonLabel(last)).not.toBe(introButtonLabel(0));
  }
});

test("the intro is shown once, and not again after the app is closed", () => {
  const device = fakeDevice();
  setIntroStoreForTesting(device);

  expect(hasSeenIntro()).toBe(false);
  markIntroSeen();
  expect(hasSeenIntro()).toBe(true);

  // Closing and reopening the app: everything held in memory is gone, the
  // device's storage is not. This is the case the flag exists for.
  setIntroStoreForTesting(undefined);
  setIntroStoreForTesting(device);
  expect(hasSeenIntro()).toBe(true);

  clearIntroSeen();
  expect(hasSeenIntro()).toBe(false);
});

test("an unreadable device shows the intro rather than skipping the explanation", () => {
  // A half-written entry, or no storage at all. Erring towards showing it again
  // costs three pages; erring the other way opens straight into three system
  // prompts nobody has been told the reason for.
  const device = fakeDevice();
  device.contents = "{ not json";
  setIntroStoreForTesting(device);
  expect(hasSeenIntro()).toBe(false);

  device.contents = JSON.stringify({ seenAtMs: "yesterday" });
  expect(hasSeenIntro()).toBe(false);

  setIntroStoreForTesting(null);
  expect(hasSeenIntro()).toBe(false);
  // And a write that goes nowhere is not a crash on the way into the app.
  expect(() => markIntroSeen()).not.toThrow();
});
