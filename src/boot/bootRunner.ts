import { ActiveCatalog, CatalogSource } from "../data/tleProvider";
import {
  DeviceCapabilities,
  describeMissingCapabilities,
  NO_CAPABILITIES
} from "../device/capabilities";
import { SatelliteCatalog } from "../satellite/catalog";

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
};

export type BootStepState = "pending" | "running" | "done" | "warned" | "failed";

export type BootStep = BootStepDefinition & {
  state: BootStepState;
  /** A short note on a warning or failure, shown under the step. */
  detail?: string;
};

export type BootProgress = {
  steps: BootStep[];
  /** Fraction of the steps that have settled, for a progress bar. */
  completed: number;
  total: number;
};

/**
 * A boot failure the user needs to see, carrying which step gave way. Anything
 * thrown out of a boot sequence is one of these, so the screen never has to
 * guess at an unknown error.
 */
export class BootError extends Error {
  readonly step: string;
  readonly steps: BootStep[];

  constructor(step: string, message: string, steps: BootStep[]) {
    super(message);
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
   */
  fail(id: string, detail: string): BootError;
};

export function startBootRun(
  definitions: readonly BootStepDefinition[],
  onProgress: (progress: BootProgress) => void
): BootRun {
  const steps = initialBootSteps(definitions);

  const report = () => {
    onProgress({
      steps: steps.map((step) => ({ ...step })),
      completed: steps.filter((step) => step.state !== "pending" && step.state !== "running").length,
      total: steps.length
    });
  };

  const update = (id: string, state: BootStepState, detail?: string) => {
    const step = steps.find((candidate) => candidate.id === id);
    if (step) {
      step.state = state;
      step.detail = detail;
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
    fail(id: string, detail: string): BootError {
      update(id, "failed", detail);
      return new BootError(id, detail, steps);
    }
  };
}

/** A catalogue that has been downloaded *and* turned into SGP4 records. */
export type BuiltCatalog = {
  catalog: SatelliteCatalog;
  /** Where the elements came from, for what the step reports. */
  source: CatalogSource;
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
    return { catalog: await SatelliteCatalog.build(active.tles), source: active.source };
  });
}

/**
 * The catalogue step's outcome, which is the same question in both sequences:
 * is there a downloaded sky to draw?
 *
 * The bundled fallback counts as a failure. One bundled satellite renders, but
 * it is not a sky, and quietly showing a single dot looks like a bug rather
 * than a missing download.
 *
 * @throws BootError when there is no usable catalogue.
 */
export function settleCatalog(
  boot: BootRun,
  id: string,
  result: BuiltCatalog | Error
): SatelliteCatalog {
  if (result instanceof Error) {
    throw boot.fail(id, describeError(result, "The satellite catalogue could not be loaded"));
  }

  if (result.source === "bundled") {
    throw boot.fail(
      id,
      "No satellite catalogue could be downloaded, and none is cached on this device. " +
        "STARE gets orbital data from CelesTrak, a public satellite-tracking service — " +
        "check your connection and try again in a few minutes."
    );
  }

  const { catalog } = result;
  if (catalog.size === 0) {
    throw boot.fail(id, "The satellite catalogue downloaded but held no usable orbits.");
  }

  boot.update(
    id,
    "done",
    `${catalog.size.toLocaleString()} satellites${result.source === "cache" ? " (cached)" : ""}`
  );
  return catalog;
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
    throw boot.fail(
      id,
      describeError(
        result,
        "The sky detection model could not be loaded, so nothing could be hidden behind terrain."
      )
    );
  };
}

export type SettledSensors = {
  capabilities: DeviceCapabilities;
  /** What is missing and what its absence costs, or `null` when both are there. */
  missing: string | null;
  /** The warning text when the sequence carries on without them. */
  warning: string | null;
};

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
  const missing =
    result instanceof Error
      ? describeError(result, "The device's sensors could not be checked")
      : describeMissingCapabilities(capabilities);

  if (!missing) {
    boot.update(id, "done", "Motion and magnetometer");
    return { capabilities, missing: null, warning: null };
  }

  if (!fallbackNote) {
    boot.update(id, "failed", missing);
    return { capabilities, missing, warning: null };
  }

  const warning = `${missing} ${fallbackNote}`;
  boot.update(id, "warned", warning);
  return { capabilities, missing, warning };
}
