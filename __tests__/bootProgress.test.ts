import { BootStepDefinition, startBootRun, BootProgress } from "../src/boot/bootRunner";
import { bootActivityText, bootBarTarget } from "../src/components/BootProgressBar";
import { MIN_BOOT_SCREEN_MS } from "../src/constants";
import { setLocaleForTesting, stringsFor } from "../src/i18n";
import {
  reportSkyModelDownload,
  reportSkyModelPhase,
  resetSkyModelLoad,
  skyModelLoad,
  subscribeSkyModelLoad
} from "../src/vision/skyModelProgress";
import { SKY_MODEL_APPROXIMATE_BYTES } from "../src/vision/skyModelSource";

/**
 * The boot screen's progress bar, from the bytes underneath it to the sentence
 * beside it.
 *
 * What all of this is for is one launch: the first on a device, where 95 MB of
 * segmentation model comes down before the view can open. Boot waits for it on
 * purpose, and the whole risk in doing so is that a wait nobody can see is
 * indistinguishable from a hang.
 */

afterEach(() => {
  resetSkyModelLoad();
  setLocaleForTesting(undefined);
});

const STEPS: readonly BootStepDefinition[] = [
  { id: "quick", label: "Quick", weight: 1 },
  { id: "slow", label: "Slow", weight: 3 }
] as const;

/** The last progress a run reported, which is what the bar would be reading. */
function runWith(body: (boot: ReturnType<typeof startBootRun>) => void): BootProgress {
  let last: BootProgress | null = null;
  const boot = startBootRun(STEPS, (progress) => {
    last = progress;
  });
  body(boot);
  if (!last) throw new Error("no progress was reported");
  return last;
}

test("the bar is weighted by what the wait actually is, not by the step count", () => {
  // Two steps, one worth three times the other. Finishing the cheap one is a
  // quarter of the bar rather than half of it — which is the whole point: four
  // of the app's five steps are a prompt or a couple of megabytes, and the
  // fifth is 95 MB.
  const progress = runWith((boot) => boot.update("quick", "done"));

  expect(progress.fraction).toBeCloseTo(0.25);
  expect(progress.completed).toBe(1);
});

test("a step that can say how far through it is moves the bar while it runs", () => {
  const progress = runWith((boot) => {
    boot.update("quick", "done");
    boot.update("slow", "running");
    boot.advance("slow", 0.5);
  });

  // A quarter for the finished step, plus half of the three quarters left.
  expect(progress.fraction).toBeCloseTo(0.625);
});

test("and never drags it backwards when a download restarts", () => {
  // A connection that drops and resumes reports from further back than it had
  // reached. A bar that followed it down would be worse than one that stalled.
  const progress = runWith((boot) => {
    boot.update("slow", "running");
    boot.advance("slow", 0.8);
    boot.advance("slow", 0.1);
  });

  expect(progress.fraction).toBeCloseTo(0.6);
});

test("a settled step is counted whole and stops saying what it was doing", () => {
  const progress = runWith((boot) => {
    boot.update("slow", "running");
    boot.advance("slow", 0.4, { kind: "downloading", receivedBytes: 10, totalBytes: 100 });
    boot.update("slow", "done");
  });

  expect(progress.activity).toBeNull();
  expect(progress.fraction).toBeCloseTo(0.75);
});

test("only a running step's activity reaches the screen", () => {
  const progress = runWith((boot) => {
    boot.update("slow", "running");
    boot.advance("slow", 0.2, { kind: "preparing" });
  });

  expect(progress.activity).toEqual({ kind: "preparing" });
});

/**
 * The rule that keeps a fast launch from showing a finished bar over an app
 * that has not opened yet. See `bootBarTarget`.
 */
test("the bar sweeps for as long as the screen is held, however fast the work was", () => {
  // Everything done at once, which is a warm launch: the bar is paced by the
  // clock instead, and completes exactly as the screen gives way.
  expect(bootBarTarget(1, 0)).toBe(0);
  expect(bootBarTarget(1, MIN_BOOT_SCREEN_MS / 2)).toBeCloseTo(0.5);
  expect(bootBarTarget(1, MIN_BOOT_SCREEN_MS)).toBe(1);
});

