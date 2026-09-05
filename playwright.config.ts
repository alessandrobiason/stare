import { defineConfig } from "@playwright/test";

/**
 * Drives the replay harness in a real browser.
 *
 * Two servers, because the app will not reach its scene without either: the
 * mock CelesTrak endpoint stands in for the live catalog (which answers a
 * browser with 403, and which the boot sequence treats a single bundled
 * satellite as a failure to load), and Metro serves the app itself.
 *
 * `CHROMIUM_PATH` points at a system browser. Playwright's own download does
 * not cover every distribution, and the segmentation model only needs a
 * reasonably current Chromium.
 */
export default defineConfig({
  testDir: "./testing/e2e",
  // Boot pulls a 16k-entry TLE catalog, a 200 MB video and an ONNX model.
  timeout: 420000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8081",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    }
  },
  webServer: [
    {
      command: "node testing/tools/mock-celestrak-server.mjs",
      url: "http://localhost:8787/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
      reuseExistingServer: true,
      timeout: 60000
    },
    {
      command: "node testing/tools/prepare-test-data.mjs && npx expo start --web --port 8081",
      url: "http://localhost:8081",
      reuseExistingServer: true,
      timeout: 300000,
      env: {
        ELECTRON_DISABLE_SANDBOX: "1",
        EXPO_PUBLIC_TLE_URL: "http://localhost:8787/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
      }
    }
  ]
});
