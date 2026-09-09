/*
 * The satellite overlay, drawn the way the app draws it.
 *
 * A transcription of `src/components/markerScene.ts` and the canvas backend in
 * `SatelliteMarkers.web.tsx`, kept deliberately close to them: the same sizes,
 * the same ratios, the same order of shapes within a mark. A screenshot whose
 * markers are "about right" is a picture of a different app, and the whole
 * point of these frames is that what the store shows is what the phone draws.
 *
 * The one thing it does not do is propagate an orbit. Positions arrive from the
 * scene file as frame percentages, as they would from the projection.
 */

const SATELLITE_MARKERS = {
  nearDiameterPx: 17,
  farDiameterPx: 8,
  nearRangeKm: 400,
  farRangeKm: 40000,
  labelClearancePx: { x: 46, y: 11 }
};

const DESIGN_FRAME_WIDTH_PX = 720;
const TRAIL_WIDTH_RATIO = 0.24;
const OUTLINE_RATIO = 0.16;
const MIN_OUTLINE_PX = 1;
const RING_RATIO = 0.17;
const MIN_RING_PX = 1;
const HALO_MARGIN_PX = 6;
const SELECTION_GAP_PX = 4;
const SELECTION_WIDTH_PX = 3;
const LABEL_GAP_PX = 5;
const ARC_LABEL_GAP_PX = 10;

/**
 * The landmarks' paths, as `LANDMARK_PATHS` has them: a thin rimmed line for
 * the arc an object is about to cross, marked at every round clock minute, and
 * fading with how far ahead its pass is.
 *
 * The app works the arc out by propagating the orbit and projecting it
 * (`src/satellite/orbitPath.ts`); a scene here quotes the two ends of it, which
 * is the same line in the form a human can place. Over the sixty degrees one
 * frame spans it is straight either way: a rectilinear projection maps a great
 * circle to a straight line, and a pass is one to well inside a pixel.
 */
const LANDMARK_PATHS = {
  widthPx: 2,
  arrowLengthPx: 9,
  arrowSpreadPx: 6,
  nearOpacity: 0.8,
  farOpacity: 0.25
};

const CATEGORY_COLORS = {
  LANDMARK: "#fdfdfd",
  NAVIGATION: "#ffcf5c",
  EARTH: "#5fd0d4",
  COMMS: "#7a71cc",
  OTHER: "#48515c"
};

const CATEGORY_COLORS_DAYLIGHT = {
  LANDMARK: "#121212",
  NAVIGATION: "#745913",
  EARTH: "#164547",
  COMMS: "#4e1dbc",
  OTHER: "#808790"
};

const NIGHT_PALETTE = {
  categories: CATEGORY_COLORS,
  outline: { color: "#030911", alpha: 0.85 },
  halo: { color: "#ffffff", alpha: 0.18 },
  label: "#ffffff"
};

const DAYLIGHT_PALETTE = {
  categories: CATEGORY_COLORS_DAYLIGHT,
  outline: { color: "#f4f8fd", alpha: 0.9 },
  halo: { color: "#04121f", alpha: 0.2 },
  label: "#10161c"
};

function paletteFor(name) {
  return name === "daylight" ? DAYLIGHT_PALETTE : NIGHT_PALETTE;
}

/** `markerDiameterPx`: log range scale, clamped at both ends. */
function markerDiameterPx(range) {
  const { nearDiameterPx, farDiameterPx, nearRangeKm, farRangeKm } = SATELLITE_MARKERS;
  if (!(range > nearRangeKm)) return nearDiameterPx;
  const decades = Math.log10(range / nearRangeKm) / Math.log10(farRangeKm / nearRangeKm);
  return Math.max(farDiameterPx, nearDiameterPx - (nearDiameterPx - farDiameterPx) * decades);
}

/**
 * Where the object was a trail-window ago, as the app has it: the reflection of
 * where it is heading. The scenes quote a heading and how much of the frame the
 * object covers, which is the same two numbers in the form a human can place.
 */
function reachFor(marker, box) {
  if (marker.parked || !marker.travelPct) return null;
  const radians = (marker.headingDeg ?? 90) * (Math.PI / 180);
  const length = (marker.travelPct / 100) * box.width;
  return { dx: Math.cos(radians) * length, dy: -Math.sin(radians) * length, length };
}

function tailFor(x, y, reach, width) {
  const alongX = reach.dx / reach.length;
  const alongY = reach.dy / reach.length;
  const acrossX = -alongY * (width / 2);
  const acrossY = alongX * (width / 2);
  return {
    points: [
      x - alongX * reach.length,
      y - alongY * reach.length,
      x + acrossX,
      y + acrossY,
      x - acrossX,
      y - acrossY
    ],
    rimWidth: Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO) * 2
  };
}

