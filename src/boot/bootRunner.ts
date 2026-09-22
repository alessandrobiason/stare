import { ActiveCatalog, CatalogSource } from "../data/tleProvider";
import { DeviceCapabilities, missingCapability, NO_CAPABILITIES } from "../device/capabilities";
import { SatelliteCatalog } from "../satellite/catalog";
import { BootFailure } from "./bootFailure";

/**
 * The machinery every boot sequence shares: a list of steps, progress reported
 * as they settle, and a failure that says which one gave way.
 *
 * The app has one boot sequence — `runBootSequence`, the phone's. The replay
 * harness in `testing/` has another, because it needs a different set of things
 * in hand (a recording and its video, in place of a fix and the camera). What
 * they have in common is here, so the harness cannot drift from the app in the
 * parts that are supposed to be identical: the catalogue check, the sky model,
 * and how a failure reaches the boot screen.
 */

/** One thing that has to be in place before the AR view can be shown. */
export type BootStepDefinition = {
  /** Stable identifier, used to address the step and to report a failure. */
  id: string;
  /** Shown to the user, so it says what is happening rather than what runs. */
  label: string;
  /**
   * What share of the progress bar this step is worth, against the others in
   * its sequence. Any scale; only the ratios are read.
   *
   * Counting steps instead would put the bar on a scale nothing on the phone
   * moves at. Four of the five are a permission prompt or a couple of
   * megabytes, seconds at the outside; the fifth is 95 MB and a Core ML
   * compilation, and on a first launch it is essentially the whole wait. A bar
   * that gave them a fifth each would cross four fifths of itself in a moment
   * and then stop dead for minutes, which is the shape people read as a hang.
   */
  weight: number;
};

export type BootStepState = "pending" | "running" | "done" | "warned" | "failed";

export type BootStep = BootStepDefinition & {
  state: BootStepState;
  /** A short note on a warning or failure, shown under the step. */
  detail?: string;
  /**
   * How far through itself a running step is, from 0 to 1, for the steps that
   * can say. Absent on the ones that cannot: a permission prompt is waiting on
   * a person and has no inside to report from.
   */
  fraction?: number;
  /** What it is doing, when that is worth naming on screen. See `BootActivity`. */
  activity?: BootActivity;
};

/**
 * The thing a step is busy with, in a form a screen can write out in the
 * reader's own language.
 *
 * A key and its figures rather than a sentence, for the reason every other
 * message that reaches the boot screen is one (`bootFailure.ts`): what is
 * shown has to be written in the language the app is in at the moment it is
 * drawn, and this is produced deep in the vision code where that is not known.
 *
 * Deliberately a short list. Almost nothing in start-up is worth narrating —
 * naming each step as it ran was what the old boot screen did, and it told
 * nobody anything they could act on. What earns a line is a wait long enough
 * to need explaining, which in this app is one download and the work
 * immediately after it.
 */
export type BootActivity =
  /** A large file is coming down. `totalBytes` is `null` until the server says. */
  | { kind: "downloading"; receivedBytes: number; totalBytes: number | null }
  /** It has arrived, and is being made ready to use. */
  | { kind: "preparing" };

/**
 * How a step says where it has got to, handed to the tasks that can report.
 *
 * The shape of `BootRun.advance` with the step already chosen, so a task never
 * has to know its own id.
 */
export type BootStepReport = (fraction: number, activity?: BootActivity) => void;

export type BootProgress = {
  steps: BootStep[];
  /** Fraction of the steps that have settled, for a step list. */
  completed: number;
  total: number;
  /**
   * How far through the whole sequence it is, from 0 to 1: every settled step's
   * weight, plus the share a running step has reported of its own.
   *
   * Only ever rises within a run. A bar that went backwards would be worse
   * than one that stalled.
   */
  fraction: number;
  /** What is taking the time, when something is. `null` the rest of the while. */
  activity: BootActivity | null;
};

/**
 * A boot failure the user needs to see, carrying which step gave way. Anything
 * thrown out of a boot sequence is one of these, so the screen never has to
 * guess at an unknown error.
 *
 * The `message` is English and is what lands in a log or a step's detail line.
 * What a person reads is the `cause`, where there is one: a `BootFailure`
 * naming the situation, which the screen writes out in the reader's own
 * language (`bootFailureText`). The replay harness throws these without a
 * cause and gets the message printed as it stands, which is right for a
 * developer's own tool.
 */
export class BootError extends Error {
  readonly step: string;
  readonly steps: BootStep[];

  constructor(step: string, message: string, steps: BootStep[], cause?: BootFailure) {
    super(message, cause ? { cause } : undefined);
    this.name = "BootError";
    this.step = step;
    this.steps = steps;
  }
}

/** The step list before anything has run, for painting the screen's first frame. */
export function initialBootSteps(definitions: readonly BootStepDefinition[]): BootStep[] {
  return definitions.map((definition) => ({ ...definition, state: "pending" }));
}

