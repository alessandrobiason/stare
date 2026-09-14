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
 * scene file as frame percentages, as they would from the projection, and a
 * trail is laid straight back along the scene's heading — which over three
 * quarters of a minute is what a real orbit on this lens is, to a pixel or two.
 */

const SATELLITE_MARKERS = {
  nearDiameterPx: 17,
  farDiameterPx: 8,
  nearRangeKm: 400,
  farRangeKm: 40000,
  labelClearancePx: { x: 46, y: 11 }
};

const DESIGN_FRAME_WIDTH_PX = 720;
const CORE_DIAMETER_RATIO = 0.52;
const RING_DIAMETER_RATIO = 0.8;
const GLOW_RATIO = 1;
const GLOW_ALPHA = 0.8;
const BLOOM_RATIO = 2.6;
const BLOOM_ALPHA = 0.35;
const TAIL_ALPHA = 0.8;
const FAR_STRENGTH = 0.5;
const SELECTED_GROWTH = 1.25;
const TRAIL_WIDTH_RATIO = 0.3;
const MIN_TRAIL_WIDTH_PX = 1.4;
/**
 * `trailSeconds` over the twelve seconds a scene's `travelPct` is quoted in: a
 * scene says how fast an object crosses the frame, and the trail is that speed
 * over the app's own window.
 */
const TRAIL_WINDOWS = 45 / 12;
const TRAIL_POINTS = 9;
/** `TAIL_DASH`: solid from the mark, then dashes that shorten as their gaps widen. */
const TAIL_DASH = {
  solidShare: 0.3,
  solidPx: 64,
  dashPx: 11,
  gapPx: 4,
  dashGrowth: 0.82,
  gapGrowth: 1.34,
  maxDashes: 32
};
const MINIMUM_TRAIL_PX = 4;
const OUTLINE_RATIO = 0.1;
const MIN_OUTLINE_PX = 1;
const MIN_EDGE_PX = 0.9;
const RING_RATIO = 0.2;
const MIN_RING_PX = 1;
const HALO_MARGIN_PX = 6;
const SELECTION_GAP_PX = 5;
const SELECTION_WIDTH_PX = 1.5;
const LABEL_GAP_PX = 5;
const ARC_LABEL_GAP_PX = 10;

/** `TAIL_FADE`, `GLOW_FADE`, `BLOOM_FADE` and `CORE_FADE`. */
const TAIL_FADE = [
  { at: 0, strength: 1 },
  { at: 0.12, strength: 0.8 },
  { at: 0.45, strength: 0.32 },
  { at: 1, strength: 0 }
];
const GLOW_FADE = [
  { at: 0, strength: 1 },
  { at: 0.12, strength: 0.7 },
  { at: 0.35, strength: 0.22 },
  { at: 1, strength: 0 }
];
const BLOOM_FADE = [
  { at: 0, strength: 1 },
  { at: 0.2, strength: 0.45 },
  { at: 0.5, strength: 0.12 },
  { at: 1, strength: 0 }
];
const CORE_FADE = [
  { at: 0, strength: 1 },
  { at: 0.5, strength: 1 },
  { at: 1, strength: 0 }
];

/**
 * The landmarks' paths, as `LANDMARK_PATHS` has them: thin dashes in the landmark colour on the
 * marks' dark edge for the arc an object is about to cross, marked at every
 * round clock minute, and fading with how far ahead its pass is.
 *
 * The app works the arc out by propagating the orbit and projecting it
 * (`src/satellite/orbitPath.ts`); a scene here quotes the two ends of it, which
 * is the same line in the form a human can place. Over the sixty degrees one
 * frame spans it is straight either way: a rectilinear projection maps a great
 * circle to a straight line, and a pass is one to well inside a pixel.
 *
 * The app measures its dashes in degrees of sky (`dashDeg`, `dashGapDeg`); on
 * the phone's own lens a degree in the middle of the frame is 12.4 pixels at
 * the design width, which is what these are.
 */