/**
 * `pathShapeFor`: one landmark's arc as the lines that draw it.
 *
 * The marks along it are placed by distance rather than by clock, which is the
 * same thing at this scale: a scene says how much of the frame the object
 * covers in a minute (`tickPct`), exactly as a marker says how much it covers
 * in the twelve seconds of its tail. The first one falls part of the way in,
 * because the app puts them on round minutes and the object does not rise on
 * one.
 *
 * Each is an arrowhead whose point is on the minute and whose arms sweep back
 * from it, so a mark says both when the object is there and which way it is
 * heading.
 */
function pathShapeFor(path, box, scale, palette) {
  const from = { x: (path.from.left / 100) * box.width, y: (path.from.top / 100) * box.height };
  const to = { x: (path.to.left / 100) * box.width, y: (path.to.top / 100) * box.height };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const width = LANDMARK_PATHS.widthPx * scale;
  const along = LANDMARK_PATHS.arrowLengthPx * scale;
  const across = LANDMARK_PATHS.arrowSpreadPx * scale;
  const arrows = [];

  if (length > 0 && path.tickPct) {
    // Along the line and across it, both in pixels: the frame is not square, so
    // a mark laid out in percent would sit square to the line only where the
    // line happened to be level.
    const alongX = dx / length;
    const alongY = dy / length;
    const step = (path.tickPct / 100) * box.width;
    const offset = (path.tickOffsetPct ?? path.tickPct * 0.45) / 100 * box.width;
    for (let at = offset; at <= length && step > 0; at += step) {
      const x = from.x + alongX * at;
      const y = from.y + alongY * at;
      const backX = x - alongX * along;
      const backY = y - alongY * along;
      arrows.push([
        backX + alongY * across,
        backY - alongX * across,
        x,
        y,
        backX - alongY * across,
        backY + alongX * across
      ]);
    }
  }

  return {
    lines: [[from.x, from.y, to.x, to.y]],
    arrows,
    color: palette.categories[path.category ?? "LANDMARK"],
    alpha: pathOpacity(path.lead ?? 0),
    width,
    rimWidth: width + 2 * Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO)
  };
}

/** `pathOpacity`: nought is the pass under way, one the far end of the window. */
function pathOpacity(lead) {
  const { nearOpacity, farOpacity } = LANDMARK_PATHS;
  return nearOpacity + (farOpacity - nearOpacity) * lead;
}

/** `buildMarkerScene`, over markers already placed on the frame. */
function buildMarkerScene(markers, box, palette, selectedName, paths) {
  const scale = box.width / DESIGN_FRAME_WIDTH_PX;
  const glyphs = [];
  const labels = [];
  let selection = null;

  for (const marker of markers) {
    const x = (marker.left / 100) * box.width;
    const y = (marker.top / 100) * box.height;
    const size = markerDiameterPx(marker.rangeKm) * scale;
    const outline = Math.max(MIN_OUTLINE_PX, size * OUTLINE_RATIO);
    const color = palette.categories[marker.category];
    const landmark = marker.category === "LANDMARK";
    const reach = reachFor(marker, box);
    const ring = marker.parked ? Math.max(MIN_RING_PX, size * RING_RATIO) : null;
    const alpha = marker.opacity ?? 1;

    glyphs.push({
      x,
      y,
      tail: reach && tailFor(x, y, reach, size * TRAIL_WIDTH_RATIO),
      rim:
        ring === null
          ? { radius: size / 2 + outline, width: null }
          : { radius: (size + outline - ring) / 2, width: ring + outline },
      core:
        ring === null
          ? { radius: size / 2, width: null }
          : { radius: (size - ring) / 2, width: ring },
      halo: landmark ? size / 2 + HALO_MARGIN_PX * scale : null,
      color,
      alpha
    });

    if (marker.name && marker.name === selectedName) {
      const clear = landmark ? size / 2 + HALO_MARGIN_PX * scale : size / 2 + outline;
      selection = {
        x,
        y,
        radius: clear + SELECTION_GAP_PX * scale + (SELECTION_WIDTH_PX * scale) / 2,
        width: SELECTION_WIDTH_PX * scale,
        rimWidth: (SELECTION_WIDTH_PX + 2 * MIN_OUTLINE_PX) * scale,
        color: palette.label,
        rim: palette.outline,
        alpha
      };
    }

    if (landmark && marker.labelled) {
      labels.push({ name: marker.name, x, y, offsetY: size / 2 + LABEL_GAP_PX, alpha });
    }
  }

  // Every arc says whose it is, at a point on the line itself — the app anchors
  // that to one of the arc's own samples and holds it there (`anchorFor`); a
  // scene says where by hand. A pass that has not begun carries the clock time
  // it does, on a second line. Not while the object's own marker is on the
  // frame carrying the name a few pixels away, which is the app's rule too.
  for (const path of paths ?? []) {
    const anchor = path.labelAt;
    if (!anchor || markers.some((marker) => marker.name === path.name && marker.labelled)) continue;
    labels.push({
      name: path.rise ? `${path.name}\n${path.rise}` : path.name,
      x: (anchor.left / 100) * box.width,
      y: (anchor.top / 100) * box.height,
      offsetY: ARC_LABEL_GAP_PX * scale,
      alpha: pathOpacity(path.lead ?? 0)
    });
  }

  return {
    paths: (paths ?? []).map((path) => pathShapeFor(path, box, scale, palette)),
    glyphs,
    selection,
    labels,
    palette
  };
}

