/*
 * The picture behind the markers.
 *
 * These frames are built without a phone in the room, so the camera's own
 * picture is drawn rather than photographed: a graded sky, stars placed by a
 * seeded generator, a skyline of blocks and trees, and the grain and falloff a
 * phone camera puts on a night sky. It is a stand-in and is meant to be
 * replaced — drop a real capture in `tools/screenshots/backgrounds/<id>.jpg`
 * and the scene uses that instead, with everything else unchanged.
 *
 * What it is not is a decoration behind an overlay. The skyline here is the
 * same geometry the scene file places markers against, which is what makes the
 * occlusion frame say something true: the marks stop where the roof starts.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADES = {
  night: {
    stops: [
      [0, "#050a16"],
      [0.45, "#0a1424"],
      [0.78, "#132132"],
      [1, "#2a2a30"]
    ],
    glow: "rgba(255, 176, 92, 0.20)",
    stars: 210,
    silhouette: "#05070c",
    window: "rgba(255, 197, 116, 0.85)"
  },
  twilight: {
    stops: [
      [0, "#101d3c"],
      [0.4, "#254063"],
      [0.72, "#6b5f74"],
      [1, "#d08a5c"]
    ],
    glow: "rgba(255, 158, 88, 0.34)",
    stars: 70,
    silhouette: "#0b0d15",
    window: "rgba(255, 205, 130, 0.6)"
  },
  day: {
    stops: [
      [0, "#1f5aa0"],
      [0.45, "#4d8fca"],
      [0.78, "#8fbadf"],
      [1, "#c3d7e6"]
    ],
    glow: "rgba(255, 246, 226, 0.28)",
    stars: 0,
    silhouette: "#182029",
    window: "rgba(160, 190, 215, 0.55)"
  }
};

/** The sky itself: a vertical grade, with the horizon's own light under it. */
function paintSky(context, width, height, grade) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  for (const [offset, color] of grade.stops) sky.addColorStop(offset, color);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * 0.5,
    height * 1.02,
    0,
    width * 0.5,
    height * 1.02,
    height * 0.85
  );
  glow.addColorStop(0, grade.glow);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function paintStars(context, width, height, count, random) {
  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    // Thinned towards the horizon, where a real sky is washed out by the town.
    const y = Math.pow(random(), 0.75) * height * 0.92;
    const fade = 1 - y / height;
    const radius = 0.35 + random() * 0.85;
    context.globalAlpha = (0.18 + random() * 0.62) * (0.35 + fade * 0.65);
    context.fillStyle = random() > 0.85 ? "#cfe0ff" : "#ffffff";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function paintClouds(context, width, height, random) {
  for (let index = 0; index < 5; index += 1) {
    const x = random() * width;
    const y = height * (0.12 + random() * 0.6);
    const scale = height * (0.06 + random() * 0.12);
    const cloud = context.createRadialGradient(x, y, 0, x, y, scale * 2.4);
    cloud.addColorStop(0, "rgba(255, 255, 255, 0.32)");
    cloud.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = cloud;
    context.save();
    context.translate(x, y);
    context.scale(2.1, 0.62);
    context.translate(-x, -y);
    context.beginPath();
    context.arc(x, y, scale * 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

/**
 * A block of building, with the windows a night one has lit.
 *
 * Shapes arrive in fractions of the picture, so a scene can be read as a
 * drawing rather than as a list of pixels, and so the marker placed just clear
 * of a roof stays just clear of it at any size.
 */
function paintBlock(context, width, height, shape, grade, random, lit) {
  const x = shape.x * width;
  const w = shape.w * width;
  const top = shape.top * height;
  context.fillStyle = grade.silhouette;
  context.fillRect(x, top, w, height - top);

  if (shape.antenna) {
    const mast = x + w * (shape.antennaAt ?? 0.5);
    context.fillRect(mast - 1.2, top - shape.antenna * height, 2.4, shape.antenna * height);
  }

  if (!lit) return;
  const columns = Math.max(2, Math.round(w / 11));
  const rows = Math.max(2, Math.round((height - top) / 15));
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (random() > 0.34) continue;
      const wx = x + 5 + column * (w - 8) / columns;
      const wy = top + 8 + row * (height - top - 8) / rows;
      context.globalAlpha = 0.35 + random() * 0.55;
      context.fillStyle = grade.window;
      context.fillRect(wx, wy, Math.min(3.2, w / columns / 2.4), 3.6);
    }
  }
  context.globalAlpha = 1;
}

/** A tree: a lumpy silhouette rather than a rectangle, built from one seed. */
function paintTree(context, width, height, shape, grade, random) {
  const x = shape.x * width;
  const top = shape.top * height;
  const spread = shape.w * width;
  context.fillStyle = grade.silhouette;
  context.beginPath();
  context.moveTo(x - spread / 2, height);
  for (let step = 0; step <= 22; step += 1) {
    const along = step / 22;
    const angle = Math.PI * along;
    const wobble = 0.82 + random() * 0.3;
    context.lineTo(
      x - Math.cos(angle) * (spread / 2) * wobble,
      height - (height - top) * Math.sin(angle) * wobble
    );
  }
  context.lineTo(x + spread / 2, height);
  context.closePath();
  context.fill();
  context.fillRect(x - spread * 0.04, top + (height - top) * 0.4, spread * 0.08, height);
}

/** Sensor grain, which is most of what tells a photograph from a fill. */
function paintGrain(context, width, height, random, strength) {
  const image = context.createImageData(Math.ceil(width), Math.ceil(height));
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const value = 128 + (random() - 0.5) * 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.save();
  context.globalCompositeOperation = "overlay";
  context.globalAlpha = strength;
  const grain = document.createElement("canvas");
  grain.width = image.width;
  grain.height = image.height;
  grain.getContext("2d").putImageData(image, 0, 0);
  context.drawImage(grain, 0, 0, width, height);
  context.restore();
}

/** The lens's own falloff towards the corners. */
function paintVignette(context, width, height) {
  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawSky(context, width, height, config) {
  const grade = GRADES[config.mode];
  const random = mulberry32(config.seed ?? 7);
  paintSky(context, width, height, grade);
  if (config.mode === "day") paintClouds(context, width, height, random);
  else paintStars(context, width, height, grade.stars, random);

  for (const shape of config.skyline ?? []) {
    if (shape.type === "tree") paintTree(context, width, height, shape, grade, random);
    else paintBlock(context, width, height, shape, grade, random, config.mode !== "day");
  }

  paintGrain(context, width, height, random, config.mode === "day" ? 0.05 : 0.12);
  paintVignette(context, width, height);
}

window.StareSky = { drawSky };
