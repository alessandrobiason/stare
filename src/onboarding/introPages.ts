/**
 * What the app says to someone opening it for the first time, and nothing more.
 *
 * Three pages: what it does, how to hold it, and what it is about to ask the
 * operating system for. That last one is the reason this exists at all. Boot
 * asks for the camera and then for a fix within a second of the app opening
 * (`bootTasks`, in that order) — two system prompts, back to back, over a
 * screen that has never explained what either of them is for. A prompt answered
 * without knowing why it was asked is usually answered "no", and both are fatal
 * to a view that places objects in the sky by knowing where you are and where
 * you are pointing.
 *
 * Two, not three. The phone's motion sensors are read without a prompt of their
 * own — see `readingsNeedPermission` — so they are described rather than listed:
 * naming an access that never appears teaches someone to expect a prompt that
 * is not coming, and the page is only worth having if it matches what happens
 * next.
 *
 * The copy is here rather than in the component for the same reason the boot
 * sky's geometry is not in its canvas: what is said is worth reading and
 * testing on its own, and the pager below it only has to lay out text.
 */

/** One thing the operating system will ask about, and why the app needs it. */
export type IntroAccess = {
  /** As the iOS prompt names it, so the two read as the same request. */
  name: string;
  reason: string;
};

export type IntroPage = {
  /** Shown as the card's title. The first page has none — see `wordmark`. */
  title?: string;
  body: string;
  /** The permissions page, and only it, lists what will be asked for. */
  access?: readonly IntroAccess[];
  /** A quieter line under the page, where one is worth the space. */
  footnote?: string;
  /**
   * Name the app in the middle of the sky instead of titling the card, exactly
   * as the boot screen does once the intro is behind it (`BootScreen`'s own
   * `wordmark`). Only the first page says the app's name at all.
   */
  wordmark?: boolean;
};

export const INTRO_PAGES: readonly IntroPage[] = [
  {
    wordmark: true,
    body:
      "Point the phone at the sky. The satellites passing over you are drawn onto " +
      "the picture where they actually are."
  },
  {
    title: "Hold it up, turn slowly",
    body:
      "Every mark is one object: its colour says what the satellite is for, its size " +
      "how far away it is. Anything behind a " +
      "building or a tree is left out rather than drawn over it."
  },
  {
    title: "What it needs",
    body: "Two things, and the phone will ask you about each of them in a moment.",
    access: [
      { name: "Camera", reason: "The sky in front of you, and what is standing in the way of it." },
      { name: "Location", reason: "Which satellites are above you, and where in the sky they sit." }
    ],
    footnote:
      "Which way the phone is pointed comes from its own motion sensors, which it " +
      "reads without asking. Everything here is used on the phone alone: the only " +
      "thing Stare sends or fetches is the public satellite catalogue, and where you " +
      "are never leaves the device."
  }
];

/** The button under the pager: the last page is the one that starts the app. */
export function introButtonLabel(page: number): string {
  return page === INTRO_PAGES.length - 1 ? "ALLOW ACCESS" : "NEXT";
}
