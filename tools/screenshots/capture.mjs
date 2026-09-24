/*
 * Photographs the real app, once per App Store scene.
 *
 *     node tools/screenshots/capture.mjs [--locale it] [--only 03-occlusion]
 *
 * Every language the app speaks, unless one is named with --locale.
 *
 * This is the first of the two passes behind the store frames, and it is the
 * one that used to be a lie. The phone screen was drawn by a second
 * implementation of the app's panels in HTML and CSS
 * (`page/screen.css`, `page/markers.js`), which had to be edited by hand every
 * time the app changed and silently went on showing the old app when nobody
 * did. It is now a photograph of the app itself: the web build, booted against
 * a still photograph at a fixed place and instant (`testing/screenshots/`),
 * driven through real taps, and screenshotted.
 *
 * What comes out is `.capture/<locale>/<id>.png` at exactly the size
 * `render.mjs` lays into the store frame. Run `render.mjs` afterwards, or
 * `npm run screenshots`, which is both. Its own directory rather than
 * `.build/`, which `render.mjs` wipes at the start of every run.
 *
 * **Two servers, as in `playwright.config.ts`:** the mock CelesTrak endpoint
 * (the live one answers a browser with 403) and Metro. Both are started here if
 * they are not already listening, and left running if they were — so a dev
 * server you already have open is reused rather than fought over.
 */

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { backgroundPath, ensureBackgrounds } from "./backgrounds.mjs";
import { loadFromSource } from "./tsModule.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/* ---- What to shoot, and where it goes. ----------------------------------- */

const { SHOT_SCENES } = await loadFromSource(join(root, "testing/screenshots/scenes.ts"));

const flag = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};

/**
 * Every language the app has interface text for — the directory listing, as in
 * `render.mjs`.
 *
 * All of them, in one run, by default. The expensive parts of a capture are
 * Metro's first bundle and the model, and both are paid once however many
 * languages come out of it; running the tool twice paid them twice, and the
 * listing that came out was half captured from the app and half drawn by the
 * old mirror, which is where the two sets' marker colours went out of step.
 */
const LOCALES = readdirSync(join(root, "src", "i18n", "strings"))
  .filter((file) => extname(file) === ".ts")
  .map((file) => file.replace(/\.ts$/, ""));

const locales = (flag("locale") ?? LOCALES.join(",")).split(",").map((one) => one.trim());
for (const one of locales) {
  if (!LOCALES.includes(one)) {
    throw new Error(`no such locale: ${one} (the app speaks ${LOCALES.join(", ")})`);
  }
}

const only = flag("only");
const scenes = only ? SHOT_SCENES.filter((scene) => scene.id === only) : SHOT_SCENES;
if (!scenes.length) throw new Error(`no scene called ${only}`);

/** Where `render.mjs` looks for a language's captured screens. Keep the two in step. */
const screensDir = (locale) => join(here, ".capture", locale);

/*
 * The phone screen, in points and in pixels.
 *
 * 430 x 932 is the 6.9-inch iPhone's screen in points. The scale factor is not
 * that phone's 3 but the one the store frame needs: `render.mjs` lays the
 * screen into the frame 1090 pixels wide, and capturing at exactly that
 * density means the panels are rasterised once, at the size they are shown,
 * rather than being resampled on the way in.
 */
const SCREEN = { width: 430, height: 932 };
const SCREEN_IN_FRAME_PX = 1090;
const DEVICE_SCALE = SCREEN_IN_FRAME_PX / SCREEN.width;

/* ---- The servers. -------------------------------------------------------- */

const TLE_PORT = 8787;
const METRO_PORT = 8081;
const TLE_URL = `http://localhost:${TLE_PORT}/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`;
const APP_URL = `http://localhost:${METRO_PORT}`;

async function listening(url) {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts a server and waits for it to answer, or resolves to `null` if
 * something is already there.
 *
 * The returned child is what the caller has to stop; a server that was already
 * up is somebody else's and is left alone.
 */
async function serve({ label, command, args, url, env, timeoutMs }) {
  if (await listening(url)) {
    console.log(`  ${label}: already up, reusing it`);
    return null;
  }

  console.log(`  ${label}: starting`);
  // Its own process group: `npx expo start` is a wrapper around the process
  // that actually holds the port, and killing the wrapper leaves that one
  // behind to fight the next run for port 8081.
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "ignore",
    detached: true
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`${label} exited before it answered`);
    if (await listening(url)) return child;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  child.kill();
  throw new Error(`${label} did not answer ${url} within ${timeoutMs / 1000}s`);
}