test("and follows the work rather than the clock once the launch is a slow one", () => {
  // Ten seconds in on a cold start: the clock has long since saturated and the
  // download is the only thing the bar is allowed to claim.
  expect(bootBarTarget(0.3, 10_000)).toBeCloseTo(0.3);
  // Never over-full, whatever it is handed.
  expect(bootBarTarget(2, 10_000)).toBe(1);
});

test("the model's phases are weighted so the download is most of the bar", () => {
  reportSkyModelDownload(0, SKY_MODEL_APPROXIMATE_BYTES);
  expect(skyModelLoad().fraction).toBe(0);

  reportSkyModelDownload(SKY_MODEL_APPROXIMATE_BYTES / 2, SKY_MODEL_APPROXIMATE_BYTES);
  const halfway = skyModelLoad().fraction;

  reportSkyModelPhase("preparing");
  const downloaded = skyModelLoad().fraction;
  reportSkyModelPhase("ready");

  // Half the download is more than a third of the load, which is what a bar
  // split evenly between the three phases would have given it.
  expect(halfway).toBeGreaterThan(0.35);
  expect(downloaded).toBeGreaterThan(halfway);
  expect(skyModelLoad().fraction).toBe(1);
});

test("a server that sends no size still gets a bar that moves", () => {
  // `-1` is what the platform reports when there was no `Content-Length`. A
  // stripe that never moves is the failure this whole file exists to prevent,
  // so the file's own approximate size stands in as the denominator.
  reportSkyModelDownload(SKY_MODEL_APPROXIMATE_BYTES / 4, -1);

  expect(skyModelLoad().fraction).toBeGreaterThan(0);
  expect(skyModelLoad().totalBytes).toBe(SKY_MODEL_APPROXIMATE_BYTES);
});

test("a download larger than the size it was measured against cannot overfill its band", () => {
  reportSkyModelDownload(SKY_MODEL_APPROXIMATE_BYTES * 2, -1);
  const overshot = skyModelLoad().fraction;

  reportSkyModelPhase("preparing");
  expect(skyModelLoad().fraction).toBeGreaterThanOrEqual(overshot);
});

test("a late subscriber is told where the load already is", () => {
  // Boot subscribes after the intro has been read, by which time `prewarmBoot`
  // has usually been downloading for some seconds. Without the immediate call
  // the bar would sit at nothing until the next chunk landed.
  reportSkyModelDownload(SKY_MODEL_APPROXIMATE_BYTES / 2, SKY_MODEL_APPROXIMATE_BYTES);

  const seen: number[] = [];
  const unsubscribe = subscribeSkyModelLoad((load) => seen.push(load.fraction));

  expect(seen).toHaveLength(1);
  expect(seen[0]).toBeGreaterThan(0);

  unsubscribe();
  reportSkyModelPhase("ready");
  expect(seen).toHaveLength(1);
});

test("a failed load leaves nothing behind for the retry's bar to start from", () => {
  reportSkyModelDownload(SKY_MODEL_APPROXIMATE_BYTES / 2, SKY_MODEL_APPROXIMATE_BYTES);
  resetSkyModelLoad();

  expect(skyModelLoad()).toMatchObject({ phase: "waiting", fraction: 0 });
});

test("the line under the bar names the download and how much of it has landed", () => {
  const t = stringsFor("en").boot.activity;
  const caption = bootActivityText({
    kind: "downloading",
    receivedBytes: 40 * 1024 * 1024,
    totalBytes: SKY_MODEL_APPROXIMATE_BYTES
  });

  expect(caption).toContain(t.downloading);
  expect(caption).toContain("40 of 95 MB");
});

test("and is written in the language the app is in", () => {
  setLocaleForTesting("it");
  const caption = bootActivityText({
    kind: "downloading",
    receivedBytes: 40 * 1024 * 1024,
    totalBytes: SKY_MODEL_APPROXIMATE_BYTES
  });

  expect(caption).toContain(stringsFor("it").boot.activity.downloading);
  expect(caption).toContain("40 di 95 MB");
});

test("a size with half of it missing is not shown at all", () => {
  const caption = bootActivityText({
    kind: "downloading",
    receivedBytes: 40 * 1024 * 1024,
    totalBytes: null
  });

  expect(caption).toBe(stringsFor("en").boot.activity.downloading);
});

test("nothing is said when nothing is taking the time", () => {
  expect(bootActivityText(null)).toBeNull();
  expect(bootActivityText({ kind: "preparing" })).toBe(stringsFor("en").boot.activity.preparing);
});
