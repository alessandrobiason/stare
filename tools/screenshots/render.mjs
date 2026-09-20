/*
 * Builds the App Store screenshots.
 *
 *     node tools/screenshots/render.mjs [--locale it]
 *
 * One set per storefront language. English writes `docs/app-store/`, every
 * other locale writes `docs/app-store/<locale>/`, and the language comes from
 * `LOCALES` in `src/i18n/locale.ts` — the same list the app itself speaks.
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
 * **The words on the phone are the app's own.** The chrome in these frames —
 * the filter's categories, the count, the card's labels — is read out of
 * `src/i18n/strings/<locale>.ts` at render time rather than copied into this
 * file, because a copy is a thing that drifts: the store would go on showing
 * last year's wording of a panel the app has since rewritten, and nothing
 * would fail. What each scene *says* rather than what the app calls it — a
 * briefing, a tally, the figures on a card — is scene data, and carries one
 * entry per locale in `scenes.mjs`.
 *
 * Chromium comes from the Playwright browser directory this container already
 * has; `CHROME` overrides it. Inter is fetched once into `.cache/fonts` and the
 * system sans is used if that fetch fails.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import scenes from "./scenes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const build = join(here, ".build");
const cache = join(here, ".cache");
const backgrounds = join(here, "backgrounds");

/* ---- The language this run is drawing. ----------------------------------- */

/**
 * Reads a TypeScript module out of `src/` and hands back what it exports.
 *
 * The app's strings are `.ts`, this tool is `.mjs`, and the two have to meet
 * somewhere. They meet here rather than in a copy of the strings, because the
 * whole reason to reach into `src/` is that a second copy would be free to be
 * wrong. Every file this loads is a plain object literal behind an
 * `import type`, so stripping the types leaves runnable JavaScript and no
 * bundler is needed — `transpileModule` does not typecheck, which is what
 * `npm run typecheck` is for.
 */
async function loadFromSource(relative) {
  const file = join(root, relative);
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file
  }).outputText;
  // Imports inside the transpiled text resolve against this data URL, which has
  // no directory, so anything the strings reach for has to be a type. They are.
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

/**
 * The languages the app has interface text for, which is the directory listing
 * rather than `LOCALES` in `src/i18n/locale.ts`: that module reaches for the
 * device's own storage on the way in and does not load outside React Native.
 * The two lists are held together by `__tests__/i18n.test.ts`, which is a
 * better place for that check than here.
 */
const LOCALES = readdirSync(join(root, "src", "i18n", "strings"))
  .filter((file) => extname(file) === ".ts")
  .map((file) => file.replace(/\.ts$/, ""));
const FALLBACK_LOCALE = "en";

const locale = (() => {
  const flag = process.argv.indexOf("--locale");
  if (flag === -1) return FALLBACK_LOCALE;
  const asked = process.argv[flag + 1];
  if (!LOCALES.includes(asked)) {
    throw new Error(`no such locale: ${asked} (the app speaks ${LOCALES.join(", ")})`);
  }
  return asked;
})();

/** What the app says, in that language. */
const { [locale]: t } = await loadFromSource(`src/i18n/strings/${locale}.ts`);

/**
 * English keeps the directory it has always had, so the six paths the listing
 * already points at do not move; every other language gets one beside it.
 */
const outDir =
  locale === FALLBACK_LOCALE
    ? join(root, "docs", "app-store")
    : join(root, "docs", "app-store", locale);

/**
 * `fill` and `compassPoint` from `src/i18n/format.ts`, which cannot be loaded
 * the way the strings are: it reaches through `strings()` into the module that
 * holds the device's chosen language. They are four lines each and they are
 * the only two this tool needs, so they are mirrored rather than imported.
 */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    name in values ? String(values[name]) : whole
  );
}

function compassPoint(azimuthDeg) {
  const points = t.compass;
  const sector = Math.round(azimuthDeg / 45) % points.length;
  return points[(sector + points.length) % points.length];
}

/**
 * The line the breakdown opens with: how many of the marks under it are lit.
 *
 * A scene says which of the four the sky it draws is in, and `all` is the one
 * a scene does not have to say (`scene.sunlight`).
 */
function sunlightLine(scene) {
  const lit = scene.sunlight ?? { of: "all" };
  return fill(t.scene.sunlight[lit.of], { count: lit.count });
}

