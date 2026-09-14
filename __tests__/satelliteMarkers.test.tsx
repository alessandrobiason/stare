import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkerLabels } from "../src/components/MarkerLabels";
import {
  buildMarkerScene,
  CORE_FADE,
  GlyphShape,
  shortName,
  TAIL_DASH,
  TAIL_FADE
} from "../src/components/markerScene";
import { DAYLIGHT_PALETTE, MARK_EDGE, NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteMarkers } from "../src/components/SatelliteMarkers.web";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../src/hooks/useAnimatedMarkers";
import { CATEGORY_BLOOMS, CATEGORY_COLORS } from "../src/satellite/categories";
import { LANDMARK_PATHS, SATELLITE_MARKERS } from "../src/constants";
import { setLocaleForTesting } from "../src/i18n";

const FRAME = { width: 720, height: 1280 };

function marker(overrides: Partial<SatelliteMarker> = {}): SatelliteMarker {
  return {
    name: "SAT",
    category: "COMMS",
    parked: false,
    point: { left: 50, top: 50 },
    rangeKm: 1200,
    trail: [
      { left: 46, top: 53 },
      { left: 42, top: 56 }
    ],
    opacity: 1,
    sunlit: "sunlit",
    ...overrides
  };
}

/** The overlay as it is drawn: shapes in pixels, whichever canvas draws them. */
function scene(markers: SatelliteMarker[], rollDeg = 0, box = FRAME, paths: MarkerPath[] = []) {
  const frame: MarkerFrame = { markers, paths, rollDeg };
  return buildMarkerScene(frame, box, NIGHT_PALETTE);
}

/** The same, with one satellite selected: what a tap leaves on the frame. */
function selectedScene(markers: SatelliteMarker[], name: string, box = FRAME) {
  return buildMarkerScene({ markers, paths: [], rollDeg: 0 }, box, NIGHT_PALETTE, name);
}

/** A run's length along itself, in pixels. */
function runLength(run: number[]): number {
  let length = 0;
  for (let index = 2; index < run.length; index += 2) {
    length += Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]);
  }
  return length;
}

/** How far a run starts along the trail: the length from the mark to its first point. */
function startAlong(glyph: GlyphShape, run: number[], trail: number[]): number {
  let walked = 0;
  for (let index = 2; index < trail.length; index += 2) {
    const [x0, y0, x1, y1] = [trail[index - 2], trail[index - 1], trail[index], trail[index + 1]];
    const step = Math.hypot(x1 - x0, y1 - y0);
    const along = (run[0] - x0) * (x1 - x0) + (run[1] - y0) * (y1 - y0);
    const off = Math.abs((run[0] - x0) * (y1 - y0) - (run[1] - y0) * (x1 - x0)) / step;
    if (off < 1e-6 && along >= -1e-6 && along <= step * step + 1e-6) return walked + along / step;
    walked += step;
  }
  throw new Error(`run does not start on the trail of the mark at ${glyph.x}, ${glyph.y}`);
}

test("draws nothing before the frame has been laid out", () => {
  // Tails are geometry in pixels, and there are no pixels until then.
  expect(
    renderToStaticMarkup(
      <SatelliteMarkers markers={() => () => undefined} frame={null} palette={NIGHT_PALETTE} />
    )
  ).toBe("");
});

test("colours a marker by its category and nothing else, bloom included", () => {
  const { glyphs } = scene([
    marker({ category: "NAVIGATION" }),
    marker({ name: "OTHER SAT", category: "EARTH", rangeKm: 39000 }),
    marker({ name: "ISS", category: "LANDMARK" }),
    marker({ name: "JUNK", category: "OTHER", parked: true, trail: null })
  ]);

  expect(glyphs.map((glyph) => glyph.color)).toEqual([
    CATEGORY_COLORS.NAVIGATION,
    CATEGORY_COLORS.EARTH,
    CATEGORY_COLORS.LANDMARK,
    CATEGORY_COLORS.OTHER
  ]);
  // The light around a mark is the mark's own colour, not a shared one: a
  // satellite is light of that colour rather than a coloured dot in white light.
  expect(glyphs.map((glyph) => glyph.bloomColor)).toEqual([
    CATEGORY_BLOOMS.NAVIGATION,
    CATEGORY_BLOOMS.EARTH,
    CATEGORY_BLOOMS.LANDMARK,
    CATEGORY_BLOOMS.OTHER
  ]);
});

test("draws the same coloured mark on the same dark edge by day as by night", () => {
  const frame: MarkerFrame = { markers: [marker()], paths: [], rollDeg: 0 };
  const night = buildMarkerScene(frame, FRAME, NIGHT_PALETTE);
  const day = buildMarkerScene(frame, FRAME, DAYLIGHT_PALETTE);

  expect(day.glyphs[0].color).toBe(night.glyphs[0].color);
  expect(day.palette.outline).toEqual(MARK_EDGE);
  expect(night.palette.outline).toEqual(MARK_EDGE);
});

test("draws a parked satellite as a ring and gives it no tail", () => {
  const parked = scene([marker({ parked: true, trail: null, rangeKm: 39000 })]);
  const moving = scene([marker()]);

  // A ring is a band of its colour with the sky showing through the middle; a
  // moving marker is the same colour as a filled dot.
  expect(parked.glyphs[0].core.width).toBeGreaterThan(0);
  expect(parked.glyphs[0].tail).toBeNull();
  expect(moving.glyphs[0].core.width).toBeNull();
  expect(moving.glyphs[0].tail).not.toBeNull();
});

