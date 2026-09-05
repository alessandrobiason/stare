import { BootError, BootStep } from "../src/boot/bootRunner";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import { ActiveCatalog } from "../src/data/tleProvider";
import { DeviceCapabilities } from "../src/device/capabilities";
import { RecordingData } from "../testing/replay/recordingDataset";
import { initialSteps, ReplayBootTasks, runReplayBoot } from "../testing/replay/replayBoot";

/**
 * The replay harness's boot. It is not the app's (`bootSequence.test.ts`), and
 * the differences are the point: a recording and its video in place of a fix
 * and a camera, and sensors that may be absent without stopping anything.
 */

const recording: RecordingData = {
  frames: [[0, 1]],
  arkit: [[0, 0, 0, 0, 0, 0, 0, 1]],
  locations: [[0, 10, 20, 30]],
  accelerometer: [[0, 0, 0, 0]],
  gyro: [[0, 0, 0, 0]],
  magnetometer: [[0, 1, 0, 0]],
  barometer: [[0, 100, 0]]
};

const allSensors: DeviceCapabilities = { motion: true, magnetometer: true };

const catalog: ActiveCatalog = {
  tles: [SAMPLE_TLE, { ...SAMPLE_TLE, name: "SAT TWO" }],
  source: "network"
};

function tasks(overrides: Partial<ReplayBootTasks> = {}): ReplayBootTasks {
  return {
    loadCatalog: () => Promise.resolve(catalog),
    loadRecording: () => Promise.resolve(recording),
    loadVideo: () => Promise.resolve("blob:video"),
    loadSkyModel: () => Promise.resolve(),
    checkSensors: () => Promise.resolve(allSensors),
    ...overrides
  };
}

function stepOf(steps: BootStep[], id: string): BootStep {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

const STEP_IDS = ["catalog", "sensors", "recording", "video", "skyModel"];

test("a clean boot returns everything the replay needs", async () => {
  const result = await runReplayBoot(tasks(), () => undefined);

  expect(result.catalog.size).toBe(2);
  expect(result.recording).toBe(recording);
  expect(result.videoUri).toBe("blob:video");
  expect(result.warnings).toEqual([]);
});

test("every step is reported, in a fixed order", async () => {
  let last: BootStep[] = [];
  await runReplayBoot(tasks(), (progress) => {
    last = progress.steps;
  });

  expect(last.map((step) => step.id)).toEqual(STEP_IDS);
  expect(last.every((step) => step.state === "done")).toBe(true);
});

test("the step list is painted in full before the sequence has run", () => {
  expect(initialSteps().map((step) => step.id)).toEqual(STEP_IDS);
  expect(initialSteps().every((step) => step.state === "pending")).toBe(true);
});

test("progress is reported before any step has finished", async () => {
  const seen: number[] = [];
  await runReplayBoot(tasks(), (progress) => seen.push(progress.completed));

  expect(seen[0]).toBe(0);
  expect(seen[seen.length - 1]).toBe(5);
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

  await runReplayBoot(
    {
      loadCatalog: overlapping(catalog),
      loadRecording: overlapping(recording),
      loadVideo: overlapping("blob:video"),
      loadSkyModel: overlapping(undefined),
      checkSensors: overlapping(allSensors)
    },
    () => undefined
  );

  expect(peak).toBeGreaterThan(1);
});

describe("failures that stop the replay", () => {
  test("no satellite catalogue is fatal", async () => {
    const failure = runReplayBoot(
      tasks({ loadCatalog: () => Promise.reject(new Error("offline")) }),
      () => undefined
    );

    await expect(failure).rejects.toBeInstanceOf(BootError);
    await expect(failure).rejects.toThrow("offline");
  });

  test("no sensor timeline is fatal", async () => {
    const failure = runReplayBoot(
      tasks({ loadRecording: () => Promise.reject(new Error("404")) }),
      () => undefined
    );

    await expect(failure).rejects.toThrow("404");
  });

  test("a missing video is fatal: it is the frame the mask reads", async () => {
    let last: BootStep[] = [];
    let error: BootError | null = null;
    await runReplayBoot(
      tasks({ loadVideo: () => Promise.reject(new Error("asset missing")) }),
      (progress) => {
        last = progress.steps;
      }
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("video");
    expect(error!.message).toContain("asset missing");
    expect(stepOf(last, "video").state).toBe("failed");
  });

  test("a sky model that will not load stops boot here too", async () => {
    let last: BootStep[] = [];
    let error: BootError | null = null;
    await runReplayBoot(
      tasks({ loadSkyModel: () => Promise.reject(new Error("CDN unreachable")) }),
      (progress) => {
        last = progress.steps;
      }
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("skyModel");
    expect(stepOf(last, "skyModel").state).toBe("failed");
  });

  test("the error says which step gave way, and carries the whole list", async () => {
    let error: BootError | null = null;
    await runReplayBoot(
      tasks({ loadCatalog: () => Promise.reject(new Error("offline")) }),
      () => undefined
    ).catch((cause) => {
      error = cause;
    });

    expect(error!.step).toBe("catalog");
    // Every step still reports its own outcome, so the screen shows what was
    // already in place rather than a half-run list.
    expect(stepOf(error!.steps, "catalog").state).toBe("failed");
    expect(stepOf(error!.steps, "video").state).toBe("done");
    expect(stepOf(error!.steps, "skyModel").state).toBe("done");
  });

  test("a more actionable failure is reported ahead of the model", async () => {
    let error: BootError | null = null;
    await runReplayBoot(
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

/**
 * The one rule that differs from the app's. The machine running the harness is
 * usually a laptop with no motion sensor at all, and it does not need one: the
 * recording carries its own attitude.
 */
describe("sensors the replay is not using", () => {
  test("a missing magnetometer warns rather than stopping", async () => {
    let last: BootStep[] = [];
    const result = await runReplayBoot(
      tasks({ checkSensors: () => Promise.resolve({ motion: true, magnetometer: false }) }),
      (progress) => {
        last = progress.steps;
      }
    );

    expect(stepOf(last, "sensors").state).toBe("warned");
    expect(result.capabilities).toEqual({ motion: true, magnetometer: false });
    expect(result.warnings[0]).toContain("magnetometer");
    expect(result.catalog.size).toBe(2);
    expect(result.videoUri).toBe("blob:video");
  });

  test("the replay boots on a device with no sensors at all", async () => {
    const result = await runReplayBoot(
      tasks({ checkSensors: () => Promise.resolve({ motion: false, magnetometer: false }) }),
      () => undefined
    );

    expect(result.capabilities.motion).toBe(false);
    expect(result.warnings[0]).toContain("motion sensor");
  });

  test("sensors that cannot be probed count as absent", async () => {
    let last: BootStep[] = [];
    const result = await runReplayBoot(
      tasks({ checkSensors: () => Promise.reject(new Error("no sensor service")) }),
      (progress) => {
        last = progress.steps;
      }
    );

    expect(stepOf(last, "sensors").state).toBe("warned");
    expect(result.capabilities).toEqual({ motion: false, magnetometer: false });
    expect(result.warnings[0]).toContain("no sensor service");
  });
});