/**
 * The five figures down the card, as the app builds them: the labels from
 * `card.facts`, the units from `units`, and the bearing through the same
 * compass table the strip along the foot of the frame is lettered from. See
 * `lookDirection` in `src/i18n/format.ts`, which this follows exactly.
 */
/**
 * The two lines of store copy around the frame, in the language being drawn.
 *
 * Falls back rather than throwing: a caption a new language has not been given
 * yet should hold up the listing for that storefront, not the whole run.
 */
function caption(scene) {
  return scene.caption[locale] ?? scene.caption[FALLBACK_LOCALE];
}

function figureRows(figures) {
  return [
    [t.card.facts.distance, fill(t.units.km, { value: figures.distanceKm })],
    [t.card.facts.altitude, fill(t.units.km, { value: figures.altitudeKm })],
    [t.card.facts.speed, fill(t.units.kmPerSecond, { value: figures.speedKmPerSecond })],
    [
      t.card.facts.look,
      `${compassPoint(figures.azimuthDeg)} ${figures.azimuthDeg}° · ${fill(t.units.up, {
        degrees: figures.elevationDeg
      })}`
    ],
    [t.card.facts.orbit, fill(t.units.minutes, { value: figures.orbitMinutes })]
  ];
}

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

const CATEGORY_ORDER = ["LANDMARK", "NAVIGATION", "EARTH", "INTERNET", "TELECOM", "OTHER"];
/** `SUBCATEGORIES_OF`: which rows hang under which category, in the app's order. */
const SUBCATEGORY_OF = {
  EARTH: ["WEATHER", "IMAGING"],
  INTERNET: ["STARLINK", "CONSTELLATIONS"],
  TELECOM: ["BROADCAST", "MOBILE"]
};
/** `CATEGORY_COLORS`: one pastel per category, day and night. */
const CATEGORY_COLORS = {
  LANDMARK: "#fbe6af",
  NAVIGATION: "#faa29f",
  EARTH: "#a1e4ae",
  INTERNET: "#c09aeb",
  TELECOM: "#85d0ee",
  OTHER: "#a9a49e"
};