test("sizes the marker by distance, not by category", () => {
  const near = scene([marker({ rangeKm: 500, trail: null })]).glyphs[0];
  const far = scene([marker({ rangeKm: 39000, trail: null })]).glyphs[0];

  expect(near.core.radius).toBeGreaterThan(far.core.radius);
});

test("outlines every marker so it survives a bright sky", () => {
  // White cannot be read against a bright sky, so by day the dark edge is what
  // is actually being read.
  for (const category of ["LANDMARK", "COMMS", "OTHER"] as const) {
    const { glyphs } = scene([marker({ category, trail: null })]);
    // The rim is a larger shape under the mark, so the colour keeps its full
    // diameter — drawn as a border inside it, it ate the middle instead.
    expect(glyphs[0].rim.radius).toBeGreaterThan(glyphs[0].core.radius);
  }
  expect(NIGHT_PALETTE.outline.alpha).toBeGreaterThan(0.5);
});

test("haloes the landmarks, and only them", () => {
  const { glyphs } = scene([
    marker({ name: "ISS", category: "LANDMARK", trail: null }),
    marker({ name: "STARLINK-1234", trail: null })
  ]);

  expect(glyphs[0].halo).toBeGreaterThan(glyphs[0].rim.radius);
  expect(glyphs[1].halo).toBeNull();
  expect(NIGHT_PALETTE.halo.alpha).toBeLessThan(0.5);
});

describe("a satellite with no sun on it", () => {
  test("is drawn at half strength, because there is nothing there to see", () => {
    // Half of every orbit is spent inside the Earth's shadow, and an object in
    // there is reflecting nothing. A fainter mark for a fainter object, which
    // is the one thing it can mean. See `sunlightAlpha`.
    const lit = scene([marker({ sunlit: "sunlit" })]).glyphs[0];
    const dark = scene([marker({ sunlit: "eclipsed" })]).glyphs[0];

    expect(lit.alpha).toBe(1);
    expect(dark.alpha).toBeLessThan(lit.alpha);
    expect(dark.alpha).toBeGreaterThan(0.2);
  });

  test("keeps its edge whole, so by day it is still plainly a mark", () => {
    // The white fades; the dark edge, which is what a mark is read by on a
    // bright sky, does not. Terrain still fades both.
    const daylit = (overrides: Partial<SatelliteMarker>) =>
      buildMarkerScene(
        { markers: [marker(overrides)], paths: [], rollDeg: 0 },
        FRAME,
        DAYLIGHT_PALETTE
      ).glyphs[0];
    const dark = daylit({ sunlit: "eclipsed" });
    const hidden = daylit({ sunlit: "eclipsed", opacity: 0.4 });

    expect(dark.edgeAlpha).toBe(1);
    expect(hidden.edgeAlpha).toBeCloseTo(0.4, 6);
  });

  test("keeps every channel it was already spending", () => {
    // Edge, shape, size and heading are all still true of an object nobody
    // can see, and all four are how it is found again when it comes back into
    // the sunlight. Only the opacity, which nothing else uses at rest, moves.
    const lit = scene([marker({ sunlit: "sunlit" })]).glyphs[0];
    const dark = scene([marker({ sunlit: "eclipsed" })]).glyphs[0];

    expect(dark.color).toBe(lit.color);
    expect(dark.core).toEqual(lit.core);
    expect(dark.rim).toEqual(lit.rim);
    expect(dark.tail).toEqual(lit.tail);
  });

  test("does not take the parked ring's shape away from it", () => {
    // The collision that ruled fill out as the channel: a parked object is
    // already a ring, so drawing an unlit one hollow would have said two things
    // with one mark and neither of them clearly.
    const parked = marker({ parked: true, trail: null, rangeKm: 39000 });
    const lit = scene([{ ...parked, sunlit: "sunlit" }]).glyphs[0];
    const dark = scene([{ ...parked, sunlit: "eclipsed" }]).glyphs[0];

    expect(dark.core.width).toBe(lit.core.width);
    expect(dark.alpha).toBeLessThan(lit.alpha);
  });

  test("fades behind terrain on top of that, rather than instead of it", () => {
    // The two compound, which is honest: such a marker really is both in the
    // Earth's shadow and on its way behind a roof.
    const fading = scene([marker({ sunlit: "eclipsed", opacity: 0.4 })]).glyphs[0];
    const settled = scene([marker({ sunlit: "eclipsed", opacity: 1 })]).glyphs[0];

    expect(fading.alpha).toBeLessThan(settled.alpha);
    expect(fading.alpha).toBeCloseTo(settled.alpha * 0.4, 6);
  });

  test("a penumbra is still counted as lit, since it still is", () => {
    // It is on its way into the shadow rather than in it, and how far through
    // that it is has already been paid for in the magnitude the card shows.
    expect(scene([marker({ sunlit: "penumbra" })]).glyphs[0].alpha).toBe(1);
  });
});

test("rims a parked ring outwards, without eating into its colour", () => {
  // The band the ring is drawn as is not a border: it lies under the colour
  // and reaches past it, so the eight pixels a geostationary marker gets are
  // eight pixels of colour rather than colour minus a rim.
  const { glyphs } = scene([marker({ parked: true, trail: null, rangeKm: 39000 })]);
  const { rim, core } = glyphs[0];

  expect(rim.width).not.toBeNull();
  expect(rim.radius + rim.width! / 2).toBeGreaterThan(core.radius + core.width! / 2);
  expect(rim.radius - rim.width! / 2).toBeCloseTo(core.radius - core.width! / 2);
});

