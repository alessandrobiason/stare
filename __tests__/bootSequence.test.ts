import {
  BootError,
  BootStep,
  BootStepDefinition
} from "../src/boot/bootRunner";
import { BootTasks, initialSteps, runBootSequence } from "../src/boot/bootSequence";
import { ActiveCatalog } from "../src/data/tleProvider";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import { DeviceCapabilities } from "../src/device/capabilities";

/**
 * The app's boot: a phone, its own sensors, its own fix and its own camera.
 *
 * The replay harness's sequence is tested separately (`replayBoot.test.ts`).
 * The two share their mechanism, so what is checked here is the app's rules —
 * which failures stop it, and in what order they are reported.
 */

const allSensors: DeviceCapabilities = { motion: true, magnetometer: true };

const observer = { latitudeDeg: 60.17, longitudeDeg: 24.94, heightM: 12 };

const catalog: ActiveCatalog = {
  tles: [SAMPLE_TLE, { ...SAMPLE_TLE, name: "SAT TWO" }],
  source: "network"
};

function tasks(overrides: Partial<BootTasks> = {}): BootTasks {
  return {
    loadCatalog: () => Promise.resolve(catalog),
    loadSkyModel: () => Promise.resolve(),
    checkSensors: () => Promise.resolve(allSensors),
    locateObserver: () => Promise.resolve(observer),
    readDeclination: () => Promise.resolve(10),
    requestCamera: () => Promise.resolve(),
    ...overrides
  };
}

