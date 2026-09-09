/*
 * Builds the App Store screenshots.
 *
 *     node tools/screenshots/render.mjs
 *
 * Two passes, and the split is the point. The phone screen is rendered on its
 * own at the device scale factor a 6.9-inch iPhone actually has, so every panel
 * is rasterised at the size the phone rasterises it — text included — rather
 * than being drawn small and scaled up. The store frame is then composed around
 * that image at full resolution: caption, background, and the screen laid into
 * it. Output is 1290 x 2796, which is the size App Store Connect takes for the
 * 6.7 and 6.9-inch classes and downscales for everything below them.
 *
 * The camera picture behind the markers is drawn rather than photographed —
 * see `page/sky.js`. Put a real capture at
 * `tools/screenshots/backgrounds/<scene id>.jpg` and it is used instead, at the
 * camera's own 3:4 shape, with the overlay unchanged on top of it.
 *
 * Chromium comes from the Playwright browser directory this container already
 * has; `CHROME` overrides it. Inter is fetched once into `.cache/fonts` and the
 * system sans is used if that fetch fails.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import scenes from "./scenes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const build = join(here, ".build");
const cache = join(here, ".cache");
const backgrounds = join(here, "backgrounds");
const outDir = join(root, "docs", "app-store");

/** The store's frame, and the phone inside it. */
const FRAME = { width: 1290, height: 2796 };
/** iPhone 6.9": 430 x 932 points at three times the pixels. */
const SCREEN = { width: 430, height: 932 };
/**
 * The camera's own shape, and the box it fills the screen with.
 *
 * `DEVICE_CAMERA` is 1080 x 1440 — 3:4 in portrait — and the app covers the
 * screen with it rather than fitting it inside (`frameBoxFor`): the box keeps
 * that shape, is scaled until it fills the screen and runs off the sides,
 * which on this phone is a third of the frame's width. Everything is placed in
 * percentages of the box, exactly as the projection hands them over, and the
 * screen crops what is past its edges.
 */
const CAMERA_ASPECT = 1080 / 1440;
const PICTURE = {
  width: Math.max(SCREEN.width, SCREEN.height * CAMERA_ASPECT),
  height: Math.max(SCREEN.width / CAMERA_ASPECT, SCREEN.height)
};
/**
 * The safe area the panels are inset by, in points: the sensor housing above
 * and the home indicator below (`SafeAreaLayer`). A portrait iPhone has none
 * either side.
 */
const SAFE = { top: 59, bottom: 34 };
/** The part of the frame the screen shows, in frame percent. See `viewportOf`. */
const VIEWPORT = {
  left: 50 - Math.min(1, SCREEN.width / PICTURE.width) * 50,
  right: 50 + Math.min(1, SCREEN.width / PICTURE.width) * 50,
  top: 50 - Math.min(1, SCREEN.height / PICTURE.height) * 50,
  bottom: 50 + Math.min(1, SCREEN.height / PICTURE.height) * 50
};
/** How wide the phone sits in the frame, and the scale that follows from it. */
const SCREEN_IN_FRAME_PX = 1090;
const DEVICE_SCALE = SCREEN_IN_FRAME_PX / SCREEN.width;

/*
 * The headless shell first, and it matters which.
 *
 * Chromium's new headless mode sizes the layout viewport from a window that
 * carries browser furniture, so `--window-size=430,932` lays out 845 points of
 * page and paints the rest black — the console pill in the app's bottom corner
 * falls off the bottom of a frame that is nominally the right size. The shell
 * is the old implementation, where the window size *is* the viewport.
 */
const CHROME =
  process.env.CHROME ??
  [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/usr/bin/chromium-headless-shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome"
  ].find((path) => existsSync(path));

const FONT_WEIGHTS = [400, 500, 600, 700, 800];

/**
 * Inter, fetched once and cached.
 *
 * The phone sets this in San Francisco, which is not licensed to redistribute
 * and is not on this machine either. Inter is the closest grotesque that is
 * open-licensed, and it is used for the store captions as much as for the
 * app's own panels — so the two halves of a frame are set in one typeface.
 */
