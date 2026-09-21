/**
 * What the app is called, in one place.
 *
 * It is a proper name and so it is not in `src/i18n` — there is no Italian for
 * "Stare" any more than there is for "Starlink" (see `STARLINK_LABEL`). It is
 * written twice on the way into the sky view, upper-cased in both places: on
 * the boot screen, where it is the only thing on the screen, and in the
 * corner of the sky view itself, where it is a title over the count of what
 * is up there. Both read it from here so the two cannot drift apart.
 */
export const APP_NAME = "Stare";

/**
 * The wordmark's weight, apart from its size and colour, which each screen
 * still sets for itself. Shared so STARE reads as the same mark wherever it
 * is drawn — the boot screen, the intro, and the corner of the sky view —
 * rather than a heavier or lighter face showing up in just one of the three.
 */
export const WORDMARK_WEIGHT = "500" as const;

/**
 * How widely the wordmark's letters are set, as a fraction of the size they
 * are drawn at rather than a fixed number of pixels — so a small wordmark and
 * a large one carry the same amount of air around each letter instead of one
 * reading cramped and the other sparse. Fixed at the boot screen's own
 * 9-at-17 tracking, which is where the look was set.
 */
const WORDMARK_TRACKING_EM = 9 / 17;

/** The letter-spacing to draw the wordmark with at a given `fontSize`. */
export function wordmarkTracking(fontSize: number): number {
  return fontSize * WORDMARK_TRACKING_EM;
}