function stepOf(steps: BootStep[], id: string): BootStep {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

const STEP_IDS = ["catalog", "sensors", "location", "camera", "skyModel"];

test("a clean boot returns everything the view needs", async () => {
  const result = await runBootSequence(tasks(), () => undefined);

  expect(result.catalog.size).toBe(2);
  expect(result).toMatchObject({ observer, declinationDeg: 10 });
  expect(result.warnings).toEqual([]);
});

test("progress is reported before any step has finished", async () => {
  const seen: number[] = [];
  await runBootSequence(tasks(), (progress) => seen.push(progress.completed));

  expect(seen[0]).toBe(0);
  expect(seen[seen.length - 1]).toBe(5);
});

test("every step is reported, in a fixed order", async () => {
  let last: BootStep[] = [];
  await runBootSequence(tasks(), (progress) => {
    last = progress.steps;
  });

  expect(last.map((step) => step.id)).toEqual(STEP_IDS);
  expect(last.every((step) => step.state === "done")).toBe(true);
});

test("the step list is painted in full before the sequence has run", () => {
  const steps: (BootStep & BootStepDefinition)[] = initialSteps();

  expect(steps.map((step) => step.id)).toEqual(STEP_IDS);
  expect(steps.every((step) => step.state === "pending")).toBe(true);
  expect(steps.every((step) => step.label.length > 0)).toBe(true);
});

test("the satellite count is shown against the catalogue step", async () => {
  let last: BootStep[] = [];
  await runBootSequence(tasks(), (progress) => {
    last = progress.steps;
  });

  expect(stepOf(last, "catalog").detail).toContain("2 satellites");
});

test("a cached catalogue is called out as cached", async () => {
  let last: BootStep[] = [];
  await runBootSequence(
    tasks({ loadCatalog: () => Promise.resolve({ ...catalog, source: "cache" }) }),
    (progress) => {
      last = progress.steps;
    }
  );

  expect(stepOf(last, "catalog").detail).toContain("cached");
});

test("steps run together rather than one after another", async () => {
  let running = 0;
  let peak = 0;
  const overlapping = <T>(value: T) => async () => {
    running += 1;
    peak = Math.max(peak, running);
    await Promise.resolve();
    running -= 1;
    return value;
  };

  await runBootSequence(
    {
      loadCatalog: overlapping(catalog),
      loadSkyModel: overlapping(undefined),
      checkSensors: overlapping(allSensors),
      locateObserver: overlapping(observer),
      readDeclination: overlapping(10),
      requestCamera: overlapping(undefined)
    },
    () => undefined
  );

  expect(peak).toBeGreaterThan(1);
});

describe("the fix", () => {
  test("is shown against its step", async () => {
    let last: BootStep[] = [];
    await runBootSequence(tasks(), (progress) => {
      last = progress.steps;
    });

    expect(stepOf(last, "location").detail).toContain("60.170");
  });

  test("a declination the platform cannot supply leaves true north as magnetic", async () => {
    const result = await runBootSequence(
      tasks({ readDeclination: () => Promise.resolve(null) }),
      () => undefined
    );

    expect(result).toMatchObject({ declinationDeg: 0 });
  });

  test("a declination that throws does not stop a boot that has its fix", async () => {
    const result = await runBootSequence(
      tasks({ readDeclination: () => Promise.reject(new Error("no compass")) }),
      () => undefined
    );

    expect(result).toMatchObject({ declinationDeg: 0 });
  });

  test("no fix is fatal, because there is nowhere to place a satellite", async () => {
    let last: BootStep[] = [];
    const failure = runBootSequence(
      tasks({ locateObserver: () => Promise.reject(new Error("permission refused")) }),
      (progress) => {
        last = progress.steps;
      }
    );

    await expect(failure).rejects.toMatchObject({ step: "location" });
    await expect(failure).rejects.toThrow("permission refused");
    expect(stepOf(last, "location").state).toBe("failed");
  });
});

describe("failures that stop the app", () => {
  test("a device with no magnetometer cannot aim the view", async () => {
    let last: BootStep[] = [];
    const failure = runBootSequence(
      tasks({ checkSensors: () => Promise.resolve({ motion: true, magnetometer: false }) }),
      (progress) => {
        last = progress.steps;
      }
    );

    await expect(failure).rejects.toThrow("magnetometer");
    await failure.catch(() => undefined);
    expect(stepOf(last, "sensors").state).toBe("failed");
  });

  test("a device with no motion sensor cannot aim the view", async () => {
    const failure = runBootSequence(
      tasks({ checkSensors: () => Promise.resolve({ motion: false, magnetometer: false }) }),
      () => undefined
    );

    await expect(failure).rejects.toThrow("motion sensor");
    await expect(failure).rejects.toMatchObject({ step: "sensors" });
  });

  test("sensors that cannot be probed count as absent, and stop the app", async () => {
    const failure = runBootSequence(
      tasks({ checkSensors: () => Promise.reject(new Error("no sensor service")) }),
      () => undefined
    );

    await expect(failure).rejects.toMatchObject({ step: "sensors" });
    await expect(failure).rejects.toThrow("no sensor service");
  });

  test("a missing sensor is reported ahead of a failure that retrying could fix", async () => {
    const failure = runBootSequence(
      tasks({
        checkSensors: () => Promise.resolve({ motion: false, magnetometer: false }),
        loadCatalog: () => Promise.reject(new Error("offline"))
      }),
      () => undefined
    );

    await expect(failure).rejects.toMatchObject({ step: "sensors" });
  });

  test("no satellite catalogue is fatal", async () => {
    const failure = runBootSequence(
      tasks({ loadCatalog: () => Promise.reject(new Error("offline")) }),
      () => undefined
    );

    await expect(failure).rejects.toBeInstanceOf(BootError);
    await expect(failure).rejects.toThrow("offline");
  });

  test("falling back to the bundled TLE is fatal, not a working app", async () => {
    // One bundled satellite renders, but it is not a sky, and quietly showing
    // a single dot would look like a bug rather than a missing download.
    const failure = runBootSequence(
      tasks({ loadCatalog: () => Promise.resolve({ tles: [SAMPLE_TLE], source: "bundled" }) }),
      () => undefined
    );

    await expect(failure).rejects.toThrow(/no satellite catalogue could be downloaded/i);
  });

  test("a catalogue with no usable orbits is fatal", async () => {
    const unusable = {
      name: "BROKEN",
      line1: "1 nonsense",
      line2: "2 nonsense",
      category: "OTHER" as const,
      parked: false
    };
    const failure = runBootSequence(
      tasks({ loadCatalog: () => Promise.resolve({ tles: [unusable], source: "network" }) }),
      () => undefined
    );

    await expect(failure).rejects.toThrow(/no usable orbits/i);
  });

  test("the error says which step gave way, and carries the whole list", async () => {
    let error: BootError | null = null;
    await runBootSequence(
      tasks({ loadCatalog: () => Promise.reject(new Error("offline")) }),
      () => undefined
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("catalog");
    // Every step still reports its own outcome, so the screen shows what was
    // already in place rather than a half-run list.
    expect(stepOf(error!.steps, "catalog").state).toBe("failed");
    expect(stepOf(error!.steps, "skyModel").state).toBe("done");
  });

  test("a step that rejects with a non-Error still produces a readable message", async () => {
    const failure = runBootSequence(
      tasks({ loadCatalog: () => Promise.reject("just a string") }),
      () => undefined
    );
    await expect(failure).rejects.toThrow("just a string");
  });
});

/**
 * The sky mask is not a nicety. Without it the view cannot say what is behind a
 * building, and every one of these used to let the app open anyway and draw the
 * whole catalogue as if the sky were clear.
 */
describe("nothing the sky mask needs is optional", () => {
  test("a sky model that will not load stops boot", async () => {
    let last: BootStep[] = [];
    let error: BootError | null = null;
    await runBootSequence(
      tasks({ loadSkyModel: () => Promise.reject(new Error("CDN unreachable")) }),
      (progress) => {
        last = progress.steps;
      }
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("skyModel");
    expect(error!.message).toContain("CDN unreachable");
    expect(stepOf(last, "skyModel").state).toBe("failed");
  });

  test("a refused camera stops the phone", async () => {
    let last: BootStep[] = [];
    let error: BootError | null = null;
    await runBootSequence(
      tasks({ requestCamera: () => Promise.reject(new Error("Camera access is off")) }),
      (progress) => {
        last = progress.steps;
      }
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("camera");
    expect(error!.message).toContain("Camera access is off");
    expect(stepOf(last, "camera").state).toBe("failed");
  });

  test("a more actionable failure is reported ahead of the model", async () => {
    // "The model did not load" is the least useful thing to be told when the
    // catalogue is also missing, so it is thrown last.
    let error: BootError | null = null;
    await runBootSequence(
      tasks({
        loadSkyModel: () => Promise.reject(new Error("CDN unreachable")),
        loadCatalog: () => Promise.reject(new Error("offline"))
      }),
      () => undefined
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("catalog");
  });
});

test("a device with every sensor reports them without a warning", async () => {
  let last: BootStep[] = [];
  const result = await runBootSequence(tasks(), (progress) => {
    last = progress.steps;
  });

  expect(stepOf(last, "sensors").state).toBe("done");
  expect(result.capabilities).toEqual(allSensors);
  expect(result.warnings).toEqual([]);
});
