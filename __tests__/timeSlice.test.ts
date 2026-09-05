import { SLICE_BUDGET_MS, startSlicing } from "../src/timeSlice";

/**
 * The rule this file protects: a long job stops for anything else queued on the
 * thread. Everything the app draws is drawn from that thread, so a job that
 * does not stop takes every frame that would have been drawn while it ran.
 */

afterEach(() => jest.restoreAllMocks());

test("a slice runs until its budget, and not past it", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
  const slices = startSlicing(SLICE_BUDGET_MS);

  expect(slices.spent()).toBe(false);
  now.mockReturnValue(1_000 + SLICE_BUDGET_MS);
  expect(slices.spent()).toBe(false);
  now.mockReturnValue(1_001 + SLICE_BUDGET_MS);
  expect(slices.spent()).toBe(true);
});

test("handing over lets the queue run, and starts the next slice", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
  const slices = startSlicing(SLICE_BUDGET_MS);

  let ranWhileHandedOver = false;
  setTimeout(() => {
    ranWhileHandedOver = true;
  }, 0);

  now.mockReturnValue(2_000);
  expect(slices.spent()).toBe(true);
  await slices.handOver();

  // The whole point: something else got the thread.
  expect(ranWhileHandedOver).toBe(true);
  // And the budget starts again from where it came back, rather than being
  // already spent and handing over on every pass from here on.
  expect(slices.spent()).toBe(false);
});

test("a job with a budget it never uses never hands over", async () => {
  jest.spyOn(Date, "now").mockReturnValue(1_000);
  const slices = startSlicing(SLICE_BUDGET_MS);

  let handedOver = 0;
  for (let pass = 0; pass < 1_000; pass += 1) {
    if (slices.spent()) {
      handedOver += 1;
      await slices.handOver();
    }
  }

  expect(handedOver).toBe(0);
});