test("lays the tail behind the marker, through where the object has been", () => {
  // The icon's shape: the body leads and the trail follows it. A 720x1280
  // frame, so 10% across is 72 px and 10% down is 128.
  const [glyph] = scene([
    marker({
      point: { left: 50, top: 50 },
      trail: [
        { left: 40, top: 50 },
        { left: 30, top: 60 }
      ]
    })
  ]).glyphs;
  const tail = glyph.tail!;

  // It starts under the mark's own centre and ends where the object was.
  expect(tail.runs[0].slice(0, 2)).toEqual([360, 640]);
  expect(tail.tipX).toBeCloseTo(216);
  expect(tail.tipY).toBeCloseTo(768);
  expect(tail.length).toBeCloseTo(72 + Math.hypot(72, 128), 6);
});

test("bends with the path, every dash on it rather than across the corner", () => {
  const trail = [
    { left: 45, top: 50 },
    { left: 40, top: 52 },
    { left: 35, top: 56 },
    { left: 30, top: 62 },
    { left: 25, top: 70 }
  ];
  const [glyph] = scene([marker({ point: { left: 50, top: 50 }, trail })]).glyphs;
  const pixels = [360, 640, ...trail.flatMap((point) => [point.left * 7.2, point.top * 12.8])];

  for (const run of glyph.tail!.runs) {
    for (let index = 0; index < run.length; index += 2) {
      const point = run.slice(index, index + 2);
      expect(() => startAlong(glyph, point, pixels)).not.toThrow();
    }
  }
});

test("is solid where it leaves the mark, then dashes that shorten as their gaps widen", () => {
  const trail = Array.from({ length: 12 }, (_, index) => ({
    left: 50 - (index + 1) * 3,
    top: 50
  }));
  const [glyph] = scene([marker({ point: { left: 50, top: 50 }, trail })]).glyphs;
  const { runs, length } = glyph.tail!;
  const pixels = [360, 640, ...trail.flatMap((point) => [point.left * 7.2, point.top * 12.8])];

  // A long trail across the frame: the solid stretch is capped, so it is not a
  // bar across the picture, and there are many dashes after it.
  expect(runLength(runs[0])).toBeCloseTo(Math.min(length * TAIL_DASH.solidShare, TAIL_DASH.solidPx), 6);
  expect(runs.length).toBeGreaterThan(8);

  const starts = runs.map((run) => startAlong(glyph, run, pixels));
  const lengths = runs.map(runLength);
  for (let index = 2; index < runs.length - 1; index += 1) {
    const gap = starts[index] - (starts[index - 1] + lengths[index - 1]);
    const previousGap = starts[index - 1] - (starts[index - 2] + lengths[index - 2]);
    expect(lengths[index]).toBeLessThan(lengths[index - 1]);
    expect(gap).toBeGreaterThan(previousGap);
  }
  // And none of it runs past where the object was.
  expect(starts[runs.length - 1] + lengths[runs.length - 1]).toBeLessThanOrEqual(length + 1e-6);
});

test("keeps a short trail mostly solid", () => {
  const [glyph] = scene([
    marker({ point: { left: 50, top: 50 }, trail: [{ left: 45, top: 50 }] })
  ]).glyphs;
  const { runs, length } = glyph.tail!;
  expect(runLength(runs[0])).toBeCloseTo(length * TAIL_DASH.solidShare, 6);
  expect(runs.length).toBeLessThan(8);
});

test("draws the tail as a line finer than the point it comes out of", () => {
  const [glyph] = scene([marker({ rangeKm: 500 })]).glyphs;
  expect(glyph.tail!.width).toBeGreaterThan(0);
  expect(glyph.tail!.width).toBeLessThan(glyph.core.radius * 2 * 0.5);
});

test("fades the tail from the point to nothing at its tip", () => {
  // Brightest where it leaves the mark, gone where the object was a minute and
  // a half ago, and never brighter further out than nearer in.
  expect(TAIL_FADE[0]).toEqual({ at: 0, strength: 1 });
  expect(TAIL_FADE[TAIL_FADE.length - 1]).toEqual({ at: 1, strength: 0 });
  for (let index = 1; index < TAIL_FADE.length; index += 1) {
    expect(TAIL_FADE[index].at).toBeGreaterThan(TAIL_FADE[index - 1].at);
    expect(TAIL_FADE[index].strength).toBeLessThan(TAIL_FADE[index - 1].strength);
  }

  // And even where it is strongest it is a shade under the point itself, so
  // the point is the brightest thing on the mark.
  const [glyph] = scene([marker({ rangeKm: 400 })]).glyphs;
  expect(glyph.tail!.alpha).toBeLessThan(1);
  expect(glyph.tail!.alpha).toBeGreaterThan(0.5);
});