const LANDMARK_PATHS = {
  widthPx: 1.5,
  dashPx: 7.4,
  dashGapPx: 5.6,
  arrowLengthPx: 9,
  arrowSpreadPx: 6,
  nearOpacity: 0.8,
  farOpacity: 0.25
};

/** `CATEGORY_COLORS`, `CATEGORY_BLOOMS`, `CATEGORY_EDGES` and `MARK_EDGE`: every mark, day and night. */
const CATEGORY_COLORS = {
  LANDMARK: "#fbe6af",
  NAVIGATION: "#faa29f",
  EARTH: "#a1e4ae",
  INTERNET: "#c09aeb",
  TELECOM: "#85d0ee",
  OTHER: "#a9a49e"
};
const CATEGORY_BLOOMS = {
  LANDMARK: "#e6c77c",
  NAVIGATION: "#ea7d76",
  EARTH: "#6bc987",
  INTERNET: "#a573da",
  TELECOM: "#46b2dd",
  OTHER: "#8e8479"
};
const CATEGORY_EDGES = {
  LANDMARK: "#564519",
  NAVIGATION: "#632d2a",
  EARTH: "#255032",
  INTERNET: "#482f62",
  TELECOM: "#09495f",
  OTHER: "#413c38"
};
const MARK_EDGE = { color: "#05070a", alpha: 0.9 };

const NIGHT_PALETTE = {
  categories: CATEGORY_COLORS,
  blooms: CATEGORY_BLOOMS,
  outline: MARK_EDGE,
  halo: { color: "#ffffff", alpha: 0.18 },
  glow: 1,
  edge: 0,
  label: "#ffffff",
  labelShadow: "rgba(3, 9, 17, 0.85)"
};

const DAYLIGHT_PALETTE = {
  categories: CATEGORY_COLORS,
  blooms: CATEGORY_BLOOMS,
  outline: MARK_EDGE,
  halo: { color: "#04121f", alpha: 0.2 },
  glow: 0,
  edge: 1,
  label: "#10161c",
  labelShadow: "rgba(244, 248, 253, 0.9)"
};

function paletteFor(name) {
  return name === "daylight" ? DAYLIGHT_PALETTE : NIGHT_PALETTE;
}

/** `rangeShare`: nought at the near end of the range scale, one at the far. */
function rangeShare(range) {
  const { nearRangeKm, farRangeKm } = SATELLITE_MARKERS;
  if (!(range > nearRangeKm)) return 0;
  return Math.min(1, Math.log10(range / nearRangeKm) / Math.log10(farRangeKm / nearRangeKm));
}

/** `markerDiameterPx`: the footprint, on the log range scale. */
function markerDiameterPx(range) {
  const { nearDiameterPx, farDiameterPx } = SATELLITE_MARKERS;
  return nearDiameterPx - (nearDiameterPx - farDiameterPx) * rangeShare(range);
}

/** `BRIGHT_BACKDROP` and `backdropEdge`: how much edge a mark needs for what is behind it. */
const BRIGHT_BACKDROP = { edgeFromLuminance: 0.45, edgeFullLuminance: 0.7 };
function backdropEdge(backdrop) {
  if (backdrop === undefined) return 0;
  const { edgeFromLuminance, edgeFullLuminance } = BRIGHT_BACKDROP;
  const along = Math.min(1, Math.max(0, (backdrop - edgeFromLuminance) / (edgeFullLuminance - edgeFromLuminance)));
  return along * along * (3 - 2 * along);
}

/** `depthStrength`: how strongly a mark's glow and tail are drawn for its range. */
function depthStrength(range) {
  return 1 - (1 - FAR_STRENGTH) * rangeShare(range);
}

/**
 * Where the object has been over the trail window, as `trailPixels` lays it
 * out: the mark's centre, then the points behind it. The scenes quote a heading
 * and how much of the frame the object covers in twelve seconds, which is the
 * same two numbers in the form a human can place.
 */
