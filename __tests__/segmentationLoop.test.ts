import { startSegmentationLoop } from "../src/vision/segmentationLoop";

const GAP_MS = 1000;

/** Lets every already-resolved promise callback run before the test continues. */
async function flush(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
}

/** A segmenting function whose runs are finished by hand. */
function controllableSegment() {
  const finishers: (() => void)[] = [];
  let started = 0;
  const segment = () => {
    started += 1;
    return new Promise<void>((resolve) => finishers.push(resolve));
  };
  return {
    segment,
    get started() {
      return started;
    },
    async finishRun() {
      finishers.shift()?.();
      await flush();
    }
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("the first run starts immediately", async () => {
  const task = controllableSegment();
  const stop = startSegmentationLoop(task.segment, { gapMs: GAP_MS });
  await flush();

  expect(task.started).toBe(1);
  stop();
});

test("the gap is measured from the end of a run, not from its start", async () => {
  // The bug this loop exists to prevent: a run that outlasts its period leaves
  // no quiet at all, because the next tick is due before the last one lands.
  const task = controllableSegment();
  const stop = startSegmentationLoop(task.segment, { gapMs: GAP_MS });
  await flush();

  // A slow run: well past the gap, and still nothing else has been started.
  jest.advanceTimersByTime(GAP_MS * 3);
  await flush();
  expect(task.started).toBe(1);

  await task.finishRun();
  // The gap only begins now.
  jest.advanceTimersByTime(GAP_MS - 1);
  await flush();
  expect(task.started).toBe(1);

  jest.advanceTimersByTime(1);
  await flush();
  expect(task.started).toBe(2);
  stop();
});

describe("cutting the gap short when a pass is overdue", () => {
  const FLOOR_MS = 300;

  /** The loop, paced so `wanted()` decides whether the gap is waited out. */
  function chasing(wanted: () => boolean) {
    const task = controllableSegment();
    const stop = startSegmentationLoop(task.segment, {
      gapMs: GAP_MS,
      minimumGapMs: FLOOR_MS,
      overdue: wanted
    });
    return { task, stop };
  }

  test("a view that has not moved waits the whole gap", async () => {
    const { task, stop } = chasing(() => false);
    await flush();
    await task.finishRun();

    jest.advanceTimersByTime(GAP_MS - 1);
    await flush();
    expect(task.started).toBe(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(task.started).toBe(2);
    stop();
  });

  test("a pass wanted early starts at the floor rather than at the gap", async () => {
    const { task, stop } = chasing(() => true);
    await flush();
    await task.finishRun();

    // The floor is a floor: answering "wanted" on every poll buys the shortest
    // gap there is, never a treadmill of back-to-back captures.
    jest.advanceTimersByTime(FLOOR_MS - 1);
    await flush();
    expect(task.started).toBe(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(task.started).toBe(2);
    stop();
  });

  test("a turn part way through the gap is picked up without waiting it out", async () => {
    let moved = false;
    const { task, stop } = chasing(() => moved);
    await flush();
    await task.finishRun();

    jest.advanceTimersByTime(FLOOR_MS * 2);
    await flush();
    expect(task.started).toBe(1);

    // The phone is turned. The next poll is what notices, not the end of the gap.
    moved = true;
    jest.advanceTimersByTime(150);
    await flush();
    expect(task.started).toBe(2);
    stop();
  });

  test("stopping mid-gap cancels the poll as well as the wait", async () => {
    const { task, stop } = chasing(() => true);
    await flush();
    await task.finishRun();

    stop();
    jest.advanceTimersByTime(GAP_MS * 5);
    await flush();
    expect(task.started).toBe(1);
  });
});

test("a failed run does not end the loop", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let started = 0;
  const stop = startSegmentationLoop(
    () => {
      started += 1;
      return Promise.reject(new Error("model exploded"));
    },
    { gapMs: GAP_MS }
  );
  await flush();
  expect(started).toBe(1);

  jest.advanceTimersByTime(GAP_MS);
  await flush();
  expect(started).toBe(2);

  stop();
  warn.mockRestore();
});

test("stopping cancels the run that was waiting on the gap", async () => {
  const task = controllableSegment();
  const stop = startSegmentationLoop(task.segment, { gapMs: GAP_MS });
  await flush();
  await task.finishRun();

  stop();
  jest.advanceTimersByTime(GAP_MS * 5);
  await flush();
  expect(task.started).toBe(1);
});

test("stopping during a run keeps the loop from scheduling another", async () => {
  // Nothing can cancel inference already in flight, so the guarantee is only
  // that its result is the last thing the loop does.
  const task = controllableSegment();
  const stop = startSegmentationLoop(task.segment, { gapMs: GAP_MS });
  await flush();

  stop();
  await task.finishRun();
  jest.advanceTimersByTime(GAP_MS * 5);
  await flush();
  expect(task.started).toBe(1);
});