/** A colour as `rgba()`, for the thinned-out band a swatch glows in. */
function thinned(color, alpha) {
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * The glyphs the control layer wears, as SVG.
 *
 * The app composes these out of views because React Native has no vector
 * primitive without another native dependency (`src/components/Icon.tsx`); a
 * browser has one, so these are the same shapes drawn the short way. Same
 * proportions, same stroke weights, same colours.
 */
const ICONS = {
  layers: (color) =>
    `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round">
      <path d="M10 2.6 17 6.6 10 10.6 3 6.6z" fill="${color}"/>
      <path d="M3 10 10 14 17 10"/>
      <path d="M3 13.4 10 17.4 17 13.4"/>
    </svg>`,
  sky: (color, size = 21) =>
    `<svg viewBox="0 0 22 22" width="${size}" height="${size}" fill="none">
      <ellipse cx="11" cy="11" rx="10" ry="3.7" stroke="${color}" stroke-width="1.7"
               opacity="0.85" transform="rotate(-26 11 11)"/>
      <circle cx="17.2" cy="7.1" r="2.6" fill="${color}"/>
    </svg>`,
  catalog: (color) =>
    `<svg viewBox="0 0 20 20" width="20" height="20" fill="${color}">
      <circle cx="2.2" cy="4.6" r="1.5"/><rect x="6" y="3.7" width="12" height="1.8" rx="0.9"/>
      <circle cx="2.2" cy="10" r="1.5"/><rect x="6" y="9.1" width="12" height="1.8" rx="0.9"/>
      <circle cx="2.2" cy="15.4" r="1.5"/><rect x="6" y="14.5" width="12" height="1.8" rx="0.9"/>
    </svg>`,
  settings: (color) =>
    `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round">
      <path d="M1.6 6.6h16.8" opacity="0.65"/><circle cx="7.2" cy="6.6" r="2.2" fill="${color}" stroke="none"/>
      <path d="M1.6 13.4h16.8" opacity="0.65"/><circle cx="13.6" cy="13.4" r="2.2" fill="${color}" stroke="none"/>
    </svg>`,
  chevron: (color, direction = "up", size = 16) => {
    const points = { up: "4,10 8,6 12,10", down: "4,6 8,10 12,6", right: "6,4 10,8 6,12" }[direction];
    return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="${color}"
                 stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="${points}"/>
    </svg>`;
  }
};

/** The eight points the compass strip carries, from north, clockwise. */
/** The app's own letters, which are not the same eight in every language. */
const COMPASS_POINTS = t.compass;

/**
 * How far either side of the middle the strip reaches, in degrees.
 * `MINIMUM_HALF_SPAN_DEG` in `HorizonCompass`, which is what the phone uses:
 * the camera shows about twenty degrees across and twenty degrees of an
 * eight-point compass is a strip with one letter on it.
 */
const COMPASS_HALF_SPAN_DEG = 62;

/**
 * The app's name, and the one figure the sky view reports.
 *
 * The count is the marks **on the screen** rather than the marks on the frame,
 * as the app counts it: the picture covers the screen, so the marks past its
 * sides are drawn and clipped, and a count that included them would be a
 * number nobody can check against the sky in front of them. See
 * `pointInViewport`.
 */
function headerPanel(scene) {
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
        <div class="sunlight">${escape(sunlightLine(scene))}</div>
        ${breakdown.rows
          .map(
            ([name, tally]) =>
              `<div class="row"><span class="name">${escape(name)}</span><span class="tally">${tally}</span></div>`
          )
          .join("\n        ")}
        <div class="row other"><span class="name">${escape(t.scene.breakdown.other)}</span><span class="tally">${other}</span></div>
      </div>`
    : "";
  const filterOpen = scene.panels.filter === "open";

  return `<div class="header">
      <div class="titles">
        <div class="wordmark">Stare</div>
        <div class="count-row">
          <span class="count">${escape(fill(t.scene.visibleSatellites, { count }))}</span>
          ${ICONS.chevron("rgba(147, 167, 192, 0.5)", open ? "up" : "down", 12)}
        </div>
        ${rows}
      </div>
      <div class="iconbutton${filterOpen ? " on" : ""}">
        ${ICONS.layers(filterOpen ? "var(--accent)" : "var(--text)")}
      </div>
    </div>`;
}

/** The category filter, hanging from the button in the header. */
function filterPanel(scene) {
  if (scene.panels.filter !== "open") return "";
  return `<div class="filter">
      <div class="filter-head"><span class="panel-title">${escape(t.filter.title)}</span></div>
      ${CATEGORY_ORDER.map((category) => {
        const swatch = `background:${CATEGORY_COLORS[category]};border-color:${thinned(CATEGORY_COLORS[category], 0.3)}`;
        const subs = (SUBCATEGORY_OF[category] ?? []).map(
          (key) => `<div class="row sub">
        <span class="swatch" style="${swatch}"></span>
        <span class="name">${escape(t.filter.subcategories[key])}</span>
        <span class="toggle on"><span class="knob"></span></span>
      </div>`
        );
        return [
          `<div class="row">
        <span class="swatch" style="${swatch}"></span>
        <span class="name">${escape(t.filter.categories[category])}</span>
        <span class="toggle on"><span class="knob"></span></span>
      </div>`,
          ...subs
        ].join("\n      ");
      }).join("\n      ")}
      <div class="key"><span class="ring"></span><span>${escape(t.filter.ringKey)}</span></div>
      <div class="show-all">${escape(t.filter.showAll)}</div>
    </div>`;
}

/**
 * The rule of cardinal points along the foot of the picture.
 *
 * Placed as the app places them: linear in the bearing, the middle of the
 * strip being where the camera is pointing, and the nearest point lit. See
 * `HorizonCompass`.
 */
function compassStrip(scene) {
  const heading = scene.headingDeg ?? 0;
  const marks = COMPASS_POINTS.flatMap((label, index) => {
    // The nearest turn of the ring, so a heading either side of north still
    // has points on both sides of the marker.
    return [-360, 0, 360].map((turn) => {
      const offset = index * 45 + turn - heading;
      return { label, offset, near: Math.abs(offset) < 22.5 };
    });
  }).filter((mark) => Math.abs(mark.offset) <= COMPASS_HALF_SPAN_DEG);

  return `<div class="compass">
      <div class="points">
        ${marks
          .map(
            (mark) =>
              `<span class="point${mark.near ? " near" : ""}" style="left:${(
                50 +
                (mark.offset / COMPASS_HALF_SPAN_DEG) * 50
              ).toFixed(2)}%">${mark.label}<i></i></span>`
          )
          .join("\n        ")}
      </div>
      <div class="rule">${[0.08, 0.22, 0.34, 0.22, 0.08]
        .map((opacity) => `<span style="opacity:${opacity}"></span>`)
        .join("")}</div>
      <div class="diamond"></div>
    </div>`;
}

/** What a tapped satellite is, or — with nothing tapped — the next pass. */
function bottomCard(scene) {
  return scene.card ? satelliteCard(scene) : passesCard(scene);
}

function satelliteCard(scene) {
  const card = scene.card;
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
      <div class="grip"><span></span></div>
      ${strip}
      <div class="head">
        <span class="badge" style="border-color:${thinned(CATEGORY_COLORS[card.category], 0.35)}"><span class="mark${card.parked ? " ring" : ""}" style="${card.parked ? `border-color:${CATEGORY_COLORS[card.category]}` : `background:${CATEGORY_COLORS[card.category]};border-color:${thinned(CATEGORY_COLORS[card.category], 0.3)}`}"></span></span>
        <div class="heading">
          <div class="name">${escape(card.selected)}</div>
          <div class="purpose-label">${escape(t.filter.categories[card.category])}</div>
        </div>
        <div class="close">✕</div>
      </div>
      <div class="briefing">
        <p>${escape(card.briefing[locale] ?? card.briefing[FALLBACK_LOCALE])}</p>
        <div class="site">${escape(card.site)} ↗</div>
      </div>
      <div class="facts">
        ${figureRows(card.figures)
          .map(
            ([label, value]) =>
              `<div class="fact"><span class="label">${escape(label)}</span><span class="value">${escape(value)}</span></div>`
          )
          .join("\n        ")}
      </div>
    </div>`;
}