/** Whatever a step threw, as something worth showing. */
export function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * One run of a boot sequence: the steps, their states, and the reporting around
 * them.
 *
 * `run` never rejects. Steps are started together and settled afterwards in a
 * fixed order, so one failing early does not decide what the screen shows about
 * the rest — see the sequences for why that ordering matters.
 */
export type BootRun = {
  steps: BootStep[];
  run<T>(id: string, task: () => Promise<T>): Promise<T | Error>;
  update(id: string, state: BootStepState, detail?: string): void;
  /**
   * Marks the step failed and returns the error to throw with it, so a caller
   * reads `throw boot.fail(...)` and the compiler can see the flow stop there.
   *
   * `cause` is what the screen actually prints, in the reader's language; the
   * detail is the English line kept against the step.
   */
  fail(id: string, detail: string, cause?: BootFailure): BootError;
  /**
   * Reports how far a running step has got, and what it is doing.
   *
   * Never moves a step backwards: the source of a fraction is a network
   * download, and one that reconnects and restarts would otherwise drag the bar
   * back with it.
   */
  advance(id: string, fraction: number, activity?: BootActivity): void;
};

export function startBootRun(
  definitions: readonly BootStepDefinition[],
  onProgress: (progress: BootProgress) => void
): BootRun {
  const steps = initialBootSteps(definitions);
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);

  /** A step's own contribution: all of its weight once settled, its share while running. */
  const earned = (step: BootStep): number => {
    if (step.state === "pending") return 0;
    if (step.state === "running") return step.weight * (step.fraction ?? 0);
    return step.weight;
  };

  const report = () => {
    onProgress({
      steps: steps.map((step) => ({ ...step })),
      completed: steps.filter((step) => step.state !== "pending" && step.state !== "running").length,
      total: steps.length,
      fraction:
        totalWeight > 0 ? steps.reduce((sum, step) => sum + earned(step), 0) / totalWeight : 0,
      // The first running step with something to say. There is at most one in
      // practice — only the sky model reports an activity — and taking the
      // first keeps that from being a rule the type has to enforce.
      activity: steps.find((step) => step.state === "running" && step.activity)?.activity ?? null
    });
  };

  const update = (id: string, state: BootStepState, detail?: string) => {
    const step = steps.find((candidate) => candidate.id === id);
    if (step) {
      step.state = state;
      step.detail = detail;
      // A settled step is counted whole, and has stopped doing whatever it was
      // doing. Leaving either behind would keep a finished download's megabytes
      // on screen under the next step.
      step.fraction = undefined;
      step.activity = undefined;
    }
    report();
  };

  report();

  return {
    steps,
    update,
    async run<T>(id: string, task: () => Promise<T>): Promise<T | Error> {
      update(id, "running");
      try {
        return await task();
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    },
    fail(id: string, detail: string, cause?: BootFailure): BootError {
      update(id, "failed", detail);
      return new BootError(id, detail, steps, cause);
    },
    advance(id: string, fraction: number, activity?: BootActivity): void {
      const step = steps.find((candidate) => candidate.id === id);
      if (!step || step.state !== "running") return;
      const clamped = Math.min(1, Math.max(0, fraction));
      if (clamped <= (step.fraction ?? 0) && step.activity?.kind === activity?.kind) return;
      step.fraction = Math.max(step.fraction ?? 0, clamped);
      step.activity = activity;
      report();
    }
  };
}

/** A catalogue that has been downloaded *and* turned into SGP4 records. */
export type BuiltCatalog = {
  catalog: SatelliteCatalog;
  /** Where the elements came from, for what the step reports. */
  source: CatalogSource;
  /** When they were downloaded. See `ActiveCatalog.downloadedAtMs`. */
  downloadedAtMs: number;
};

/**
 * Runs the catalogue step: get the elements, then build the records.
 *
 * The build belongs in the step rather than after it. It is the app's longest
 * stretch of JavaScript — the better part of a second on a phone for
 * CelesTrak's active catalogue — and settling happens once every step has
 * finished, which is the one moment in boot when there is nothing left to hide
 * it behind: the boot sky is turning on the same thread, and it would stop dead
 * for the length of it. Here it runs against the fix, the camera prompt and the
 * model load, all of which are waiting rather than computing, and it runs in
 * slices (`SatelliteCatalog.build`) so it yields to the frames in between.
 *
 * Never rejects; `settleCatalog` reads the outcome, as with every other step.
 */
export function runCatalogStep(
  boot: BootRun,
  id: string,
  loadCatalog: () => Promise<ActiveCatalog>
): Promise<BuiltCatalog | Error> {
  return boot.run(id, async () => {
    const active = await loadCatalog();
    return {
      catalog: await SatelliteCatalog.build(active.tles),
      source: active.source,
      downloadedAtMs: active.downloadedAtMs
    };
  });
}

/**
 * The catalogue step's outcome, which is the same question in both sequences:
 * is there a downloaded sky to draw?
 *
 * The catalogue the app ships with counts as one. It is a whole sky, out of
 * date by however long ago the build was made, and the view says so over it
 * (`CatalogNotice`) rather than boot stopping on it: old elements put a
 * satellite a few degrees from where it is, no elements put it nowhere.
 *
 * @throws BootError when there is no usable catalogue.
 */
