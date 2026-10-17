import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://localhost:8082",
    viewport: { width: 430, height: 932 },
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
  },
  webServer: {
    command: "npx expo start --web --port 8082",
    cwd: resolve(__dirname, "../.."),
    url: "http://localhost:8082",
    reuseExistingServer: true,
    timeout: 180000,
    env: { ELECTRON_DISABLE_SANDBOX: "1", CI: "1" }
  }
});
