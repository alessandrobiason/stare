import { strings } from "../i18n";
import type { TourKeyStrings } from "../i18n/types";
import type { MarkSample } from "./markSamples";

/**
 * The tour of the sky view: what each step says, what it points at, and where
 * its bubble goes.
 *
 * The first launch used to open on six pages of explanation before the app had
 * shown anything — what the marks mean, the lines, the passes card, the corners,
 * the permissions — most of it about a screen nobody had seen yet. The tour
 * replaces them with a few steps over the live view, each lighting up the real
 * control beside a sentence about it, so the explanation is read against the
 * thing it explains. The operating system's prompts explain themselves
 * (`locales/`), and the compass strip and the tab bar need no explaining.
 *
 * The words are in `src/i18n`; which steps, in what order and pointing at what
 * is here, so it cannot drift between the two languages.
 */

/** The controls a step can point at. See `useTourTarget`. */
export type TourTarget = "count" | "filter" | "freeze" | "passes" | "settings";

export type TourMark = TourKeyStrings & { sample: MarkSample };

export type TourStep = {
  id: "marks" | TourTarget;
  /**
   * The control the step lights up, or `null` for the one step about the sky
   * itself: the marks are wherever the sky puts them, so that step is a key
   * laid over the middle of the view instead.
   */
  target: TourTarget | null;
  title: string;
  body: string;
  /** The key to the marks, each kind beside a drawing of it. */
  marks?: readonly TourMark[];
};

export function tourSteps(): readonly TourStep[] {
  const t = strings().tour;
  return [
    {
      id: "marks",
      target: null,
      title: t.marks.title,
      body: t.marks.body,
      marks: [
        { sample: "moving", ...t.marks.moving },
        { sample: "parked", ...t.marks.parked },
        { sample: "landmark", ...t.marks.landmark }
      ]
    },
    { id: "count", target: "count", ...t.count },
    { id: "filter", target: "filter", ...t.filter },
    // Straight after the filter, which it sits beside — and pointed at at all
    // because a pause sign says what it does to a video, not what it is for
    // here: the sky held still, so the phone can come down and be read.
    { id: "freeze", target: "freeze", ...t.freeze },
    { id: "passes", target: "passes", ...t.passes },
    { id: "settings", target: "settings", ...t.settings }
  ];
}

/**
 * The steps that can be shown right now: every step whose control is on the
 * screen. The passes card is not drawn when nothing is coming (or while a
 * satellite's card has its place), and a step lighting up an empty patch of
 * sky is worse than no step.
 */
export function availableSteps(
  steps: readonly TourStep[],
  onScreen: (target: TourTarget) => boolean
): readonly TourStep[] {
  return steps.filter((step) => step.target === null || onScreen(step.target));
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** How far the lit hole reaches past the control it lights, in points. */
export const HOLE_PADDING = 6;
/** How close the hole's ring may come to the edge of the screen. */
const HOLE_EDGE = 2;
/** The bubble's widest, and how far it keeps off the sides of the screen. */
export const BUBBLE_MAX_WIDTH = 320;
export const BUBBLE_MARGIN = 16;
/** The gap between the hole and the bubble, which the arrow spans. */
export const BUBBLE_GAP = 14;
/** How close the arrow comes to the bubble's corners, which are rounded. */
const ARROW_INSET = 18;

export type BubblePlacement = {
  /** The lit area around the control, and how round its corners are. */
  hole: Rect & { radius: number };
  left: number;
  width: number;
  /**
   * Below the control when it is in the top half of the screen, above it
   * otherwise: `top` or `bottom`, from the matching edge of the screen, since a
   * bubble above is laid out from its foot and its height is not known.
   */
  top?: number;
  bottom?: number;
  /** Which edge of the bubble the arrow is on, and how far along it. */
  arrow: { side: "top" | "bottom"; left: number };
};

/** Where a step's hole, bubble and arrow go, for a control at `target` on a `screen`. */
export function placeBubble(target: Rect, screen: Size): BubblePlacement {
  // Padded, but kept on the screen: a tab at the edge would otherwise have its
  // ring run off the side.
  const left = Math.max(HOLE_EDGE, target.x - HOLE_PADDING);
  const top = Math.max(HOLE_EDGE, target.y - HOLE_PADDING);
  const right = Math.min(screen.width - HOLE_EDGE, target.x + target.width + HOLE_PADDING);
  const bottom = Math.min(screen.height - HOLE_EDGE, target.y + target.height + HOLE_PADDING);
  const hole = { x: left, y: top, width: right - left, height: bottom - top };
  // A round control keeps its circle; anything else gets softened corners.
  const radius =
    Math.abs(hole.width - hole.height) < 4
      ? Math.min(hole.width, hole.height) / 2
      : Math.min(Math.min(hole.width, hole.height) / 2, 16);

  const width = Math.max(0, Math.min(BUBBLE_MAX_WIDTH, screen.width - BUBBLE_MARGIN * 2));
  const centreX = hole.x + hole.width / 2;
  const bubbleLeft = clamp(centreX - width / 2, BUBBLE_MARGIN, screen.width - BUBBLE_MARGIN - width);
  const arrowLeft = clamp(centreX - bubbleLeft, ARROW_INSET, width - ARROW_INSET);

  const below = hole.y + hole.height / 2 < screen.height / 2;
  return below
    ? {
        hole: { ...hole, radius },
        left: bubbleLeft,
        width,
        top: hole.y + hole.height + BUBBLE_GAP,
        arrow: { side: "top", left: arrowLeft }
      }
    : {
        hole: { ...hole, radius },
        left: bubbleLeft,
        width,
        bottom: screen.height - hole.y + BUBBLE_GAP,
        arrow: { side: "bottom", left: arrowLeft }
      };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/**
 * The step to show for `id`: that one if it is available, or else the first one
 * after it that is — so a control leaving the screen mid-tour moves the tour on
 * rather than pointing at nothing. `null` when there is nothing left to show.
 */
export function stepAt(
  steps: readonly TourStep[],
  available: readonly TourStep[],
  id: TourStep["id"]
): TourStep | null {
  const from = Math.max(0, steps.findIndex((step) => step.id === id));
  return firstAvailable(steps.slice(from), available);
}

/** The available step after `id`, or `null` at the end of the tour. */
export function stepAfter(
  steps: readonly TourStep[],
  available: readonly TourStep[],
  id: TourStep["id"]
): TourStep | null {
  const from = steps.findIndex((step) => step.id === id);
  return firstAvailable(steps.slice(from + 1), available);
}

function firstAvailable(
  candidates: readonly TourStep[],
  available: readonly TourStep[]
): TourStep | null {
  return candidates.find((step) => available.some((one) => one.id === step.id)) ?? null;
}