const TWO_PI = Math.PI * 2;

function traceTail(context, shape) {
  context.beginPath();
  context.moveTo(shape.points[0], shape.points[1]);
  for (let index = 2; index < shape.points.length; index += 2) {
    context.lineTo(shape.points[index], shape.points[index + 1]);
  }
  context.closePath();
}

function rimTail(context, shape, ink, alpha) {
  traceTail(context, shape);
  context.globalAlpha = ink.alpha * alpha;
  context.fillStyle = ink.color;
  context.fill();
  context.strokeStyle = ink.color;
  context.lineWidth = shape.rimWidth;
  context.stroke();
}

function drawGlyph(context, glyph, palette) {
  const circle = (shape, color, alpha) => {
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(glyph.x, glyph.y, Math.max(0, shape.radius), 0, TWO_PI);
    if (shape.width === null) {
      context.fillStyle = color;
      context.fill();
    } else {
      context.strokeStyle = color;
      context.lineWidth = shape.width;
      context.stroke();
    }
  };

  if (glyph.halo !== null) {
    circle({ radius: glyph.halo, width: null }, palette.halo.color, palette.halo.alpha * glyph.alpha);
  }
  if (glyph.tail) rimTail(context, glyph.tail, palette.outline, glyph.alpha);
  circle(glyph.rim, palette.outline.color, palette.outline.alpha * glyph.alpha);
  if (glyph.tail) {
    traceTail(context, glyph.tail);
    context.globalAlpha = glyph.alpha;
    context.fillStyle = glyph.color;
    context.fill();
  }
  circle(glyph.core, glyph.color, glyph.alpha);
}

/**
 * One landmark's path: the arc, and the clock minutes on it.
 *
 * Rims for the whole shape first and colour afterwards, as the app draws it —
 * a time mark crosses the line it belongs to, so drawn in pairs each mark's own
 * rim would cut a dark notch through the arc it is measuring.
 */
function drawPath(context, shape, palette) {
  const draw = (points, color, alpha, width) => {
    context.beginPath();
    context.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      context.lineTo(points[index], points[index + 1]);
    }
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  };

  const ink = palette.outline;
  for (const run of shape.lines) draw(run, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  for (const arrow of shape.arrows) draw(arrow, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  for (const run of shape.lines) draw(run, shape.color, shape.alpha, shape.width);
  for (const arrow of shape.arrows) draw(arrow, shape.color, shape.alpha, shape.width);
}

function drawSelection(context, ring) {
  const band = (color, alpha, width) => {
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.arc(ring.x, ring.y, Math.max(0, ring.radius), 0, TWO_PI);
    context.stroke();
  };
  band(ring.rim.color, ring.rim.alpha * ring.alpha, ring.rimWidth);
  band(ring.color, ring.alpha, ring.width);
}

/** Draws one frame of markers, and returns the scene so the labels can be laid out. */
function drawMarkers(context, markers, box, paletteName, selectedName, paths) {
  const scene = buildMarkerScene(markers, box, paletteFor(paletteName), selectedName ?? null, paths);
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  // Under the marks, and first: a path is what the marks are read against.
  for (const path of scene.paths) drawPath(context, path, scene.palette);
  for (const glyph of scene.glyphs) drawGlyph(context, glyph, scene.palette);
  if (scene.selection) drawSelection(context, scene.selection);
  context.restore();
  return scene;
}

window.StareMarkers = { drawMarkers, paletteFor, markerDiameterPx };