/**
 * The environment Metro has to be bundled with.
 *
 * `EXPO_PUBLIC_*` is read at bundle time, not at page load, so a dev server
 * started without these serves an app that fetches the live CelesTrak (403 in a
 * browser) and the 95 MB model over the network. The model and the ONNX
 * runtime are only pointed at `public/` when they have actually been staged
 * there, since a wrong local path fails worse than a slow remote one.
 *
 * **Absolute URLs, and they have to be.** ONNX Runtime Web loads its WASM and
 * the model from inside a worker it creates from a blob, and a blob worker has
 * no document to resolve a root-relative path against:
 *
 *     Failed to parse URL from /ort/ort-wasm-simd.wasm
 *
 * which surfaces as "no available backend found" and stops boot outright.
 */
function metroEnv() {
  const env = { EXPO_PUBLIC_TLE_URL: TLE_URL, ELECTRON_DISABLE_SANDBOX: "1" };
  if (existsSync(join(root, "public", "skywater.onnx"))) {
    env.EXPO_PUBLIC_SKYWATER_MODEL_URL = `${APP_URL}/skywater.onnx`;
  }
  if (existsSync(join(root, "public", "ort"))) {
    env.EXPO_PUBLIC_ONNX_WASM_URL = `${APP_URL}/ort/`;
  }
  return env;
}

/* ---- Staging the photographs. -------------------------------------------- */

/**
 * Copies each scene's photograph to where the dev server will serve it.
 *
 * Copied rather than symlinked: Metro's static handler follows a symlink out of
 * the project on some platforms and refuses on others, and these files are a
 * few megabytes.
 */
function stagePhotos(ids) {
  const publicDir = join(root, "public");
  mkdirSync(publicDir, { recursive: true });
  for (const id of ids) {
    copyFileSync(backgroundPath(id), join(publicDir, `shot-${id}.jpg`));
  }
}

/* ---- Driving the app. ---------------------------------------------------- */

/**
 * The handles the staging presses, in the language the app is about to speak.
 *
 * Read out of `src/i18n/strings/<locale>.ts` rather than written down here,
 * because they are the app's own accessibility labels and an Italian app
 * publishes Italian ones: `Catalogo`, `satelliti visibili`, `MOSTRA TUTTO`. A
 * selector copied into this file would work for English and quietly time out
 * for everything else.
 */
async function handlesFor(locale) {
  const strings = (await loadFromSource(join(root, `src/i18n/strings/${locale}.ts`)))[locale];
  // "{count} visible satellites" without the number, which is what the header
  // publishes and what an attribute-suffix selector can match.
  const counted = strings.scene.visibleSatellites.replace("{count}", "").trim();
  return {
    booted: `[aria-label$="${counted}"]`,
    count: `[role="button"][aria-label$="${counted}"]`,
    catalogTab: `[role="tab"][aria-label="${strings.tabs.catalog}"]`,
    search: strings.catalog.search,
    filter: `[aria-label="${strings.filter.open}"]`,
    showAll: strings.filter.showAll,
    passes: `[aria-label="${strings.scene.passes.open}"]`,
    card: `[aria-label="${strings.card.details}"]`
  };
}

/**
 * Opens the panel each scene is about, by pressing what a person would press.
 *
 * Every selector here is an accessibility label the app publishes, which is the
 * same surface `testing/e2e/replay.spec.ts` drives. If one of these stops
 * matching, the app's controls have moved and these frames need looking at —
 * which is the failure this whole pipeline exists to produce.
 */
async function stage(page, scene, handles) {
  const count = page.locator(handles.count).first();

  switch (scene.staging) {
    case "sky":
      return;

    case "tapped": {
      // Through the catalogue rather than by clicking at a pixel: a tap lands
      // on whatever mark happens to be there, and this frame is about one named
      // object. It ends on the sky with that object's card open, which is the
      // same card its own mark would have opened.
      if (scene.aim.kind !== "target") {
        throw new Error(`${scene.id}: "tapped" needs a scene that aims at a target`);
      }
      const { name } = scene.aim;
      await page.locator(handles.catalogTab).click();
      await page.getByPlaceholder(handles.search).fill(name);
      const row = page.locator(`[role="button"][aria-label="${name}"]`).first();
      await row.waitFor({ timeout: 30000 });
      await row.click();
      await page.locator(handles.card).waitFor({ timeout: 30000 });
      return;
    }

    case "filter":
      await page.locator(handles.filter).click();
      await page.getByText(handles.showAll).first().waitFor({ timeout: 30000 });
      return;

    case "breakdown":
      await count.click();
      return;

    case "passes": {
      const passes = page.locator(handles.passes);
      // The plan is made a moment after the view opens, not with it.
      await passes.waitFor({ timeout: 120000 });
      await passes.click();
      await page.locator('[role="list"]').first().waitFor({ timeout: 30000 });
      return;
    }

    default:
      throw new Error(`${scene.id}: no staging called ${scene.staging}`);
  }
}

