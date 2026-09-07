/**
 * Measures how smoothly the replay actually runs, in a real browser.
 *
 * The symptom this exists to quantify is stepping: the view freezing for a
 * stretch and then jumping. That is main-thread occupancy, so what it reports
 * is the gap between animation frames, the long tasks that cause the gaps, and
 * the largest jump in video time — the same thing you see when the HUD's
 * millisecond counter stops counting and then catches up all at once.
 *
 * Two things dominate the numbers, so be careful what you compare:
 *
 *  - Development bundles carry React's dev-mode element checks, which are
 *    several times the cost of the render itself. Measure `expo export` output
 *    before concluding anything about a phone.
 *  - `--throttle` applies CPU throttling through the devtools protocol. 4x is a
 *    reasonable stand-in for a phone; 1x measures the machine you are on, which
 *    no user has.
 *
 * `--start` seeks the recording before measuring, because the marker loop is a
 * good part of what is being measured and it costs nothing while the camera is
 * pointed at the pavement — which is where most recordings begin.
 *
 *   node testing/tools/measure-jitter.mjs --url http://localhost:8081 --throttle 1,4,6
 */
import { chromium } from "playwright";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ""), process.argv[index + 1]);
}

const URL_ = args.get("url") ?? "http://localhost:8081";
const SECONDS = Number(args.get("seconds") ?? 12);
const RATES = (args.get("throttle") ?? "1").split(",").map(Number);
const START = Number(args.get("start") ?? 0);
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (error) => console.log(`  [pageerror] ${error.message}`));

console.log(`Loading ${URL_} ...`);
await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 180000 });

// Boot downloads a 16k-entry TLE catalog and a multi-megabyte ONNX model. The
// count in the corner is drawn as a bare number, so what says how many
// satellites it stands for — and so what marks the scene as open — is its
// accessible name rather than its text.
const COUNT = '[aria-label$="visible satellites"]';
await page.locator(COUNT).first().waitFor({ timeout: 300000 });
await page.evaluate(
  async (start) => {
    const video = document.querySelector("video");
    if (!video) return;
    video.muted = true;
    if (start > 0) {
      video.currentTime = start;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    try {
      await video.play();
    } catch {
      /* autoplay may still be refused; `video advanced` below will say so */
    }
  },
  START
);

const client = await page.context().newCDPSession(page);
console.log(`Booted. Recording ${SECONDS}s per throttle level.\n`);
console.log("            fps   p50      p95      max   blocked  longtasks  markers  worst jump");

for (const rate of RATES) {
  await client.send("Emulation.setCPUThrottlingRate", { rate });
  await page.waitForTimeout(2500); // let the frame rate settle at the new speed

  const result = await page.evaluate(async (seconds) => {
    const gaps = [];
    const longTasks = [];
    const videoTimes = [];
    const markerCounts = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    try {
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      /* not every browser exposes it */
    }

    const video = document.querySelector("video");
    let previous = performance.now();
    const started = previous;

    await new Promise((resolve) => {
      const tick = (now) => {
        gaps.push(now - previous);
        previous = now;
        if (video) videoTimes.push(video.currentTime);
        const shown = document.querySelector('[aria-label$="visible satellites"]');
        if (shown) markerCounts.push(Number(shown.getAttribute("aria-label").split(" ")[0]));
        if (now - started >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    observer.disconnect();

    // Drop the first gap: it covers however long setup took.
    const sorted = gaps.slice(1).sort((a, b) => a - b);
    const at = (quantile) => sorted[Math.floor(quantile * (sorted.length - 1))];
    let worstJump = 0;
    for (let index = 1; index < videoTimes.length; index += 1) {
      worstJump = Math.max(worstJump, videoTimes[index] - videoTimes[index - 1]);
    }
    const blocked = longTasks.reduce((total, duration) => total + duration, 0);

    return {
      fps: Math.round((sorted.length / seconds) * 10) / 10,
      p50: at(0.5),
      p95: at(0.95),
      max: at(1),
      blockedPercent: Math.round((blocked / (seconds * 1000)) * 100),
      longTasks: longTasks.length,
      markers: markerCounts.sort((a, b) => a - b)[Math.floor(markerCounts.length / 2)] ?? 0,
      worstJump
    };
  }, SECONDS);

  const cell = (value, width) => String(value).padStart(width);
  console.log(
    `${cell(rate + "x CPU", 9)}  ${cell(result.fps, 4)}  ${cell(result.p50.toFixed(1), 5)}ms  ` +
      `${cell(result.p95.toFixed(1), 6)}ms  ${cell(result.max.toFixed(0), 4)}ms  ` +
      `${cell(result.blockedPercent + "%", 6)}  ${cell(result.longTasks, 8)}  ` +
      `${cell(result.markers, 6)}  ${cell(result.worstJump.toFixed(3) + "s", 10)}`
  );
}

await browser.close();
