import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkerLabels } from "../src/components/MarkerLabels";
import { buildMarkerScene, GlyphShape } from "../src/components/markerScene";
import { NIGHT_PALETTE } from "../src/components/palette";
import { SatelliteMarkers } from "../src/components/SatelliteMarkers.web";
import { MarkerFrame, SatelliteMarker } from "../src/hooks/useAnimatedMarkers";
import { CATEGORY_COLORS } from "../src/satellite/categories";

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
    ...overrides
  };
}

/** The overlay as it is drawn: shapes in pixels, whichever canvas draws them. */
function scene(markers: SatelliteMarker[], rollDeg = 0, box = FRAME) {
  const frame: MarkerFrame = { markers, rollDeg };
  return buildMarkerScene(frame, box, NIGHT_PALETTE);
}

/** The same, with one satellite selected: what a tap leaves on the frame. */
function selectedScene(markers: SatelliteMarker[], name: string, box = FRAME) {
  return buildMarkerScene({ markers, rollDeg: 0 }, box, NIGHT_PALETTE, name);
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
