import { useCallback, useEffect, useRef, useState } from "react";
import { BootActivity, BootError, BootProgress } from "../boot/bootRunner";
import { MIN_BOOT_SCREEN_MS } from "../constants";
import { useLatestRef } from "./useLatestRef";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type BootPhase = "loading" | "ready" | "failed";

/**
 * How far start-up has got, for the boot screen's bar to read at draw time.
 *
 * A mutable object rather than state, and deliberately so. The sky model's
 * download reports every chunk that lands — hundreds of times over a 95 MB
 * fetch — and putting that through `setState` would re-render the app's root,
 * and everything under it, for a bar two pixels tall. The bar is already
 * redrawing on the display clock for its own easing (`BootProgressBar`), so it
 * reads this when it draws and nothing above it renders at all.
 *
 * `fraction` only rises. See `BootProgress.fraction`.
 */
export type BootProgressFeed = {
  fraction: number;
  /** What is taking the time, when something is. See `BootActivity`. */
  activity: BootActivity | null;
};

export type AppBoot<T> = {
  phase: BootPhase;
  /** Populated once every required step has succeeded. */
  result: T | null;
  /**
   * What went wrong, when `phase` is `"failed"` — as the thing that was
   * thrown, rather than as a sentence about it.
   *
   * Not flattened here, because the sentence depends on the language the app
   * is in and this hook runs once per boot while the screen re-renders every
   * time that changes. The screen turns it into words at the moment it draws
   * (`bootFailureText`), which is also what lets it tell a refused permission
   * from a dropped connection and offer the right way out of each.
   */
  error: unknown;
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
  /** How far the run in flight has got. See `BootProgressFeed`. */
  progress: BootProgressFeed;
};

/**
 * Runs a boot sequence and keeps the boot screen fed: a reason and a retry
 * when it does not finish.
 *
 * The sequence reports its progress step by step and this keeps only the one
 * number a person can read: how far along the whole thing is, in a mutable
 * object the bar reads when it draws (`BootProgressFeed`). The step list itself
 * is not passed on. Naming each step as it settled is what the boot screen used
 * to do, and none of it was actionable — the steps that had settled travel on
 * `BootError` instead, which is where the decision about retrying reads them
 * from.
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
  const [error, setError] = useState<unknown>(null);
  const [retryable, setRetryable] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const startRef = useLatestRef(start);
  // One object for the life of the hook: the boot screen holds it across
  // retries and reads whatever the current run has put in it.
  const progressRef = useRef<BootProgressFeed>({ fraction: 0, activity: null });

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
    // A retry starts the bar again from nothing. The run it replaces may have
    // reached four fifths before the network gave way, and a bar that opened
    // there would be describing work this attempt has not done.
    progressRef.current.fraction = 0;
    progressRef.current.activity = null;

    const onProgress = (progress: BootProgress) => {
      if (!isCurrent()) return;
      // `Math.max` guards the one case the sequence itself cannot: an abandoned
      // run that reports once more before its cleanup lands.
      progressRef.current.fraction = Math.max(progressRef.current.fraction, progress.fraction);
      progressRef.current.activity = progress.activity;
    };

    // The first run is a cold start; anything after it is a retry the user
    // asked for, and should get past the post-failure throttle.
    startRef
      .current(onProgress, { force: attempt > 0 })
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
        setError(cause);
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
    setError(cause);
    setPhase("failed");
  }, []);

  return {
    phase,
    result,
    error,
    retryable,
    retry,
    reportFatal,
    progress: progressRef.current
  };
}