describe("a moving mark", () => {
  test("is a small point in a glow, not a disc over the picture", () => {
    const [glyph] = scene([marker({ rangeKm: 400, trail: null })]).glyphs;
    const footprint = SATELLITE_MARKERS.nearDiameterPx;

    // The solid part, rim and all, is well under the disc the range scale used
    // to fill with colour; the rest of that footprint is light fading to nothing.
    expect(glyph.core.radius * 2).toBeLessThan(footprint * 0.6);
    expect(glyph.rim.radius * 2).toBeLessThan(footprint * 0.7);
    expect(glyph.glow.radius).toBeGreaterThan(glyph.rim.radius);
    expect(glyph.glow.alpha).toBeGreaterThan(0);
    expect(glyph.glow.alpha).toBeLessThan(1);
  });

  test("has an edge thick enough to read as a ring on a bright sky", () => {
    // By day the edge is most of what is seen of a white mark, and a single
    // pixel of it is a grey smudge rather than a ring.
    for (const rangeKm of [400, 40000]) {
      const small = { width: 360, height: 640 };
      const [glyph] = scene([marker({ rangeKm, trail: null })], 0, small).glyphs;
      expect(glyph.rim.radius - glyph.core.radius).toBeGreaterThanOrEqual(1.25);
    }
  });

  test("edges its tail as well, a little wider on every side", () => {
    // A white tail on a bright sky is otherwise invisible, and it is the one
    // part of a mark that says which way the object is going.
    const [glyph] = scene([marker()]).glyphs;
    expect(glyph.tail!.rim).toBeGreaterThan(0);
    expect(glyph.tail!.rim).toBeCloseTo(glyph.rim.radius - glyph.core.radius, 6);
  });

  test("is light rather than a disc at night: no edge, and a bloom around its glow", () => {
    // A dark ring round a point of light is what turned it into a sticker on
    // the picture. At night the mark is drawn the way a star photographs.
    const [glyph] = scene([marker()]).glyphs;

    expect(glyph.edgeAlpha).toBe(0);
    expect(glyph.bloom.radius).toBeGreaterThan(glyph.glow.radius);
    expect(glyph.bloom.alpha).toBeGreaterThan(0);
    expect(glyph.bloom.alpha).toBeLessThan(glyph.glow.alpha);
    // The point's own fill softens out to nothing at its rim.
    expect(CORE_FADE[0].strength).toBe(1);
    expect(CORE_FADE[CORE_FADE.length - 1].strength).toBe(0);
  });

  test("gains its edge at night over something bright in the picture", () => {
    // Light with no edge over the moon or a street lamp is not there at all, so
    // over a bright patch the mark is drawn as it is by day: edged, and dark.
    const dark = scene([marker({ backdrop: 0.1 })]).glyphs[0];
    const lamp = scene([marker({ backdrop: 0.95 })]).glyphs[0];
    const unread = scene([marker()]).glyphs[0];

    expect(dark.edgeAlpha).toBe(0);
    expect(unread.edgeAlpha).toBe(0);
    expect(lamp.edgeAlpha).toBe(1);
    expect(lamp.glow.alpha).toBe(0);
    expect(lamp.bloom.alpha).toBe(0);
    // The point, its size and its tail are the same mark either way.
    expect(lamp.core).toEqual(dark.core);
    expect(lamp.tail).toEqual(dark.tail);
  });

  test("eases into that edge rather than switching it on", () => {
    const edges = [0.4, 0.5, 0.6, 0.75].map(
      (backdrop) => scene([marker({ backdrop })]).glyphs[0].edgeAlpha
    );

    expect(edges[0]).toBe(0);
    expect(edges[1]).toBeGreaterThan(0);
    expect(edges[2]).toBeGreaterThan(edges[1]);
    expect(edges[2]).toBeLessThan(1);
    expect(edges[3]).toBe(1);
  });

  test("rings a selected mark over something bright with an edge as well", () => {
    const { selection } = selectedScene([marker({ name: "SAT", backdrop: 0.95 })], "SAT");
    expect(selection!.rim).toEqual(MARK_EDGE);
  });

  test("gains its edge by day, where the white alone would vanish", () => {
    const frame: MarkerFrame = { markers: [marker()], paths: [], rollDeg: 0 };
    const day = buildMarkerScene(frame, FRAME, DAYLIGHT_PALETTE).glyphs[0];

    expect(day.edgeAlpha).toBe(1);
    expect(day.bloom.alpha).toBe(0);
  });

  test("gives off no light by day, where a glow would wash out its edge", () => {
    const frame: MarkerFrame = { markers: [marker()], paths: [], rollDeg: 0 };
    const night = buildMarkerScene(frame, FRAME, NIGHT_PALETTE).glyphs[0];
    const day = buildMarkerScene(frame, FRAME, DAYLIGHT_PALETTE).glyphs[0];

    expect(night.glow.alpha).toBeGreaterThan(0);
    expect(day.glow.alpha).toBe(0);
    // The point, its size and its tail are the same mark either way.
    expect(day.core).toEqual(night.core);
    expect(day.tail).toEqual(night.tail);
  });
});