export function settleCatalog(
  boot: BootRun,
  id: string,
  result: BuiltCatalog | Error
): BuiltCatalog {
  if (result instanceof Error) {
    const detail = describeError(result, "The satellite catalogue could not be loaded");
    // The platform's own words travel with it: a 503 from CelesTrak and a
    // parse that gave way are the same sentence to a reader and different
    // bugs to whoever is sent the photograph of this screen.
    throw boot.fail(id, detail, new BootFailure("catalogFailed", detail));
  }

  // Nothing downloaded, nothing cached, and nothing shipped either — a build
  // missing its bundled file, which is a bug, but the reader's remedy is the
  // same as for a dropped connection.
  if (result.source === "none") {
    throw boot.fail(
      id,
      "No satellite catalogue could be downloaded, and none is cached on this device. " +
        "STARE gets orbital data from CelesTrak, a public satellite-tracking service — " +
        "check your connection and try again in a few minutes.",
      new BootFailure("catalogOffline")
    );
  }

  const { catalog } = result;
  if (catalog.size === 0) {
    throw boot.fail(
      id,
      "The satellite catalogue downloaded but held no usable orbits.",
      new BootFailure("catalogEmpty")
    );
  }

  const origin = { network: "", cache: " (cached)", bundled: " (bundled)", none: "" }[result.source];
  boot.update(id, "done", `${catalog.size.toLocaleString()} satellites${origin}`);
  return result;
}

/**
 * Records the sky model's outcome and hands back the throw for it.
 *
 * Split in two because the model is settled early — so a later failure still
 * shows the full picture — but reported last: "the model did not load" is the
 * least actionable message of the set, and should not be the one shown when
 * something more specific also went wrong.
 */
export function settleSkyModel(
  boot: BootRun,
  id: string,
  result: void | Error
): () => void {
  if (result instanceof Error) {
    boot.update(id, "failed", describeError(result, "The model could not be loaded"));
  } else {
    boot.update(id, "done");
  }

  return () => {
    if (!(result instanceof Error)) return;
    const detail = describeError(
      result,
      "The sky detection model could not be loaded, so nothing could be hidden behind terrain."
    );
    throw boot.fail(id, detail, new BootFailure("skyModelFailed", detail));
  };
}

export type SettledSensors = {
  capabilities: DeviceCapabilities;
  /** What is missing and what its absence costs, or `null` when both are there. */
  missing: string | null;
  /**
   * The same as something the boot screen can say in the reader's language, or
   * `null` when nothing is missing. See `src/boot/bootFailure.ts`.
   */
  failure: BootFailure | null;
  /** The warning text when the sequence carries on without them. */
  warning: string | null;
};

/**
 * The English line kept against the step for each way the sensors can be
 * wanting.
 *
 * The step list is a developer's readout — the console, a progress line, a
 * warning the replay carries — and stays in one language for the reason the
 * technical detail in `bootFailure.ts` does. What the *user* reads is the key
 * beside it, written out in `src/i18n/strings`.
 */
const SENSOR_DETAILS = {
  noMotionSensor: "This device has no motion sensor, so there is no attitude to aim the view with.",
  noMagnetometer: "This device has no magnetometer, so a heading cannot be referenced to north.",
  sensorsUnknown: "The device's sensors could not be checked."
} as const;

/**
 * Records what the device's sensors turned out to be.
 *
 * `fallbackNote` says what stands in for them, and is what separates the two
 * sequences: the phone has no answer — a missing sensor is fatal, so it passes
 * nothing — while the replay carries a recorded attitude and only warns.
 */
export function settleSensors(
  boot: BootRun,
  id: string,
  result: DeviceCapabilities | Error,
  fallbackNote?: string
): SettledSensors {
  // A device that cannot be probed counts as having nothing, rather than
  // getting the benefit of the doubt and then aiming at nowhere.
  const capabilities = result instanceof Error ? NO_CAPABILITIES : result;
  const probeFailed = result instanceof Error;
  const key = probeFailed ? "sensorsUnknown" : missingCapability(capabilities);
  // The step's own line keeps the platform's words where there are any — it is
  // a developer's readout, and "no sensor service" is the half that says which
  // device this was. The key beside it is what the user reads.
  const missing =
    key === null
      ? null
      : probeFailed
        ? describeError(result, SENSOR_DETAILS.sensorsUnknown)
        : SENSOR_DETAILS[key];

  if (key === null || missing === null) {
    boot.update(id, "done", "Motion and magnetometer");
    return { capabilities, missing: null, failure: null, warning: null };
  }

  const failure = new BootFailure(
    key,
    // Only the probe's own failure carries a platform message worth keeping;
    // a device that answered and simply has no magnetometer has said all there
    // is to say.
    probeFailed && result instanceof Error && result.message ? result.message : null
  );

  if (!fallbackNote) {
    boot.update(id, "failed", missing);
    return { capabilities, missing, failure, warning: null };
  }

  const warning = `${missing} ${fallbackNote}`;
  boot.update(id, "warned", warning);
  return { capabilities, missing, failure, warning };
}
