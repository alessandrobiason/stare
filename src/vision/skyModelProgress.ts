import { SKY_MODEL_APPROXIMATE_BYTES } from "./skyModelSource";

/**
 * How far the sky model is from being usable, published as it moves.
 *
 * The model is the one thing in start-up that takes real time: 95 MB fetched
 * once per install, then rewritten for Core ML, then compiled by it. Boot waits
 * for all of that and will not open the view without it, which is the right
 * rule — a view that cannot say what is behind a building would be drawing
 * every satellite as if it were in the clear. What it cannot also be is
 * silent, and for one release it was: the step said "Sky detection model" and
 * then nothing at all for however many minutes the connection took.
 *
 * So the load says where it has got to, and it says it *here* rather than
 * through a callback, because of when it starts. `prewarmBoot` kicks the
 * download off while the intro is still being read — before the boot sequence
 * exists to hand a callback to — and boot then joins the promise already in
 * flight (`loadModel`). A subscriber that arrives late gets the current state
 * immediately and follows it from there, which is exactly what boot needs and
 * what a callback passed into the loader could not have given it.
 *
 * There is one model load per app run, so one state here is all there is. The
 * same reasoning as `skyModelDiagnostics`, which sits beside it.
 */

/** Where a load has got to. The order is the order they happen in. */
export type SkyModelPhase =
  /** Nothing has started, or a previous attempt failed and left this idle. */
  | "waiting"
  /** The file is coming down from `SKY_MODEL_URL`. */
  | "downloading"
  /** Downloaded, and being rewritten for Core ML (`skyModelPreparation.ts`). */
  | "preparing"
  /** Rewritten, and being compiled and opened as a session. */
  | "starting"
  /** Loaded. */
  | "ready";

export type SkyModelLoad = {
  phase: SkyModelPhase;
  /**
   * How far along the whole load is, from 0 to 1.
   *
   * Weighted by what actually takes the time on a first launch rather than by
   * the number of phases: the download is the overwhelming majority of it, and
   * a bar that gave the three phases a third each would spend a minute and a
   * half crossing its first third and then jump.
   */
  fraction: number;
  /** Bytes on disk so far, while `phase` is `"downloading"`; `null` otherwise. */
  receivedBytes: number | null;
  /**
   * The whole file's size, from the response. `null` before the download has
   * said, and `SKY_MODEL_APPROXIMATE_BYTES` where a server answered without a
   * `Content-Length` — see that constant for why standing one in is better than
   * leaving the bar without a denominator.
   */
  totalBytes: number | null;
};

/**
 * What each phase is worth on the bar.
 *
 * The download is four fifths of it because on the launch this exists for — the
 * first one on a device — it is four fifths of the wall clock and then some.
 * The two phases after it cannot report anything from inside themselves: the
 * rewrite is one pass over 95 MB of protobuf and Core ML's compilation happens
 * behind a single native call. They get a band each, entered on starting, so
 * the bar moves when they begin rather than standing still until they end.
 */
const DOWNLOADED = 0.8;
const PREPARED = 0.92;

const IDLE: SkyModelLoad = {
  phase: "waiting",
  fraction: 0,
  receivedBytes: null,
  totalBytes: null
};

let current: SkyModelLoad = IDLE;
const listeners = new Set<(load: SkyModelLoad) => void>();

/** The load as it stands, for anything that reads rather than follows. */
export function skyModelLoad(): SkyModelLoad {
  return current;
}

/**
 * Follows the load, starting with where it is now.
 *
 * The immediate call is the point: boot subscribes after `prewarmBoot` has
 * already been downloading for the length of the intro, and without it the bar
 * would sit at nothing until the next few kilobytes landed.
 */
export function subscribeSkyModelLoad(listener: (load: SkyModelLoad) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

function publish(load: SkyModelLoad): void {
  current = load;
  for (const listener of listeners) listener(load);
}

/** Reported by the loader as it goes. See `skyModel.ts`. */
export function reportSkyModelPhase(phase: Exclude<SkyModelPhase, "downloading">): void {
  const fraction =
    phase === "waiting" ? 0 : phase === "preparing" ? DOWNLOADED : phase === "starting" ? PREPARED : 1;
  publish({ phase, fraction, receivedBytes: null, totalBytes: null });
}

/**
 * Reported for every chunk that lands.
 *
 * `totalBytes` is `-1` from the platform when the response carried no
 * `Content-Length`; the approximate size stands in for it rather than the bar
 * having nothing to divide by.
 */
export function reportSkyModelDownload(receivedBytes: number, totalBytes: number): void {
  const total = totalBytes > 0 ? totalBytes : SKY_MODEL_APPROXIMATE_BYTES;
  publish({
    phase: "downloading",
    // Clamped because the fallback total can be smaller than the file that
    // actually arrives, and a bar that overshoots its own band would hand the
    // preparation phase a number to jump *back* from.
    fraction: DOWNLOADED * Math.min(1, Math.max(0, receivedBytes / total)),
    receivedBytes,
    totalBytes: total
  });
}

/**
 * Forgets a failed load, so the retry's bar starts from the bottom.
 *
 * Boot's retry button runs the whole sequence again against a fresh model
 * promise (`loadModel` clears its own on a rejection). Left where it stopped,
 * this would report the dead attempt's fraction to the new run's bar.
 */
export function resetSkyModelLoad(): void {
  publish(IDLE);
}