function trailFor(marker, x, y, box) {
  if (marker.parked || !marker.travelPct) return null;
  const radians = (marker.headingDeg ?? 90) * (Math.PI / 180);
  const length = (marker.travelPct / 100) * box.width * TRAIL_WINDOWS;
  if (!(length > MINIMUM_TRAIL_PX)) return null;
  const points = [x, y];
  for (let index = 1; index <= TRAIL_POINTS; index += 1) {
    const along = (length * index) / TRAIL_POINTS;
    points.push(x - Math.cos(radians) * along, y + Math.sin(radians) * along);
  }
  return { points, length };
}

/** `tailFor`: the solid stretch from the mark, then the dashes. */
function tailFor(path, width, alpha, rim, scale) {
  const { points, length } = path;
  const { solidShare, solidPx, dashPx, gapPx, dashGrowth, gapGrowth, maxDashes } = TAIL_DASH;
  const spans = [[0, Math.min(length * solidShare, solidPx * scale)]];
  let dash = dashPx * scale;
  let gap = gapPx * scale;
  let at = spans[0][1] + gap;
  while (at < length && spans.length <= maxDashes) {
    spans.push([at, Math.min(length, at + dash)]);
    at += dash;
    dash *= dashGrowth;
    gap *= gapGrowth;
    at += gap;
  }
  return {
    runs: spans.map(([from, to]) => stretchOf(points, from, to)),
    tipX: points[points.length - 2],
    tipY: points[points.length - 1],
    length,
    width,
    alpha,
    rim
  };
}

