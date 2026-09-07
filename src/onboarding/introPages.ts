import { strings } from "../i18n";
import type { IntroAccessStrings, IntroElementStrings } from "../i18n/types";
import { CONSOLE_LABEL } from "../components/consoleLabel";

/**
 * What the app says to someone opening it for the first time, and nothing more.
 *
 * Four pages: what it does, how to hold it, what the panels around the sky
 * are, and what it is about to ask the operating system for.
 *
 * That last one is the reason this screen exists at all. Boot asks for the
 * camera and then for a fix within a second of the app opening (`bootTasks`,
 * in that order) — two system prompts, back to back, over a screen that has
 * never explained what either of them is for. A prompt answered without
 * knowing why it was asked is usually answered "no", and both are fatal to a
 * view that places objects in the sky by knowing where you are and where you
 * are pointing.
 *
 * Two, not three. The phone's motion sensors are read without a prompt of
 * their own — see `readingsNeedPermission` — so they are described rather than
 * listed: naming an access that never appears teaches someone to expect a
 * prompt that is not coming, and the page is only worth having if it matches
 * what happens next.
 *
 * **The third page is the chrome.** Everything around the sky is a badge with
 * no caption — a bare number in one corner, a word in another — because the
 * screen is a camera view and every word on it is a word over the thing
 * someone is trying to look at. That is the right trade for a panel someone
 * has been told about once, and the wrong one for a panel nobody has: a `12`
 * in the corner of a photograph of the sky says nothing at all about what it
 * counts. So it is said once, here, beside a copy of each badge as it appears
 * on the real screen.
 *
 * The words are in `src/i18n`, per language; the structure — which pages,
 * in what order, wearing which badges — is here, so that it cannot drift
 * between twelve translations. The pager below it only has to lay text out.
 */

/** One thing the operating system will ask about, and why the app needs it. */
export type IntroAccess = IntroAccessStrings;

/** One panel on the sky: the badge it wears, where it sits, and what it is. */
export type IntroElement = IntroElementStrings & {
  /**
   * Drawn as it appears on the real screen, so the page is a key to the thing
   * rather than a description of it.
   */
  badge: string;
};

export type IntroPage = {
  /** Shown as the card's title. The first page has none — see `wordmark`. */
  title?: string;
  body: string;
  /** The permissions page, and only it, lists what will be asked for. */
  access?: readonly IntroAccess[];
  /** The screen page, and only it, keys the panels around the sky. */
  elements?: readonly IntroElement[];
  /** A quieter line under the page, where one is worth the space. */
  footnote?: string;
  /**
   * Name the app in the middle of the sky instead of titling the card, exactly
   * as the boot screen does once the intro is behind it (`BootScreen`'s own
   * `wordmark`). Only the first page says the app's name at all.
   */
  wordmark?: boolean;
};

/**
 * A sample count for the badge on the marker-count row.
 *
 * A plausible number rather than a placeholder: the badge is a copy of the
 * panel, and a panel reading `N` teaches nothing about a panel that reads `12`.
 */
const SAMPLE_MARKER_COUNT = "12";

/** The badge for a marker on the sky — the same filled dot the overlay draws. */
const MARKER_BADGE = "●";

export function introPages(): readonly IntroPage[] {
  const t = strings();
  const intro = t.intro;

  return [
    {
      wordmark: true,
      body: intro.what.body
    },
    {
      title: intro.holding.title,
      body: intro.holding.body
    },
    {
      title: intro.screen.title,
      body: intro.screen.body,
      elements: [
        { badge: SAMPLE_MARKER_COUNT, ...intro.screen.count },
        { badge: t.filter.title, ...intro.screen.filter },
        { badge: MARKER_BADGE, ...intro.screen.marker },
        // Not translated, and said so on the row itself: the console is the
        // one panel that stays in English. See `CONSOLE_LABEL`.
        { badge: CONSOLE_LABEL, ...intro.screen.console }
      ]
    },
    {
      title: intro.access.title,
      body: intro.access.body,
      access: [intro.access.camera, intro.access.location],
      footnote: intro.access.footnote
    }
  ];
}

/** The button under the pager: the last page is the one that starts the app. */
export function introButtonLabel(page: number): string {
  const t = strings().intro;
  return page === introPages().length - 1 ? t.allowAccess : t.next;
}