function fonts() {
  mkdirSync(cache, { recursive: true });
  const files = [];
  for (const weight of FONT_WEIGHTS) {
    const file = join(cache, `inter-${weight}.ttf`);
    if (!existsSync(file)) {
      const css = fetchText(
        `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`
      );
      const url = css?.match(/url\((https:[^)]+)\)/)?.[1];
      const data = url && fetchBinary(url);
      if (!data) {
        console.warn(`  fonts: Inter ${weight} unavailable, falling back to the system sans`);
        continue;
      }
      writeFileSync(file, data);
    }
    files.push({ weight, file: `inter-${weight}.ttf` });
  }
  return files;
}

function fetchText(url) {
  const run = spawnSync("curl", ["-sSL", "-A", "Mozilla/5.0", url], { encoding: "utf8" });
  return run.status === 0 ? run.stdout : null;
}

function fetchBinary(url) {
  const run = spawnSync("curl", ["-sSL", url], { maxBuffer: 64 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : null;
}

/**
 * The faces, inlined.
 *
 * Everything a page needs is embedded in it and loaded over `file://`: a local
 * web server cannot serve these frames, because the shots are taken with
 * `spawnSync` and a blocked event loop answers no requests.
 */
function fontFaces(files) {
  return files
    .map(
      ({ weight, file }) => `@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: ${weight};
  src: url("data:font/ttf;base64,${readFileSync(join(cache, file)).toString("base64")}") format("truetype");
}`
    )
    .join("\n");
}

const escape = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A real capture for this scene, if one has been dropped in. */
function backgroundFor(scene) {
  if (!existsSync(backgrounds)) return null;
  const match = readdirSync(backgrounds).find(
    (file) => file.replace(extname(file), "") === scene.id
  );
  if (!match) return null;
  const type = extname(match) === ".png" ? "image/png" : "image/jpeg";
  return `data:${type};base64,${readFileSync(join(backgrounds, match)).toString("base64")}`;
}

/* ---- The phone screen. --------------------------------------------------- */

const CATEGORY_LABELS = {
  LANDMARK: "LANDMARKS",
  NAVIGATION: "NAVIGATION",
  EARTH: "EARTH WATCH",
  COMMS: "INTERNET &amp; TV",
  OTHER: "OTHER"
};
const CATEGORY_ORDER = ["LANDMARK", "NAVIGATION", "EARTH", "COMMS", "OTHER"];
const NIGHT_COLORS = {
  LANDMARK: "#fdfdfd",
  NAVIGATION: "#ffcf5c",
  EARTH: "#5fd0d4",
  COMMS: "#7a71cc",
  OTHER: "#48515c"
};
const DAYLIGHT_COLORS = {
  LANDMARK: "#121212",
  NAVIGATION: "#745913",
  EARTH: "#164547",
  COMMS: "#4e1dbc",
  OTHER: "#808790"
};
const OUTLINE = { night: "rgba(3, 9, 17, 0.85)", daylight: "rgba(244, 248, 253, 0.9)" };

function statusPanel(scene) {
  // What is on the screen rather than what is on the frame, as the app counts
  // it: the picture covers the screen, so the marks past its sides are drawn
  // and clipped, and a count that included them would be a number nobody can
  // check against the sky in front of them. See `pointInViewport`.
  const count = scene.markers.filter(
    (marker) =>
      marker.left >= VIEWPORT.left &&
      marker.left <= VIEWPORT.right &&
      marker.top >= VIEWPORT.top &&
      marker.top <= VIEWPORT.bottom
  ).length;
  const open = scene.panels.status === "open";
  const breakdown = scene.breakdown ?? { rows: [] };
  /*
   * What is left once the named fleets are taken out, worked out here rather
   * than written down beside them.
   *
   * The app tallies the marks it has just drawn and lumps everything it cannot
   * name into one row (`tallyFleets`), so a breakdown that came to more or less
   * than the count above it would be a fault in one of the two. Deriving it is
   * what keeps the two in step when the count changes — which it does whenever
   * the picture is reframed, since only the marks on the screen are counted.
   */
  const named = breakdown.rows.reduce((total, [, tally]) => total + tally, 0);
  const other = count - named;
  if (other < 0) {
    throw new Error(
      `${scene.id}: the breakdown names ${named} of ${count} marks on screen`
    );
  }
  const rows = open
    ? `<div class="breakdown">
        <div class="panel-title">IN VIEW</div>
        ${breakdown.rows
          .map(
            ([name, tally]) =>
              `<div class="row"><span class="name">${escape(name)}</span><span class="tally">${tally}</span></div>`
          )
          .join("\n        ")}
        <div class="row other"><span class="name">Others</span><span class="tally">${other}</span></div>
      </div>`
    : "";

  return `<div class="panel status${open ? " open" : ""}">
      <div class="header"><span class="count">${count}</span><span class="chevron">${open ? "▴" : "▾"}</span></div>
      ${rows}
    </div>`;
}

function legendPanel(scene) {
  const open = scene.panels.filter === "open";
  const colors = scene.palette === "daylight" ? DAYLIGHT_COLORS : NIGHT_COLORS;
  const outline = OUTLINE[scene.palette] ?? OUTLINE.night;
  const body = open
    ? `${CATEGORY_ORDER.map(
        (category) => `<div class="row">
        <span class="swatch" style="background:${colors[category]};border-color:${outline}"></span>
        <span class="name">${CATEGORY_LABELS[category]}</span>
        <span class="toggle on"><span>ON</span></span>
      </div>`
      ).join("\n      ")}
      <div class="key"><span class="ring"></span><span>RING = PARKED OVER THE EQUATOR</span></div>
      <div class="show-all">SHOW ALL</div>`
    : "";

  return `<div class="panel legend${open ? " open" : ""}">
      <div class="header"><span class="panel-title">FILTER</span><span class="chevron">${open ? "▴" : "▾"}</span></div>
      ${body}
    </div>`;
}

function cardPanel(scene) {
  const card = scene.card;
  if (!card) return "";
  const colors = scene.palette === "daylight" ? DAYLIGHT_COLORS : NIGHT_COLORS;
  const outline = OUTLINE[scene.palette] ?? OUTLINE.night;
  const strip =
    card.names.length > 1
      ? `<div class="strip">${card.names
          .map(
            (name) =>
              `<span class="chip${name === card.selected ? " on" : ""}">${escape(name)}</span>`
          )
          .join("")}</div>`
      : "";

  return `<div class="card">
      ${strip}
      <div class="head">
        <div class="heading">
          <div class="name">${escape(card.selected)}</div>
          <div class="purpose">
            <span class="swatch" style="background:${colors[card.category]};border-color:${outline}"></span>
            <span class="purpose-label">${escape(card.purpose)}</span>
          </div>
        </div>
        <div class="close">✕</div>
      </div>
      <div class="briefing">
        <p>${escape(card.briefing)}</p>
        <div class="site">${escape(card.site)} ↗</div>
      </div>
      <div class="facts">
        ${card.facts
          .map(
            ([label, value]) =>
              `<div class="fact"><span class="label">${escape(label)}</span><span class="value">${escape(value)}</span></div>`
          )
          .join("\n        ")}
      </div>
    </div>`;
}

/** The phone's own furniture: the clock, the radios and the battery. */
function statusBar() {
  return `<div class="statusbar">
    <div class="island"></div>
    <span class="clock">21:47</span>
    <span class="indicators">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M1.4 4.2a10.5 10.5 0 0 1 14.2 0"/><path d="M4.2 7.1a6.5 6.5 0 0 1 8.6 0"/><path d="M7 9.9a2.5 2.5 0 0 1 3 0"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="rgba(255,255,255,0.45)"/><rect x="2" y="2" width="16" height="9" rx="2" fill="#fff"/><path d="M24.5 4.5v4a2.4 2.4 0 0 0 0-4z" fill="rgba(255,255,255,0.45)"/></svg>
    </span>
  </div>`;
}

function asset(name) {
  return readFileSync(join(here, "page", name), "utf8");
}

function screenHtml(scene, faces) {
  const background = backgroundFor(scene);
  const payload = {
    ...scene,
    background,
    deviceScale: DEVICE_SCALE,
    picture: PICTURE
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(scene.id)}</title>
<style>
${faces}
</style>
<style>
${asset("screen.css")}
</style>
<style>
/* The one thing the stylesheet cannot know: how big the covering box is, and
   how far off the left edge it starts. Derived here so the two agree. */
.picture, .picture canvas {
  width: ${PICTURE.width}px;
  height: ${PICTURE.height}px;
}
.picture {
  left: ${(SCREEN.width - PICTURE.width) / 2}px;
  top: ${(SCREEN.height - PICTURE.height) / 2}px;
}
.hud {
  top: ${SAFE.top}px;
  bottom: ${SAFE.bottom}px;
}
</style>
</head>
<body>
  <div class="screen">
    <div class="picture">
      <canvas id="sky"></canvas>
      <canvas id="markers"></canvas>
      <div class="labels" id="labels"></div>
    </div>

    <!-- The phone's own furniture, over the picture rather than beside it:
         full screen, the camera reaches the top and bottom of the display. -->
    ${statusBar()}
    <div class="homebar"><span></span></div>

    <!-- And the app's panels, inset off both of them. See \`SafeAreaLayer\`. -->
    <div class="hud">
      ${statusPanel(scene)}
      ${legendPanel(scene)}
      ${cardPanel(scene)}
      <div class="console">CONSOLE</div>
    </div>
  </div>
<script>
${asset("sky.js")}
</script>
<script>
${asset("markers.js")}
</script>
<script>
const SCENE = ${JSON.stringify(payload)};

/** Backing pixels rather than layout pixels, as the app's own canvas does. */
function prepare(canvas, box, density) {
  canvas.width = Math.round(box.width * density);
  canvas.height = Math.round(box.height * density);
  const context = canvas.getContext("2d");
  context.setTransform(density, 0, 0, density, 0, 0);
  return context;
}

async function render() {
  const box = SCENE.picture;
  const density = SCENE.deviceScale;
  const sky = prepare(document.getElementById("sky"), box, density);

  if (SCENE.background) {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        // The camera's own 3:4 box: a real capture is filled into it rather
        // than letterboxed, since that is what the phone shows.
        const scale = Math.max(box.width / image.width, box.height / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        sky.drawImage(image, (box.width - width) / 2, (box.height - height) / 2, width, height);
        resolve();
      };
      image.onerror = reject;
      image.src = SCENE.background;
    });
  } else {
    window.StareSky.drawSky(sky, box.width, box.height, SCENE.sky);
  }

  const overlay = prepare(document.getElementById("markers"), box, density);
  const scene = window.StareMarkers.drawMarkers(
    overlay,
    SCENE.markers,
    box,
    SCENE.palette,
    SCENE.selected ?? null,
    SCENE.paths ?? []
  );

  const labels = document.getElementById("labels");
  const shadow = SCENE.palette === "daylight" ? "rgba(244, 248, 253, 0.9)" : "rgba(3, 9, 17, 0.85)";
  for (const label of scene.labels) {
    const span = document.createElement("span");
    span.textContent = label.name;
    span.style.left = label.x + "px";
    span.style.top = label.y + label.offsetY + "px";
    span.style.color = scene.palette.label;
    span.style.textShadow = "0 1px 3px " + shadow;
    // A rise carries the time on a second line and fades with its own path;
    // a marker's name is one line at full strength, as in MarkerLabels.
    span.style.opacity = label.alpha ?? 1;
    labels.appendChild(span);
  }

  document.documentElement.dataset.ready = "true";
}

render();
</script>
</body>
</html>`;
}

/* ---- The store frame around it. ------------------------------------------ */

function frameHtml(scene, index, faces, screenPng) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(scene.id)}</title>
<style>
${faces}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
body {
  width: ${FRAME.width}px;
  height: ${FRAME.height}px;
  overflow: hidden;
  position: relative;
  background: #070f1c;
  font-family: Inter, "Helvetica Neue", Arial, sans-serif;
}
#stars { position: absolute; inset: 0; }
.caption {
  position: absolute;
  left: 96px;
  right: 96px;
  top: 118px;
}
.caption h1 {
  font-size: 78px;
  font-weight: 700;
  line-height: 1.06;
  letter-spacing: -1.8px;
  color: #ffffff;
}
.caption p {
  margin-top: 26px;
  max-width: 1000px;
  font-size: 31px;
  font-weight: 400;
  line-height: 1.42;
  letter-spacing: -0.1px;
  color: rgba(216, 228, 237, 0.62);
}
.device {
  position: absolute;
  left: 50%;
  top: 402px;
  width: ${SCREEN_IN_FRAME_PX}px;
  height: ${Math.round(SCREEN.height * DEVICE_SCALE)}px;
  margin-left: -${SCREEN_IN_FRAME_PX / 2}px;
  border-radius: 139px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 60px 140px rgba(0, 0, 0, 0.55), 0 0 120px rgba(88, 132, 190, 0.14);
}
.device img { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="stars" width="${FRAME.width}" height="${FRAME.height}"></canvas>
<div class="caption">
  <h1>${escape(scene.caption.title)}</h1>
  <p>${escape(scene.caption.body)}</p>
</div>
<div class="device"><img src="data:image/png;base64,${screenPng}" alt=""></div>
<script>
/*
 * The same night the boot screen is drawn on (assets/logo-extended.svg): a
 * radial grade with a thin scatter of stars, so the frame around the phone
 * belongs to the app rather than to a template.
 */
const canvas = document.getElementById("stars");
const context = canvas.getContext("2d");
const grade = context.createRadialGradient(
  ${FRAME.width / 2}, ${Math.round(FRAME.height * 0.42)}, 0,
  ${FRAME.width / 2}, ${Math.round(FRAME.height * 0.42)}, ${Math.round(FRAME.height * 0.86)}
);
grade.addColorStop(0, "#12263f");
grade.addColorStop(0.52, "#0c1a2d");
grade.addColorStop(1, "#070f1c");
context.fillStyle = grade;
context.fillRect(0, 0, canvas.width, canvas.height);

let seed = ${1000 + index * 37};
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
context.fillStyle = "#dbe6f2";
for (let index = 0; index < 260; index += 1) {
  context.globalAlpha = 0.14 + random() * 0.3;
  context.beginPath();
  context.arc(random() * canvas.width, random() * canvas.height, 1 + random() * 2.6, 0, Math.PI * 2);
  context.fill();
}
context.globalAlpha = 1;
document.documentElement.dataset.ready = "true";
</script>
</body>
</html>`;
}

