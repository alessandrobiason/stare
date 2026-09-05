import { useCallback, useEffect, useRef, useState } from "react";
import { BootError, BootProgress } from "../boot/bootRunner";
import { MIN_BOOT_SCREEN_MS } from "../constants";
import { useLatestRef } from "./useLatestRef";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type BootPhase = "loading" | "ready" | "failed";

export type AppBoot<T> = {
  phase: BootPhase;
  /** Populated once every required step has succeeded. */
  result: T | null;
  /** What went wrong, when `phase` is `"failed"`. */
  error: string | null;
  /**
   * Whether running boot again could plausibly help. False for a device that
   * is missing a sensor, which no number of retries will grow.
   */
  retryable: boolean;
  /** Runs boot again from the top. */
  retry: () => void;
  /**
   * Sends the app back to the boot screen with an error. For failures that only
   * show up once running — the kind the boot sequence cannot see coming.
   */
  reportFatal: (error: unknown) => void;
};

/**
 * Runs a boot sequence and keeps the boot screen fed: a reason and a retry
 * when it does not finish.
 *
 * The sequence reports its progress step by step and this throws that away.
 * The screen it feeds shows the sky turning and nothing else while boot runs
 * (see `bootSky`), and what a failure needs is the error, not the tally — the
 * steps that had settled travel on `BootError` instead, which is where the
 * decision about retrying reads them from.
 *
 * A successful run does not switch to `"ready"` the moment the sequence
 * resolves — it waits out `MIN_BOOT_SCREEN_MS` first, so the boot screen
 * reads as the app's own opening beat rather than a flash that only shows up
 * on a slow network. A failure skips that wait: there is nothing to savour in
 * an error, and someone about to retry should not be held on the way there.
 *
 * Written against any sequence rather than one, because there are two — the
 * app's (`runBootSequence`) and the replay harness's (`runReplayBoot`) — and
 * every part of this, from the retry to the run bookkeeping, is the same for
 * both. `start` is given the progress callback and whether the user asked for
 * this attempt by hand.
 */
export function useAppBoot<T>(
  start: (
    onProgress: (progress: BootProgress) => void,
    options: { force: boolean }
  ) => Promise<T>
): AppBoot<T> {
  const [phase, setPhase] = useState<BootPhase>("loading");
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const startRef = useLatestRef(start);

  /**
   * Identifies the run this render belongs to. A retry started while an earlier
   * run is still in flight must not have its screen overwritten when that one
   * finally settles.
   */
  const runRef = useRef(0);

  useEffect(() => {
    const run = (runRef.current += 1);
    const isCurrent = () => runRef.current === run;

    setPhase("loading");
    setError(null);
    setRetryable(true);
    setResult(null);

    const startedAt = Date.now();

    // The first run is a cold start; anything after it is a retry the user
    // asked for, and should get past the post-failure throttle.
    startRef
      .current(() => undefined, { force: attempt > 0 })
      .then(async (booted) => {
        if (!isCurrent()) return;
        const remaining = MIN_BOOT_SCREEN_MS - (Date.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        if (!isCurrent()) return;
        setResult(booted);
        setPhase("ready");
      })
      .catch((cause: unknown) => {
        if (!isCurrent()) return;
        if (cause instanceof BootError) setRetryable(cause.step !== "sensors");
        setError(
          cause instanceof Error && cause.message ? cause.message : "Something went wrong during start-up."
        );
        setPhase("failed");
      });

    return () => {
      // Abandon this run's results rather than cancelling the work, which is
      // network fetches that cache themselves and will help the next attempt.
      runRef.current += 1;
    };
  }, [attempt, startRef]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const reportFatal = useCallback((cause: unknown) => {
    // Stop the current run from landing on top of the error being reported.
    runRef.current += 1;
    setResult(null);
    setError(cause instanceof Error && cause.message ? cause.message : String(cause));
    setPhase("failed");
  }, []);

  return {
    phase,
    result,
    error,
    retryable,
    retry,
    reportFatal
  };
}
