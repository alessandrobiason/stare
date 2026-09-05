/**
 * Long jobs that must not hold the JS thread for the whole of their length.
 *
 * Everything this app draws is drawn from the JS thread. The boot sky re-records
 * its picture inside a `requestAnimationFrame` callback (`useElapsedSeconds`),
 * and so does the overlay. A synchronous job therefore does not only cost its
 * own time: it costs every frame that would have been drawn while it ran, and
 * the animation comes back with a jump the length of the job, because the clock
 * it reads is wall clock and kept running.
 *
 * The work itself is not optional and there is nowhere else to put it — there is
 * no worklet runtime here (see `src/components/skia.ts` on why Reanimated is not
 * installed) and no worker on React Native. What is optional is doing it all in
 * one go. A job that stops every few milliseconds to let the queue drain takes
 * slightly longer in total and stays invisible, which is the better trade every
 * time something is animating over it.
 */

/**
 * How long a slice may run before the thread is handed back, in milliseconds.
 *
 * About half a 60 Hz frame. Lower, and the fixed cost of resuming — a timer
 * through React Native's event queue, a few milliseconds of it — starts to
 * dominate the work being done. Higher, and a slice can eat a whole frame on
 * its own, which is what this exists to stop.
 */
export const SLICE_BUDGET_MS = 8;

/**
 * Hands the thread back to whatever else is queued on it.
 *
 * A timer rather than a resolved promise: a microtask is drained before the
 * thread is given up at all, so awaiting one would let the rest of this job
 * continue and nothing else in. A timer goes on the queue React Native delivers
 * its frame callbacks on, which is precisely the queue that has to be allowed
 * to run.
 */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * One job's slices: `spent` says the current slice has had its budget, and
 * `handOver` gives the thread up and starts the next one.
 *
 *     const slices = startSlicing();
 *     for (const item of items) {
 *       expensive(item);
 *       if (slices.spent()) await slices.handOver();
 *     }
 *
 * Split in two rather than one awaited call per item because a loop that runs
 * tens of thousands of times should not allocate a promise on every pass to
 * be told it is not due yet.
 */
export type Slices = {
  /** Whether the current slice has run for longer than its budget. */
  spent(): boolean;
  /** Yields the thread, and starts the next slice when it comes back. */
  handOver(): Promise<void>;
};

export function startSlicing(budgetMs: number = SLICE_BUDGET_MS): Slices {
  let startedAt = Date.now();
  return {
    spent: () => Date.now() - startedAt > budgetMs,
    handOver: async () => {
      await yieldToEventLoop();
      startedAt = Date.now();
    }
  };
}