/* ---- Shooting. ----------------------------------------------------------- */

function shoot({ page, out, width, height, scale }) {
  const shell = CHROME.includes("headless_shell");
  const run = spawnSync(
    CHROME,
    [
      ...(shell ? [] : ["--headless=new"]),
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      `file://${page}`
    ],
    { encoding: "utf8" }
  );
  if (!existsSync(out)) {
    throw new Error(`chromium wrote nothing for ${page}\n${run.stderr ?? ""}`);
  }
}

function main() {
  if (!CHROME) throw new Error("no chromium found; set CHROME to one");
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const faces = fontFaces(fonts());

  scenes.forEach((scene, index) => {
    // The phone first, at the scale the phone itself draws at, and then the
    // store's frame with that image laid into it.
    const screenPage = join(build, `screen-${scene.id}.html`);
    const screenPng = join(build, `screen-${scene.id}.png`);
    writeFileSync(screenPage, screenHtml(scene, faces));
    shoot({
      page: screenPage,
      out: screenPng,
      width: SCREEN.width,
      height: SCREEN.height,
      scale: DEVICE_SCALE
    });

    const framePage = join(build, `frame-${scene.id}.html`);
    writeFileSync(
      framePage,
      frameHtml(scene, index, faces, readFileSync(screenPng).toString("base64"))
    );
    const out = join(outDir, `${scene.id}.png`);
    shoot({ page: framePage, out, width: FRAME.width, height: FRAME.height, scale: 1 });
    console.log(`  ${scene.id} → docs/app-store/${scene.id}.png`);
  });
}

main();
