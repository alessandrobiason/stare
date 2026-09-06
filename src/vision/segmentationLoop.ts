/**
 * How often the loop asks whether the next pass has become due, while it is
 * waiting out the rest of a gap it could cut short.
 *
 * Ten times a second, against a display loop already running at sixty and a
 * question that costs two attitudes and a dot product. Finer would not be felt
 * by anyone: a tenth of a second of a pan is a couple of degrees, well inside
 * the tolerance being tested.
 */
const OVERDUE_POLL_MS = 100;

/** How long to wait between passes, and what may cut that short. */
export type SegmentationPacing = {
  /** Quiet left between the end of one pass and the start of the next. */
  gapMs: number;
  /**
   * The shortest that gap may be cut to when `overdue` says the next pass is
   * wanted. Defaults to `gapMs`, which is to say no cutting short at all.
   */
  minimumGapMs?: number;
  /**
   * Whether the next pass is wanted before the full gap is up — the view having
   * turned off what the last pass covered, typically. Polled during the gap and
   * never before `minimumGapMs`, so a caller answering `true` forever gets the
   * floor rather than a treadmill.
   */
  overdue?: () => boolean;
};

/**
 * Runs `segment` repeatedly, leaving quiet between the end of one run and the
 * start of the next.
 *
 * Not `setInterval`: a fixed rate limits the work only while the work fits
 * inside the period. Sky segmentation does not — a pass costs about as long as
 * its interval — so the next tick falls due as the last one lands, leaving a
 * treadmill with no idle time and a visible one-second step through the view.
 * Spacing from the *end* makes the quiet guaranteed rather than left over.
 *
 * The gap is a maximum rather than a fixed wait. A pass buys nothing while the
 * camera is still and everything the moment it has been turned, so the caller
 * can say the next one is wanted early (`overdue`) and the loop will cut the
 * wait to `minimumGapMs`. That floor is the whole of the protection the old
 * fixed gap gave — it is what a caller answering `true` on every poll gets —
 * so it is where the cost of a pass is bounded, not here.
 *
 * @returns a function that stops the loop. A run in flight is left to finish,
 * there being nothing to cancel it with.
 */
export function startSegmentationLoop(
  segment: () => Promise<void>,
  pacing: SegmentationPacing
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const floorMs = Math.min(pacing.minimumGapMs ?? pacing.gapMs, pacing.gapMs);

  /**
   * Waits out the gap, in steps, checking after each whether the rest of it is
   * still worth waiting. `waitedMs` counts what has been slept rather than the
   * clock, so a stalled timer lengthens the gap instead of skipping it.
   */
  const waitThenCycle = () => {
    let waitedMs = 0;

    const step = (sleptMs: number) => {
      waitedMs += sleptMs;
      if (!active) return;
      if (waitedMs >= pacing.gapMs || (waitedMs >= floorMs && pacing.overdue?.())) {
        void cycle();
        return;
      }
      // Out to the floor in one wait, and in polls after it: there is nothing to
      // ask before the floor, since the answer cannot be acted on yet.
      const nextMs = Math.min(
        waitedMs < floorMs ? floorMs - waitedMs : OVERDUE_POLL_MS,
        pacing.gapMs - waitedMs
      );
      timer = setTimeout(() => step(nextMs), nextMs);
    };

    const firstMs = Math.min(floorMs, pacing.gapMs);
    timer = setTimeout(() => step(firstMs), firstMs);
  };

  const cycle = async () => {
    if (!active) return;
    try {
      await segment();
    } catch (error) {
      // `segment` is expected to report its own failures. This is a backstop so
      // that one rejection cannot quietly end the loop for the whole session.
      console.warn("Sky segmentation loop caught an unhandled failure", error);
    } finally {
      if (active) waitThenCycle();
    }
  };

  void cycle();

  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
  };
}