/** `stretchOf`: the part of a polyline between two distances along it. */
function stretchOf(points, from, to) {
  const run = [];
  let walked = 0;
  for (let index = 2; index < points.length; index += 2) {
    const [x0, y0, x1, y1] = [points[index - 2], points[index - 1], points[index], points[index + 1]];
    const step = Math.hypot(x1 - x0, y1 - y0);
    const next = walked + step;
    if (next >= from && step > 0) {
      if (run.length === 0) {
        const share = (from - walked) / step;
        run.push(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
      }
      if (next >= to) {
        const share = (to - walked) / step;
        run.push(x0 + (x1 - x0) * share, y0 + (y1 - y0) * share);
        return run;
      }
      run.push(x1, y1);
    }
    walked = next;
  }
  return run;
}

/**
 * `pathShapeFor`: one landmark's arc as the dashes and marks that draw it.
 *
 * The marks along it are placed by distance rather than by clock, which is the
 * same thing at this scale: a scene says how much of the frame the object
 * covers in a minute (`tickPct`), exactly as a marker says how much it covers
 * in the twelve seconds of its tail. The first one falls part of the way in,
 * because the app puts them on round minutes and the object does not rise on
 * one.
 *
 * The dashes are counted from the line's start, which a scene puts at the
 * object for a pass under way — where the app counts them from too.
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
  const dashes = [];

  if (length > 0) {
    // Along the line and across it, both in pixels: the frame is not square, so
    // a mark laid out in percent would sit square to the line only where the
    // line happened to be level.
    const alongX = dx / length;
    const alongY = dy / length;

    const dash = LANDMARK_PATHS.dashPx * scale;
    const every = dash + LANDMARK_PATHS.dashGapPx * scale;
    for (let at = 0; at < length; at += every) {
      const end = Math.min(length, at + dash);
      dashes.push([from.x + alongX * at, from.y + alongY * at, from.x + alongX * end, from.y + alongY * end]);
    }

    const step = ((path.tickPct ?? 0) / 100) * box.width;
    const offset = ((path.tickOffsetPct ?? (path.tickPct ?? 0) * 0.45) / 100) * box.width;
    for (let at = offset; step > 0 && at <= length; at += step) {
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
    dashes,
    arrows,
    color: palette.categories[path.category ?? "LANDMARK"],
    alpha: pathOpacity(path.lead ?? 0),
    width,
    rimWidth: width + 2 * Math.max(MIN_OUTLINE_PX, width * OUTLINE_RATIO),
    rim: { color: CATEGORY_EDGES[path.category ?? "LANDMARK"], alpha: palette.outline.alpha * palette.edge }
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
    const selected = Boolean(marker.name) && marker.name === selectedName;
    const footprint = markerDiameterPx(marker.rangeKm) * scale;
    const size = selected ? footprint * SELECTED_GROWTH : footprint;
    const strength = selected ? 1 : depthStrength(marker.rangeKm);
    const landmark = marker.category === "LANDMARK";
    const path = trailFor(marker, x, y, box);
    const diameter = size * (marker.parked ? RING_DIAMETER_RATIO : CORE_DIAMETER_RATIO);
    const outline = Math.max(MIN_EDGE_PX, diameter * OUTLINE_RATIO);
    const ring = marker.parked ? Math.max(MIN_RING_PX, diameter * RING_RATIO) : null;
    const opacity = marker.opacity ?? 1;
    // `backdropEdge`: a scene may say how bright the picture is behind a mark.
    const edge = Math.max(palette.edge, backdropEdge(marker.backdrop));
    const light = Math.min(palette.glow, 1 - edge);
    const alpha = opacity * (marker.sunlit === "eclipsed" ? 0.5 : 1);

    glyphs.push({
      x,
      y,
      tail:
        path &&
        tailFor(
          path,
          Math.max(MIN_TRAIL_WIDTH_PX * scale, diameter * TRAIL_WIDTH_RATIO),
          TAIL_ALPHA * strength,
          outline,
          scale
        ),
      rim:
        ring === null
          ? { radius: diameter / 2 + outline, width: null }
          : { radius: (diameter + outline - ring) / 2, width: ring + outline },
      core:
        ring === null
          ? { radius: diameter / 2, width: null }
          : { radius: (diameter - ring) / 2, width: ring },
      glow: { radius: size * GLOW_RATIO, alpha: GLOW_ALPHA * strength * light },
      bloom: { radius: size * BLOOM_RATIO, alpha: BLOOM_ALPHA * strength * light },
      halo: landmark ? size / 2 + HALO_MARGIN_PX * scale : null,
      bloomColor: palette.blooms[marker.category],
      edgeColor: CATEGORY_EDGES[marker.category],
      color: palette.categories[marker.category],
      alpha,
      edgeAlpha: opacity * edge
    });

    if (selected) {
      selection = {
        x,
        y,
        radius: diameter / 2 + SELECTION_GAP_PX * scale + (SELECTION_WIDTH_PX * scale) / 2,
        width: SELECTION_WIDTH_PX * scale,
        rimWidth: (SELECTION_WIDTH_PX + 2 * MIN_OUTLINE_PX) * scale,
        color: palette.categories[marker.category],
        rim: { color: palette.outline.color, alpha: palette.outline.alpha * edge },
        alpha: opacity
      };
    }

    if (landmark && marker.labelled) {
      labels.push({ name: marker.name, x, y, offsetY: footprint / 2 + LABEL_GAP_PX, alpha: opacity });
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

function cssColor(color, alpha) {
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function trace(context, runs) {
  context.beginPath();
  for (const points of runs) {
    context.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      context.lineTo(points[index], points[index + 1]);
    }
  }
}

/** The trail, faded to its tip: its runs stroked in the mark's colour, or `outset` wider in the edge's ink. */
function drawTail(context, glyph, tail, color, alpha, outset) {
  if (!(alpha > 0)) return;
  const fade = context.createLinearGradient(glyph.x, glyph.y, tail.tipX, tail.tipY);
  for (const stop of TAIL_FADE) fade.addColorStop(stop.at, cssColor(color, stop.strength));
  trace(context, tail.runs);
  context.globalAlpha = alpha;
  context.strokeStyle = fade;
  context.lineWidth = tail.width + 2 * outset;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

/** The dark edge under a mark and under its tail. */
function drawRim(context, glyph, palette) {
  const ink = palette.outline;
  if (!(glyph.edgeAlpha > 0)) return;
  if (glyph.tail) drawTail(context, glyph, glyph.tail, glyph.edgeColor, ink.alpha * glyph.edgeAlpha, glyph.tail.rim);
  const { rim } = glyph;
  context.globalAlpha = ink.alpha * glyph.edgeAlpha;
  context.beginPath();
  context.arc(glyph.x, glyph.y, Math.max(0, rim.radius), 0, TWO_PI);
  if (rim.width === null) {
    context.fillStyle = glyph.edgeColor;
    context.fill();
  } else {
    context.strokeStyle = glyph.edgeColor;
    context.lineWidth = rim.width;
    context.stroke();
  }
}

/** One satellite, over the edges: its halo, its bloom and glow, its tail and its point. */
function drawGlyph(context, glyph, palette) {
  const glow = (radius, fade, color, alpha) => {
    if (!(radius > 0) || !(alpha > 0)) return;
    const light = context.createRadialGradient(glyph.x, glyph.y, 0, glyph.x, glyph.y, radius);
    for (const stop of fade) light.addColorStop(stop.at, cssColor(color, stop.strength));
    context.globalAlpha = alpha;
    context.fillStyle = light;
    context.beginPath();
    context.arc(glyph.x, glyph.y, radius, 0, TWO_PI);
    context.fill();
  };

  if (glyph.halo !== null) glow(glyph.halo, GLOW_FADE, palette.halo.color, palette.halo.alpha * glyph.alpha);
  glow(glyph.bloom.radius, BLOOM_FADE, glyph.bloomColor, glyph.bloom.alpha * glyph.alpha);
  glow(glyph.glow.radius, GLOW_FADE, glyph.color, glyph.glow.alpha * glyph.alpha);
  if (glyph.tail) drawTail(context, glyph, glyph.tail, glyph.color, glyph.tail.alpha * glyph.alpha, 0);

  const { core } = glyph;
  if (core.width === null) {
    glow(core.radius, CORE_FADE, glyph.color, glyph.alpha);
    return;
  }
  context.globalAlpha = glyph.alpha;
  context.beginPath();
  context.arc(glyph.x, glyph.y, Math.max(0, core.radius), 0, TWO_PI);
  if (core.width === null) {
    context.fillStyle = glyph.color;
    context.fill();
  } else {
    context.strokeStyle = glyph.color;
    context.lineWidth = core.width;
    context.stroke();
  }
}

/**
 * One landmark's path: the dashes, and the clock minutes on them. Edges for the
 * whole shape first and white afterwards, as the app draws it — a mark sits on
 * the line it belongs to, and drawn in pairs each mark's own edge would cut a
 * dark notch through the arc it is measuring.
 */
function drawPath(context, shape, palette) {
  const draw = (runs, color, alpha, width) => {
    if (runs.length === 0 || !(alpha > 0)) return;
    trace(context, runs);
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  };
  const ink = shape.rim;
  draw(shape.dashes, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  draw(shape.arrows, ink.color, ink.alpha * shape.alpha, shape.rimWidth);
  draw(shape.dashes, shape.color, shape.alpha, shape.width);
  draw(shape.arrows, shape.color, shape.alpha, shape.width);
}

function drawSelection(context, ring) {
  const band = (color, alpha, width) => {
    if (!(alpha > 0)) return;
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
  // Every edge before any mark's light, as the app has it.
  for (const glyph of scene.glyphs) drawRim(context, glyph, scene.palette);
  for (const glyph of scene.glyphs) drawGlyph(context, glyph, scene.palette);
  if (scene.selection) drawSelection(context, scene.selection);
  context.restore();
  return scene;
}

window.StareMarkers = { drawMarkers, paletteFor, markerDiameterPx };
