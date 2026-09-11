import { strings } from "../i18n";
import type { IntroAccessStrings, IntroElementStrings, IntroKeyStrings } from "../i18n/types";
import { CONSOLE_LABEL } from "../components/consoleLabel";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "../satellite/categories";
import type { MarkSample } from "./introFigures";

/**
 * What the app says to someone opening it for the first time, and nothing more.
 *
 * Six pages: what it does, what a mark on the sky means, the lines the
 * landmarks carry, what is coming over, the three corners, and what it is about
 * to ask the operating system for.
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
 * **The middle pages are pictures.** The overlay speaks almost entirely in
 * shapes — a body and a tail, a ring, a fainter mark, a line with arrowheads
 * and a time on it — and those pages used to describe them in paragraphs,
 * which is the one form a visual vocabulary cannot be learned in. So every
 * kind of mark is shown beside what it means, drawn by the sky's own renderer
 * from a made-up frame (`introFigures.ts`), and the passes panel is the panel's
 * own code over a made-up plan. What is on these pages is what will be on the
 * sky, and it cannot drift from it.
 *
 * The corners are still badges with no caption on the real screen — a bare
 * number in one corner, a word in another — because every word on a camera
 * view is a word over the thing someone is trying to look at. That is the right
 * trade for a panel someone has been told about once, and the wrong one for a
 * panel nobody has, so each is said once here, beside a copy of its badge.
 *
 * The words are in `src/i18n`, per language; the structure — which pages, in
 * what order, with which pictures and badges — is here, so that it cannot
 * drift between twelve translations. The pager only has to lay it out.
 */

/** One thing the operating system will ask about, and why the app needs it. */
export type IntroAccess = IntroAccessStrings;

/** One panel in a corner: the badge it wears, where it sits, and what it is. */
export type IntroElement = IntroElementStrings & {
  /**
   * Drawn as it appears on the real screen, so the page is a key to the thing
   * rather than a description of it.
   */
  badge: string;
};

/** One kind of mark, beside a drawing of it. */
export type IntroMark = IntroKeyStrings & { sample: MarkSample };

/** One colour on the key: the category, and the name the filter gives it. */
export type IntroSwatch = { category: SatelliteCategory; name: string };

export type IntroPage = {
  /** Shown as the card's title. The first page has none — see `wordmark`. */
  title?: string;
  body: string;
  /**
   * Name the app in the middle of the sky instead of titling the card, exactly
   * as the boot screen does once the intro is behind it (`BootScreen`'s own
   * `wordmark`). Only the first page says the app's name at all.
   */
  wordmark?: boolean;
  /** The marks page: each kind of mark, drawn as the sky draws it. */
  marks?: readonly IntroMark[];
  /** And under them, what the colours are for, in the filter's own words. */
  colors?: { label: string; swatches: readonly IntroSwatch[] };
  /** A landmark's line across the sky, and what its numbered callouts say, in order. */
  path?: { callouts: readonly string[] };
  /** The upcoming-passes panel shut and then open, and what each callout says. */
  passes?: { callouts: readonly string[] };
  /** The corners page, and only it, keys the panels around the sky. */
  elements?: readonly IntroElement[];
  /** The permissions page, and only it, lists what will be asked for. */
  access?: readonly IntroAccess[];
  /** A quieter line under the page, where one is worth the space. */
  footnote?: string;
};

/**
 * A sample count for the badge on the marker-count row.
 *
 * A plausible number rather than a placeholder: the badge is a copy of the
 * panel, and a panel reading `N` teaches nothing about a panel that reads `12`.
 */
const SAMPLE_MARKER_COUNT = "12";

export function introPages(): readonly IntroPage[] {
  const t = strings();
  const intro = t.intro;

  return [
    {
      wordmark: true,
      body: intro.what.body
    },
    {
      title: intro.marks.title,
      body: intro.marks.body,
      // Shape before strength before the one tier that is named: what every
      // mark says, then what some of them say, then the few worth going out for.
      marks: [
        { sample: "moving", ...intro.marks.moving },
        { sample: "parked", ...intro.marks.parked },
        { sample: "shadow", ...intro.marks.shadow },
        { sample: "landmark", ...intro.marks.landmark }
      ],
      colors: {
        label: intro.marks.colors,
        // The filter's names, so the key here and the key in the corner are the
        // same five words.
        swatches: SATELLITE_CATEGORIES.map((category) => ({
          category,
          name: t.filter.categories[category]
        }))
      }
    },
    {
      title: intro.paths.title,
      body: intro.paths.body,
      path: { callouts: [intro.paths.minutes, intro.paths.time, intro.paths.follow] },
      footnote: intro.paths.footnote
    },
    {
      title: intro.passes.title,
      body: intro.passes.body,
      passes: { callouts: [intro.passes.shut, intro.passes.open] },
      footnote: intro.passes.footnote
    },
    {
      title: intro.corners.title,
      body: intro.corners.body,
      // Clockwise from the top left, which is the order the eye goes round the
      // screen in; the bottom left is the passes panel, on the page before.
      elements: [
        { badge: SAMPLE_MARKER_COUNT, ...intro.corners.count },
        { badge: t.filter.title, ...intro.corners.filter },
        // Not translated, and said so on the row itself: the console is the
        // one panel that stays in English. See `CONSOLE_LABEL`.
        { badge: CONSOLE_LABEL, ...intro.corners.console }
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
