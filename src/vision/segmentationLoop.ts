/**
 * Runs `segment` repeatedly, leaving `gapMs` of quiet between the end of one
 * run and the start of the next.
 *
 * Not `setInterval`: a fixed rate limits the work only while the work fits
 * inside the period. Sky segmentation does not — a pass costs about as long as
 * its interval — so the next tick falls due as the last one lands, leaving a
 * treadmill with no idle time and a visible one-second step through the view.
 * Spacing from the *end* makes the quiet guaranteed rather than left over.
 *
 * @returns a function that stops the loop. A run in flight is left to finish,
 * there being nothing to cancel it with.
 */
export function startSegmentationLoop(segment: () => Promise<void>, gapMs: number): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cycle = async () => {
    if (!active) return;
    try {
      await segment();
    } catch (error) {
      // `segment` is expected to report its own failures. This is a backstop so
      // that one rejection cannot quietly end the loop for the whole session.
      console.warn("Sky segmentation loop caught an unhandled failure", error);
    } finally {
      if (active) timer = setTimeout(cycle, gapMs);
    }
  };

  void cycle();

  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
  };
}