describe("depth", () => {
  test("draws a nearer satellite's light stronger as well as its point larger", () => {
    const near = scene([marker({ rangeKm: 450 })]).glyphs[0];
    const far = scene([marker({ rangeKm: 20000 })]).glyphs[0];

    expect(near.core.radius).toBeGreaterThan(far.core.radius);
    expect(near.glow.radius).toBeGreaterThan(far.glow.radius);
    expect(near.glow.alpha).toBeGreaterThan(far.glow.alpha);
    expect(near.tail!.alpha).toBeGreaterThan(far.tail!.alpha);
    expect(near.tail!.width).toBeGreaterThan(far.tail!.width);
  });

  test("is restrained: the far end of the scale is still plainly drawn", () => {
    // Two decades out is half strength, not gone — and the point itself is
    // drawn solid at any range.
    const near = scene([marker({ rangeKm: 400 })]).glyphs[0];
    const far = scene([marker({ rangeKm: 40000 })]).glyphs[0];

    expect(far.glow.alpha).toBeCloseTo(near.glow.alpha / 2, 6);
    expect(far.tail!.alpha).toBeCloseTo(near.tail!.alpha / 2, 6);
    expect(far.alpha).toBe(near.alpha);
  });
});

test("fades the whole marker together as it crosses an edge", () => {
  const { glyphs, labels } = scene([
    marker({ name: "ISS", category: "LANDMARK", opacity: 0.4 })
  ]);

  expect(glyphs[0].alpha).toBeCloseTo(0.4);
  expect(labels[0].alpha).toBeCloseTo(0.4);
});

test("names the landmarks and the notable satellites, and nothing else", () => {
  const { labels } = scene([
    marker({ name: "ISS", category: "LANDMARK", rangeKm: 430 }),
    marker({ name: "STARLINK-1234", point: { left: 20, top: 20 } }),
    marker({ name: "STARLINK-1007", point: { left: 80, top: 80 }, notable: "closest" })
  ]);

  expect(labels.map((label) => label.name)).toEqual(["ISS", "STARLINK-1007"]);
});

describe("a notable satellite's name", () => {
  afterEach(() => setLocaleForTesting(undefined));

  test("says why it is there, in the reader's language", () => {
    setLocaleForTesting("it");
    const { labels } = scene([
      marker({ name: "STARLINK-1007", notable: "closest" }),
      marker({ name: "INTELSAT 33E", point: { left: 20, top: 20 }, notable: "farthest" })
    ]);

    expect(labels.map((label) => label.detail)).toEqual(["Il più vicino", "Il più lontano"]);
  });

  test("names a navigation satellite's system where it has a name", () => {
    const { labels } = scene([
      marker({ name: "NAVSTAR 81 (USA 319)", category: "NAVIGATION", notable: "navigation" })
    ]);

    expect(labels[0].name).toBe("NAVSTAR 81");
    expect(labels[0].detail).toBe("GPS");
  });

  test("falls back to the category's word for a system with no name", () => {
    const { labels } = scene([
      marker({ name: "SOME NAVSAT", category: "NAVIGATION", notable: "navigation" })
    ]);

    expect(labels[0].detail).toBe("Navigation");
  });

  test("yields to a landmark's where the two collide, whatever order they come in", () => {
    const iss = marker({ name: "ISS", category: "LANDMARK", point: { left: 50, top: 50 } });
    const near = marker({
      name: "STARLINK-1007",
      point: { left: 50.4, top: 50.1 },
      notable: "closest"
    });

    expect(scene([near, iss]).labels.map((label) => label.name)).toEqual(["ISS"]);
    expect(scene([iss, near]).labels.map((label) => label.name)).toEqual(["ISS"]);
  });

  test("and the nearest's wins over the farthest's", () => {
    const far = marker({ name: "FAR", point: { left: 50, top: 50 }, notable: "farthest" });
    const near = marker({ name: "NEAR", point: { left: 50.4, top: 50.1 }, notable: "closest" });

    expect(scene([far, near]).labels.map((label) => label.name)).toEqual(["NEAR"]);
  });
});

test("a landmark's name carries no reason line: it explains itself", () => {
  const { labels } = scene([marker({ name: "ISS", category: "LANDMARK" })]);
  expect(labels[0].detail).toBeNull();
});

test("shortens a catalogue name by its trailing brackets only", () => {
  expect(shortName("NAVSTAR 81 (USA 319)")).toBe("NAVSTAR 81");
  expect(shortName("GALILEO 23 (2C5)")).toBe("GALILEO 23");
  expect(shortName("COSMOS 2514 [GLONASS-M]")).toBe("COSMOS 2514");
  expect(shortName("STARLINK-1007")).toBe("STARLINK-1007");
  expect(shortName("(USA 319)")).toBe("(USA 319)");
});

test("drops the second of two landmark labels sharing a coordinate", () => {
  // A crew vehicle docked to the station projects onto the station.
  const { labels } = scene([
    marker({ name: "ISS", category: "LANDMARK", point: { left: 50, top: 50 } }),
    marker({ name: "CREW DRAGON 12", category: "LANDMARK", point: { left: 50.4, top: 50.1 } })
  ]);

  expect(labels.map((label) => label.name)).toEqual(["ISS"]);
});

test("keeps the tail of a landmark that has left the frame, but not its name", () => {
  // A satellite is kept on the frame while its trail crosses it, mark and all,
  // so the tail slides out tip last instead of being cut at the border. The
  // name is not: set beside a centre that is off the edge, it would be half a
  // label hanging into the frame over nothing.
  const { glyphs, labels } = scene([
    marker({
      name: "ISS",
      category: "LANDMARK",
      point: { left: 50, top: -1 },
      trail: [
        { left: 50, top: 4 },
        { left: 50, top: 9 }
      ]
    })
  ]);

  expect(glyphs[0].tail).not.toBeNull();
  expect(labels).toEqual([]);
});

