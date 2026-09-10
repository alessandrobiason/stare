import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkerLabels } from "../src/components/MarkerLabels";
import { buildMarkerScene, GlyphShape } from "../src/components/markerScene";
import { NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteMarkers } from "../src/components/SatelliteMarkers.web";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../src/hooks/useAnimatedMarkers";
import { CATEGORY_COLORS } from "../src/satellite/categories";
import { LANDMARK_PATHS, SATELLITE_MARKERS } from "../src/constants";

const FRAME = { width: 720, height: 1280 };

function marker(overrides: Partial<SatelliteMarker> = {}): SatelliteMarker {
  return {
    name: "SAT",
    category: "COMMS",
    parked: false,
    point: { left: 50, top: 50 },
    rangeKm: 1200,
    next: { left: 58, top: 44 },
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

/** A tail's three corners, as points: the tip it tapers to and its head. */
function corners(glyph: GlyphShape): { x: number; y: number }[] {
  const points = glyph.tail?.points ?? [];
  return points.flatMap((value, index) =>
    index % 2 === 0 ? [{ x: value, y: points[index + 1] }] : []
  );
}

test("draws nothing before the frame has been laid out", () => {
  // Tails are geometry in pixels, and there are no pixels until then.
  expect(
    renderToStaticMarkup(
      <SatelliteMarkers markers={() => () => undefined} frame={null} palette={NIGHT_PALETTE} />
    )
  ).toBe("");
});

test("colours a marker by its category and nothing else", () => {
  const { glyphs } = scene([
    marker({ category: "NAVIGATION" }),
    marker({ name: "OTHER SAT", category: "EARTH", rangeKm: 39000 })
  ]);

  expect(glyphs.map((glyph) => glyph.color)).toEqual([
    CATEGORY_COLORS.NAVIGATION,
    CATEGORY_COLORS.EARTH
  ]);
});

test("draws a parked satellite as a ring and gives it no tail", () => {
  const parked = scene([marker({ parked: true, next: null, rangeKm: 39000 })]);
  const moving = scene([marker()]);

  // A ring is a band of its colour with the sky showing through the middle; a
  // moving marker is the same colour as a filled dot.
  expect(parked.glyphs[0].core.width).toBeGreaterThan(0);
  expect(parked.glyphs[0].tail).toBeNull();
  expect(moving.glyphs[0].core.width).toBeNull();
  expect(moving.glyphs[0].tail).not.toBeNull();
});

test("sizes the marker by distance, not by category", () => {
  const near = scene([marker({ rangeKm: 500, next: null })]).glyphs[0];
  const far = scene([marker({ rangeKm: 39000, next: null })]).glyphs[0];

  expect(near.core.radius).toBeGreaterThan(far.core.radius);
});

test("outlines every marker so it survives a bright sky", () => {
  // No fill in either palette clears 2:1 against both ends of the day, so the
  // rim is what is actually being read at one of them.
  for (const category of ["LANDMARK", "COMMS", "OTHER"] as const) {
    const { glyphs } = scene([marker({ category, next: null })]);
    // The rim is a larger shape under the mark, so the colour keeps its full
    // diameter — drawn as a border inside it, it ate the middle instead.
    expect(glyphs[0].rim.radius).toBeGreaterThan(glyphs[0].core.radius);
  }
  expect(NIGHT_PALETTE.outline.alpha).toBeGreaterThan(0.5);
});

test("haloes the landmarks, and only them", () => {
  const { glyphs } = scene([
    marker({ name: "ISS", category: "LANDMARK", next: null }),
    marker({ name: "STARLINK-1234", next: null })
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

  test("keeps every channel it was already spending", () => {
    // Colour, shape, size and heading are all still true of an object nobody
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
    const parked = marker({ parked: true, next: null, rangeKm: 39000 });
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
  const { glyphs } = scene([marker({ parked: true, next: null, rangeKm: 39000 })]);
  const { rim, core } = glyphs[0];

  expect(rim.width).not.toBeNull();
  expect(rim.radius + rim.width! / 2).toBeGreaterThan(core.radius + core.width! / 2);
  expect(rim.radius - rim.width! / 2).toBeCloseTo(core.radius - core.width! / 2);
});

test("lays the tail behind the marker, as far back as the object will travel", () => {
  // The icon's shape: the body leads and the trail follows it. Drawn ahead of
  // the mark instead, the shape has two ends and neither of them says which is
  // the satellite.
  const [glyph] = scene([
    marker({ point: { left: 50, top: 50 }, next: { left: 60, top: 50 } })
  ]).glyphs;
  const [tip, ...head] = corners(glyph);

  // 10% of a 720 px frame is 72 px of travel, so the tip sits 72 px the other
  // way from a mark at the centre of the frame.
  expect(tip.x).toBeCloseTo(360 - 72);
  expect(tip.y).toBeCloseTo(640);
  // Its head is the marker's own centre, and is where the width is.
  expect(head.map((corner) => corner.x)).toEqual([360, 360]);
  expect(head[0].y).toBeGreaterThan(head[1].y);
});

test("tapers the tail from nothing to a fraction of the body", () => {
  const [glyph] = scene([marker({ rangeKm: 500 })]).glyphs;
  const [, ...head] = corners(glyph);
  const width = Math.hypot(head[0].x - head[1].x, head[0].y - head[1].y);

  // Three points is the taper: one at the tip, two at the head. The icon's own
  // proportion is a trail a little under half the radius of its body.
  expect(corners(glyph)).toHaveLength(3);
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThan(glyph.core.radius);
  expect(width / glyph.core.radius).toBeCloseTo(0.48, 2);
});

test("points the tail along the line of travel, in pixels", () => {
  // Equal percentage steps across a 720x1280 frame are not equal distances, so
  // a tail laid out in percent would trail away from the line the object is
  // actually moving along. 10% of the width is 72 px; 10% of the height, 128.
  const [glyph] = scene([
    marker({ point: { left: 50, top: 50 }, next: { left: 60, top: 60 } })
  ]).glyphs;
  const [tip] = corners(glyph);

  expect(tip.x).toBeCloseTo(360 - 72);
  expect(tip.y).toBeCloseTo(640 - 128);
});

test("keeps the tail's rim outside its colour rather than inside it", () => {
  const [glyph] = scene([marker()]).glyphs;

  // The rim is the same polygon stroked as well as filled, so it reaches half
  // that stroke past every edge of a shape only a couple of pixels wide.
  expect(glyph.tail?.rimWidth).toBeGreaterThan(0);
});

test("fades the whole marker together as it crosses an edge", () => {
  const { glyphs, labels } = scene([
    marker({ name: "ISS", category: "LANDMARK", opacity: 0.4 })
  ]);

  expect(glyphs[0].alpha).toBeCloseTo(0.4);
  expect(labels[0].alpha).toBeCloseTo(0.4);
});

test("names the landmarks and nothing else", () => {
  const { labels } = scene([
    marker({ name: "ISS", category: "LANDMARK", rangeKm: 430 }),
    marker({ name: "STARLINK-1234", point: { left: 20, top: 20 } })
  ]);

  expect(labels.map((label) => label.name)).toEqual(["ISS"]);
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
  // name is not: set below a centre that is off the top edge, it would be half
  // a label hanging into the frame under nothing.
  const { glyphs, labels } = scene([
    marker({
      name: "ISS",
      category: "LANDMARK",
      point: { left: 50, top: -1 },
      next: { left: 50, top: -11 }
    })
  ]);

  expect(glyphs[0].tail).not.toBeNull();
  expect(labels).toEqual([]);
});

test("places a name below its marker, by a transform rather than a layout position", () => {
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

  test("clears a landmark's halo too", () => {
    const { selection, glyphs } = selectedScene(
      [marker({ name: "ISS", category: "LANDMARK" })],
      "ISS"
    );

    expect(selection!.radius - selection!.width / 2).toBeGreaterThan(glyphs[0].halo!);
  });

  test("is a bright band on a dark rim, like every other mark on the sky", () => {
    // A photograph is not a background a single colour reads against, so the
    // ring is rimmed exactly as the marks are, and flips with the day.
    const { selection } = selectedScene([marker({ name: "SAT" })], "SAT");

    expect(selection!.color).toBe(NIGHT_PALETTE.label);
    expect(selection!.rim).toBe(NIGHT_PALETTE.outline);
    expect(selection!.rimWidth).toBeGreaterThan(selection!.width);
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
      lines: [
        [
          { left: 20, top: 50 },
          { left: 50, top: 50 },
          { left: 80, top: 50 }
        ]
      ],
      ticks: [{ at: { left: 50, top: 50 }, ahead: { left: 60, top: 50 } }],
      anchor: null,
      lead: 0,
      ...overrides
    };
  }

  test("draws it as a thin rimmed line in the landmark colour", () => {
    const [shape] = scene([], 0, FRAME, [path()]).paths;

    expect(shape.color).toBe(CATEGORY_COLORS.LANDMARK);
    // Thinner than the marks it runs between, and rimmed like all of them: a
    // path is two thousand pixels long and must not be the loudest thing on a
    // photograph of the sky.
    expect(shape.width).toBeLessThan(SATELLITE_MARKERS.farDiameterPx);
    expect(shape.rimWidth).toBeGreaterThan(shape.width);
  });

  test("places the arc in pixels on the frame it is drawn into", () => {
    const [shape] = scene([], 0, FRAME, [path()]).paths;
    expect(shape.lines).toHaveLength(1);
    // Percent of the frame, in the order the pass runs.
    expect(shape.lines[0]).toEqual([144, 640, 360, 640, 576, 640]);
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