/**
 * Waits for the picture to stop changing, and returns it.
 *
 * Nothing in a scene moves — one instant, one bearing, one photograph — but
 * things still *arrive*: marks fade in, and the sky mask lands a second or two
 * after boot and takes marks away again where the building is. Rather than
 * guess at how long that takes on whatever machine this is, the screen is shot
 * repeatedly until two in a row are identical.
 */
async function settled(page, { attempts = 20, gapMs = 1500 } = {}) {
  let previous = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shot = await page.screenshot({ animations: "disabled" });
    if (previous && shot.equals(previous)) return shot;
    previous = shot;
    await page.waitForTimeout(gapMs);
  }
  console.warn("    (the view was still changing; shooting it anyway)");
  return previous;
}

async function capture(browser, locale, handles, scene) {
  const context = await browser.newContext({
    viewport: SCREEN,
    deviceScaleFactor: DEVICE_SCALE,
    // The app speaks the browser's language, and the caption set being built
    // around these frames is in one language. Pinned so a machine set to
    // another one does not quietly produce a mixed set.
    locale: locale === "en" ? "en-US" : locale,
    /*
     * The clock the app formats its times against.
     *
     * Every scene stands somewhere in central Europe, and a phone standing
     * there is set to that zone — so a pass at 03:01 UTC is written "05:01" on
     * the card, which is what the status bar in the store frame says too
     * (`ShotScene.clock`). Left alone, the capture runs in whatever the machine
     * is set to, which in CI is UTC: the frames then showed a pass two hours
     * before the clock above it.
     */
    timezoneId: "Europe/Rome",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));

  try {
    await page.goto(`${APP_URL}/?shot=${scene.id}`, { waitUntil: "commit" });

    // Boot runs a catalogue download, a 95 MB model and a JPEG; on a cold
    // Metro it also waits out the first bundle.
    await page.locator(handles.booted).first().waitFor({ timeout: 300000 });
    await stage(page, scene, handles);

    const shot = await settled(page);
    if (failures.length) {
      throw new Error(`the app logged errors:\n  ${failures.join("\n  ")}`);
    }

    const out = join(screensDir(locale), `${scene.id}.png`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, shot);
    console.log(`  ${scene.id} → ${relative(root, out)}`);
  } finally {
    await context.close();
  }
}

/* ---- The run. ------------------------------------------------------------ */

async function main() {
  console.log(`  capturing ${locales.join(" and ")} from the running app`);

  await ensureBackgrounds(scenes.map((scene) => scene.id));
  stagePhotos(scenes.map((scene) => scene.id));

  for (const locale of locales) {
    // Only what this run is about to replace: `--only 03-occlusion` must not
    // throw away the other five, which `render.mjs` would then quietly draw
    // from the mirror instead.
    mkdirSync(screensDir(locale), { recursive: true });
    for (const scene of scenes) rmSync(join(screensDir(locale), `${scene.id}.png`), { force: true });
  }

  const started = [];
  let browser = null;
  try {
    started.push(
      await serve({
        label: "mock CelesTrak",
        command: "node",
        args: ["testing/tools/mock-celestrak-server.mjs"],
        url: TLE_URL,
        timeoutMs: 30000
      })
    );
    started.push(
      await serve({
        label: "Metro",
        command: "npx",
        args: ["expo", "start", "--web", "--port", String(METRO_PORT)],
        url: APP_URL,
        env: metroEnv(),
        timeoutMs: 300000
      })
    );

    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox"]
    });

    // One browser and one dev server for every language: only the context's
    // `locale` changes, which is what the app reads to choose its strings.
    for (const locale of locales) {
      console.log(`  ${locale}:`);
      const handles = await handlesFor(locale);
      for (const scene of scenes) await capture(browser, locale, handles, scene);
    }
  } finally {
    if (browser) await browser.close();
    // The group, not the child: see the note in `serve`.
    for (const child of started) {
      if (child?.pid) {
        try {
          process.kill(-child.pid);
        } catch {
          // Already gone, which is the outcome being asked for.
        }
      }
    }
  }
}

await main();