test("places a name by a transform rather than a layout position", () => {
  // Position is a layout property and a transform is not, and every name moves
  // every frame: as `left` and `top` that is a layout pass over the whole
  // overlay sixty times a second for a box nothing else is positioned against.
  const { labels, rollDeg, palette } = scene([marker({ name: "ISS", category: "LANDMARK" })]);
  const markup = renderToStaticMarkup(
    <MarkerLabels labels={labels} rollDeg={rollDeg} palette={palette} />
  );

  expect(markup).toContain("ISS");
  // The box the name sits in carries a transform and its opacity, and nothing
  // else: where it is on the frame is not a layout property.
  expect(markup.match(/style="([^"]*)"/)?.[1]).toBe(
    "opacity:1;transform:translateX(360px) translateY(640px) rotate(0deg)"
  );
});

test("sets a marker's name right on top of it", () => {
  const { labels, rollDeg, palette } = scene([marker({ name: "ISS", category: "LANDMARK" })]);
  expect(labels[0].above).toBe(true);
  // Anchored by its bottom edge, so a name that wraps grows away from the mark.
  expect(
    renderToStaticMarkup(<MarkerLabels labels={labels} rollDeg={rollDeg} palette={palette} />)
  ).toMatch(/bottom:\d/);
});

test("keeps a name level with the horizon as the camera rolls", () => {
  const { labels, palette } = scene([marker({ name: "ISS", category: "LANDMARK" })], 12);

  expect(
    renderToStaticMarkup(<MarkerLabels labels={labels} rollDeg={12} palette={palette} />)
  ).toContain("rotate(-12deg)");
});

describe("the ring around a tapped satellite", () => {
  test("is drawn on the selected marker, and on no other", () => {
    const { selection, glyphs } = selectedScene(
      [
        marker({ name: "ISS", category: "LANDMARK", point: { left: 50, top: 50 } }),
        marker({ name: "STARLINK-1234", point: { left: 20, top: 20 } })
      ],
      "STARLINK-1234"
    );

    expect(selection).not.toBeNull();
    expect(selection!.x).toBeCloseTo(glyphs[1].x);
    expect(selection!.y).toBeCloseTo(glyphs[1].y);
  });

  test("nothing is ringed until something is tapped", () => {
    expect(scene([marker({ name: "ISS" })]).selection).toBeNull();
    // Nor for a selection that has left the frame: the card outlives the pass,
    // and the ring is only ever a thing on a marker that is there to ring.
    expect(selectedScene([marker({ name: "ISS" })], "GONE").selection).toBeNull();
  });

  test("clears the mark rather than painting over it", () => {
    // Colour, size and shape are three of the four channels a marker carries,
    // and a selection is not allowed to cost any of them.
    const [{ selection, glyphs }] = [selectedScene([marker({ name: "SAT" })], "SAT")];
    const outerEdge = glyphs[0].rim.radius;

    expect(selection!.radius - selection!.width / 2).toBeGreaterThan(outerEdge);
  });

  test("sits as close around a landmark as around any other mark", () => {
    // A halo is light fading to nothing, not a shape with an edge to clear, and
    // a ring drawn outside it would be a hand's width across around a point a
    // few pixels wide.
    const landmark = selectedScene([marker({ name: "ISS", category: "LANDMARK" })], "ISS");
    const other = selectedScene([marker({ name: "SAT" })], "SAT");

    expect(landmark.selection!.radius).toBeCloseTo(other.selection!.radius, 6);
    expect(landmark.selection!.radius - landmark.selection!.width / 2).toBeGreaterThan(
      landmark.glyphs[0].rim.radius
    );
  });

  test("draws the tapped satellite a little larger and brighter than its range says", () => {
    const tapped = selectedScene([marker({ name: "SAT", rangeKm: 20000 })], "SAT").glyphs[0];
    const plain = scene([marker({ name: "SAT", rangeKm: 20000 })]).glyphs[0];

    expect(tapped.core.radius).toBeGreaterThan(plain.core.radius);
    expect(tapped.core.radius).toBeLessThan(plain.core.radius * 1.5);
    expect(tapped.glow.alpha).toBeGreaterThan(plain.glow.alpha);
    // Brighter, but it has not changed colour or strength: those are channels.
    expect(tapped.color).toBe(plain.color);
    expect(tapped.alpha).toBe(plain.alpha);
  });

  test("does not move a landmark's name when it is tapped", () => {
    const landmark = marker({ name: "ISS", category: "LANDMARK" });
    expect(selectedScene([landmark], "ISS").labels).toEqual(scene([landmark]).labels);
  });

  test("is a bright band, edged by day and not at night, like the marks", () => {
    // A photograph is not a background a single colour reads against, so by
    // day the ring is rimmed exactly as the marks are; at night, as they do, it
    // drops the edge that would make it a sticker on the sky.
    const night = selectedScene([marker({ name: "SAT" })], "SAT").selection!;
    const day = buildMarkerScene(
      { markers: [marker({ name: "SAT" })], paths: [], rollDeg: 0 },
      FRAME,
      DAYLIGHT_PALETTE,
      "SAT"
    ).selection!;

    expect(night.color).toBe(NIGHT_PALETTE.label);
    expect(night.rim.alpha).toBe(0);
    expect(day.rim).toEqual(MARK_EDGE);
    expect(day.rimWidth).toBeGreaterThan(day.width);
  });

  test("fades with the marker it belongs to", () => {
    // A marker crossing a roof line fades out; a ring left at full strength
    // over it would be the one thing on the frame the mask does not reach.
    const { selection } = selectedScene([marker({ name: "SAT", opacity: 0.4 })], "SAT");

    expect(selection!.alpha).toBeCloseTo(0.4);
  });

  test("scales with the frame, as every other size does", () => {
    const small = selectedScene([marker({ name: "SAT" })], "SAT", { width: 360, height: 640 });
    const large = selectedScene([marker({ name: "SAT" })], "SAT", { width: 1440, height: 2560 });

    expect(large.selection!.radius).toBeCloseTo(small.selection!.radius * 4);
  });
});

