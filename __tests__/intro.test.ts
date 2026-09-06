import { PersistentStore } from "../src/data/persistentStore";
import {
  clearIntroSeen,
  hasSeenIntro,
  markIntroSeen,
  setIntroStoreForTesting
} from "../src/onboarding/introStore";
import { INTRO_PAGES, introButtonLabel } from "../src/onboarding/introPages";

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
});

test("the intro names every access the phone is about to ask for, and why", () => {
  const asked = INTRO_PAGES.flatMap((page) => page.access ?? []);

  // The two prompts a first launch actually produces, in the order boot raises
  // them (`requestAccess`). A prompt not explained here arrives with no reason
  // attached, which is how a permission gets refused.
  expect(asked.map((access) => access.name)).toEqual(["Camera", "Location"]);
  for (const access of asked) {
    expect(access.reason.length).toBeGreaterThan(20);
  }
});

test("nothing is listed that the phone never asks about", () => {
  // Motion is read without a prompt on the phone — the sensors this app reads
  // are not behind one, and the "Motion & Fitness" permission that looks like
  // theirs belongs to the pedometer (`readingsNeedPermission`). Listing it here
  // promised a prompt that never arrives, which is a page teaching someone to
  // distrust the next one.
  const asked = INTRO_PAGES.flatMap((page) => page.access ?? []);
  expect(asked.map((access) => access.name)).not.toContain("Motion & Fitness");

  // Still said, though: the sensors are read, and the page that says what the
  // app needs should not go quiet about the one thing it takes without asking.
  const said = INTRO_PAGES.map((page) => `${page.body} ${page.footnote ?? ""}`).join(" ");
  expect(said).toMatch(/motion sensors/i);
});

test("nothing is asked for before the app has said what it is", () => {
  // The permissions are the last page, reached by someone who now knows what
  // the app does with them.
  const asking = INTRO_PAGES.map((page) => Boolean(page.access));
  expect(asking).toEqual([false, false, true]);
  expect(INTRO_PAGES[0].title).toBe("Stare");
});

test("the button says what it does: the last page is the one that starts the app", () => {
  expect(introButtonLabel(0)).toBe("NEXT");
  expect(introButtonLabel(INTRO_PAGES.length - 1)).toBe("ALLOW ACCESS");
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