/**
 * The same card with nothing tapped: what is coming over, and when.
 *
 * Shut, which is how it stands unless somebody opens it — the next pass, where
 * to stand for it and whether it can be seen. See `UpcomingPasses`.
 */
function passesCard(scene) {
  const pass = scene.pass;
  if (!pass) return "";
  // The app lights this line only for what an unaided eye can actually catch.
  const seen = pass.seeing === "visible";
  const when =
    pass.inMinutes === null
      ? t.scene.passes.now
      : fill(t.units.minutes, { value: pass.inMinutes });
  const where = `${compassPoint(pass.azimuthDeg)} · ${fill(t.units.up, {
    degrees: pass.elevationDeg
  })}`;

  return `<div class="card passes">
      <div class="grip"><span></span></div>
      <div class="head">
        <span class="badge accent">${ICONS.sky("var(--accent)", 20)}</span>
        <div class="heading">
          <div class="pass-name"><span>${escape(pass.name)}</span><span class="when">${escape(when)}</span></div>
          <div class="pass-meta">${escape(where)} · <span${
            seen ? ' class="visible"' : ""
          }>${escape(t.scene.passes.seeing[pass.seeing])}</span></div>
        </div>
        ${ICONS.chevron("rgba(147, 167, 192, 0.5)", "up")}
      </div>
    </div>`;
}

/**
 * The bar along the bottom: the sky, the catalog and the settings.
 *
 * The sky is always the tab a screenshot is taken on — these are pictures of
 * the app doing the thing it is for — so the other two are only ever the way
 * out of it.
 */
function tabBar() {
  const tabs = [
    ["sky", t.tabs.sky, true],
    ["catalog", t.tabs.catalog, false],
    ["settings", t.tabs.settings, false]
  ];
  return `<div class="tabbar">
      ${tabs
        .map(
          ([icon, label, on]) =>
            `<div class="tab${on ? " on" : ""}">${ICONS[icon](
              on ? "var(--accent)" : "var(--text-dim)"
            )}<span>${label}</span></div>`
        )
        .join("\n      ")}
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

    <!-- And the app's own controls, inset off both of them. See
         \`SafeAreaLayer\`: a title and one button at the top, a stack at the
         bottom, and nothing at all in the middle. -->
    <div class="hud">
      ${headerPanel(scene)}
      ${filterPanel(scene)}
      <div class="bottom">
        ${compassStrip(scene)}
        ${bottomCard(scene)}
        ${tabBar()}
      </div>
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
  const shadow = scene.palette.labelShadow;
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
  <h1>${escape(caption(scene).title)}</h1>
  <p>${escape(caption(scene).body)}</p>
</div>
<div class="device"><img src="data:image/png;base64,${screenPng}" alt=""></div>
<script>
/*
 * A night in the app's own blues: a radial grade with a thin scatter of stars,
 * so the frame around the phone belongs to the app rather than to a template.
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
  console.log(`  drawing the ${locale} set`);
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
    console.log(`  ${scene.id} → ${relative(root, out)}`);
  });
}

main();