describe("a landmark's path across the sky", () => {
  /** A name written on the line, and when its object is at that point. */
  const anchorAt = (left: number, top: number, atMs = Date.UTC(2026, 7, 29, 20, 37, 0)) => ({
    at: { left, top },
    atMs
  });

  /** One planned pass, projected: a straight run across the middle of the frame. */
  function path(overrides: Partial<MarkerPath> = {}): MarkerPath {
    return {
      name: "ISS",
      key: "25544@1",
      category: "LANDMARK",
      dashes: [
        [
          { left: 20, top: 50 },
          { left: 21, top: 50 }
        ],
        [
          { left: 22, top: 50 },
          { left: 23, top: 50 }
        ]
      ],
      past: [],
      ticks: [{ at: { left: 50, top: 50 }, ahead: { left: 60, top: 50 } }],
      anchor: null,
      lead: 0,
      ...overrides
    };
  }

  test("draws it as thin dashes, in its object's colour on the marks' dark edge", () => {
    const [shape] = scene([], 0, FRAME, [path()]).paths;

    expect(shape.color).toBe(CATEGORY_COLORS.LANDMARK);
    // Thinner than the marks it runs between, and rimmed like all of them: a
    // path is two thousand pixels long and must not be the loudest thing on a
    // photograph of the sky.
    expect(shape.width).toBeLessThan(SATELLITE_MARKERS.farDiameterPx);
    expect(shape.rimWidth).toBeGreaterThan(shape.width);
  });

  test("edges it by day only, as the marks are edged", () => {
    const night = scene([], 0, FRAME, [path()]).paths[0];
    const day = buildMarkerScene(
      { markers: [], paths: [path()], rollDeg: 0 },
      FRAME,
      DAYLIGHT_PALETTE
    ).paths[0];

    expect(night.rim.alpha).toBe(0);
    expect(day.rim).toEqual(MARK_EDGE);
  });

  test("places the dashes in pixels on the frame it is drawn into", () => {
    const [shape] = scene([], 0, FRAME, [path()]).paths;
    expect(shape.dashes).toHaveLength(2);
    // Percent of the frame, in the order the pass runs.
    expect(shape.dashes[0]).toEqual([144, 640, 151.2, 640]);
    expect(shape.dashes[1]).toEqual([158.4, 640, 165.6, 640]);
  });

  describe("the wake behind a pass under way", () => {
    /** A wake of three steps running back to the left of an object at the centre. */
    const underWay = () =>
      path({
        past: [0, 1, 2].map((step) => ({
          points: [
            { left: 50 - step * 5, top: 50 },
            { left: 45 - step * 5, top: 50 }
          ],
          behind: (step + 0.5) / 3
        }))
      });

    test("is thinner and fainter than the line ahead, and fades as it goes back", () => {
      const [shape] = scene([], 0, FRAME, [underWay()]).paths;

      expect(shape.past).toHaveLength(3);
      expect(shape.pastWidth).toBeLessThan(shape.width);
      expect(shape.pastRimWidth).toBeGreaterThan(shape.pastWidth);
      expect(shape.past[0].alpha).toBeLessThan(shape.alpha);
      for (let index = 1; index < shape.past.length; index += 1) {
        expect(shape.past[index].alpha).toBeLessThan(shape.past[index - 1].alpha);
      }
    });

    test("is placed in pixels, step by step from the object back", () => {
      const [shape] = scene([], 0, FRAME, [underWay()]).paths;
      const expected = [
        [360, 640, 324, 640],
        [324, 640, 288, 640],
        [288, 640, 252, 640]
      ];
      expect(shape.past).toHaveLength(expected.length);
      shape.past.forEach((step, index) => {
        step.points.forEach((value, at) => expect(value).toBeCloseTo(expected[index][at], 6));
      });
    });

    test("fades with the pass, as the line ahead does", () => {
      const now = scene([], 0, FRAME, [{ ...underWay(), lead: 0 }]).paths[0];
      const later = scene([], 0, FRAME, [{ ...underWay(), lead: 1 }]).paths[0];
      expect(later.past[0].alpha / now.past[0].alpha).toBeCloseTo(later.alpha / now.alpha, 6);
    });
  });

  test("scales with the frame, as every other size does", () => {
    const full = scene([], 0, FRAME, [path()]).paths[0];
    const half = scene([], 0, { width: 360, height: 640 }, [path()]).paths[0];
    expect(half.width).toBeCloseTo(full.width / 2, 6);
  });

  test("fades it by how far ahead the pass is", () => {
    const now = scene([], 0, FRAME, [path({ lead: 0 })]).paths[0];
    const later = scene([], 0, FRAME, [path({ lead: 1 })]).paths[0];

    expect(now.alpha).toBeCloseTo(LANDMARK_PATHS.nearOpacity, 6);
    expect(later.alpha).toBeCloseTo(LANDMARK_PATHS.farOpacity, 6);
    expect(later.alpha).toBeLessThan(now.alpha);
  });

  test("marks the minutes with an arrowhead pointing the way the object goes", () => {
    const [shape] = scene([], 0, FRAME, [path()]).paths;
    expect(shape.arrows).toHaveLength(1);

    // Three points, and the middle one is the minute itself: the arms sweep
    // back from it, so the mark says the object is there and heading on.
    const [armX, armY, pointX, pointY, otherX, otherY] = shape.arrows[0];
    expect(pointX).toBeCloseTo(360, 6);
    expect(pointY).toBeCloseTo(640, 6);
    // The path here runs left to right, so the arms are back and to each side.
    expect(armX).toBeCloseTo(360 - LANDMARK_PATHS.arrowLengthPx, 6);
    expect(otherX).toBeCloseTo(360 - LANDMARK_PATHS.arrowLengthPx, 6);
    expect(armY).toBeCloseTo(640 - LANDMARK_PATHS.arrowSpreadPx, 6);
    expect(otherY).toBeCloseTo(640 + LANDMARK_PATHS.arrowSpreadPx, 6);
  });

  test("turns the arrowhead with the path rather than with the frame", () => {
    // Straight down the frame: the arms are now level with each other, and the
    // point is below both. A mark laid out in percent would sit askew here,
    // since the frame is not square.
    const down = path({
      ticks: [{ at: { left: 50, top: 50 }, ahead: { left: 50, top: 60 } }]
    });
    const [armX, armY, pointX, pointY, otherX] = scene([], 0, FRAME, [down]).paths[0].arrows[0];

    expect(pointX).toBeCloseTo(360, 6);
    expect(pointY).toBeCloseTo(640, 6);
    expect(armY).toBeCloseTo(640 - LANDMARK_PATHS.arrowLengthPx, 6);
    expect(armX).toBeCloseTo(360 + LANDMARK_PATHS.arrowSpreadPx, 6);
    expect(otherX).toBeCloseTo(360 - LANDMARK_PATHS.arrowSpreadPx, 6);
  });

  test("drops a mark whose direction is a single point", () => {
    // Nothing to point along: two identical positions carry no direction, and
    // normalising the difference between them is a division by zero.
    const degenerate = path({
      ticks: [{ at: { left: 50, top: 50 }, ahead: { left: 50, top: 50 } }]
    });
    expect(scene([], 0, FRAME, [degenerate]).paths[0].arrows).toEqual([]);
  });

  test("names the arc at its anchor, wherever its object is", () => {
    const named = path({ anchor: anchorAt(30, 70) });
    const { labels } = scene([], 0, FRAME, [named]);

    expect(labels).toHaveLength(1);
    expect(labels[0].name).toMatch(/^ISS\n/);
    // Under the anchor, which is a point on the line rather than a place on the
    // screen. See `anchorFor`.
    expect(labels[0].x).toBeCloseTo(216, 6);
    expect(labels[0].y).toBeCloseTo(896, 6);
    expect(labels[0].offsetY).toBeGreaterThan(0);
    // Under the point on the line, where a marker's name is over its mark.
    expect(labels[0].above).toBe(false);
  });

  test("writes the time its object is at that point under the name", () => {
    // The name and the time, a line each: the two together are wider than the
    // box a label is set in.
    const at = Date.UTC(2026, 7, 29, 20, 37, 0);
    const later = Date.UTC(2026, 7, 29, 20, 43, 0);
    const named = (atMs: number) => scene([], 0, FRAME, [path({ anchor: anchorAt(30, 70, atMs) })]);

    expect(named(at).labels[0].name).toMatch(/^ISS\n\d{1,2}[:.]\d{2}/);
    // And it is the anchor's own time, so a name written further along the line
    // says a later minute rather than repeating the one at the rise.
    expect(named(later).labels[0].name).not.toBe(named(at).labels[0].name);
  });

  test("says nothing where no part of the arc is on the frame", () => {
    expect(scene([], 0, FRAME, [path({ anchor: null })]).labels).toEqual([]);
  });

  test("leaves the naming to the marker where the object is on the frame", () => {
    // The same word twice on one frame, and the marker's is the better placed
    // of the two: it is on the object rather than on the line it is following.
    const landmark = marker({ name: "ISS", category: "LANDMARK", point: { left: 70, top: 20 } });
    const { labels } = scene([landmark], 0, FRAME, [path({ anchor: anchorAt(30, 70) })]);

    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe("ISS");
    expect(labels[0].key).toBe("ISS");
  });

  test("names the arc when its object has been left out for terrain", () => {
    // The case the naming exists for: nothing on the frame is the landmark, so
    // without this the line is an anonymous streak across the sky.
    const { labels } = scene([], 0, FRAME, [path({ anchor: anchorAt(30, 70) })]);
    expect(labels.map((label) => label.name.split("\n")[0])).toEqual(["ISS"]);
  });

  test("keys an arc's name apart from a marker's", () => {
    // A landmark can be named twice on one frame — once on its own mark, once
    // on another of its passes — and two views under one key is one view.
    const landmark = marker({ name: "Hubble", category: "LANDMARK" });
    const named = path({ anchor: anchorAt(10, 90) });
    const keys = scene([landmark], 0, FRAME, [named]).labels.map((label) => label.key);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
