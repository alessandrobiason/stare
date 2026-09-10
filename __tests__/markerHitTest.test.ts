import { markerDiameterPx } from "../src/components/markerGeometry";
import { markersUnder, namesUnder } from "../src/components/markerHitTest";
import { DESIGN_FRAME_WIDTH_PX } from "../src/components/markerScene";
import { MARKER_SELECTION } from "../src/constants";
import { MarkerFrame, MarkerPath, SatelliteMarker } from "../src/hooks/useAnimatedMarkers";

/** The frame the markers are drawn over, at the size their pixels are quoted at. */
const FRAME = { width: DESIGN_FRAME_WIDTH_PX, height: 1280 };

function marker(overrides: Partial<SatelliteMarker> = {}): SatelliteMarker {
  return {
    name: "SAT",
    category: "COMMS",
    parked: false,
    point: { left: 50, top: 50 },
    rangeKm: 1200,
    next: null,
    opacity: 1,
    ...overrides
  };
}

/** A drawn frame, in the painter's order the marker loop publishes it in. */
function frame(markers: SatelliteMarker[], paths: MarkerPath[] = []): MarkerFrame {
  return { markers, paths, rollDeg: 0 };
}

/** One landmark's arc, named at `anchor`. Only the name and that point matter here. */
function path(name: string, anchor: { left: number; top: number } | null): MarkerPath {
  return {
    name,
    key: `${name}@1`,
    category: "LANDMARK",
    lines: [],
    ticks: [],
    anchor: anchor && { at: anchor, atMs: Date.UTC(2026, 7, 29, 20, 37, 0) },
    lead: 0
  };
}

/** Frame coordinates for a point at `x, y` layout pixels. */
function at(x: number, y: number) {
  return { left: (x / FRAME.width) * 100, top: (y / FRAME.height) * 100 };
}

test("picks the satellite under the finger", () => {
  const hits = markersUnder(
    frame([marker({ name: "ISS", point: at(360, 640) })]),
    FRAME,
    { x: 362, y: 644 }
  );

  expect(hits.map((hit) => hit.name)).toEqual(["ISS"]);
});

test("misses nothing but an actual miss", () => {
  const sky = frame([marker({ name: "ISS", point: at(360, 640) })]);
  const { tapRadiusPx } = MARKER_SELECTION;

  // A finger covers about this much, and a marker eight pixels across cannot
  // be a target on its own.
  expect(markersUnder(sky, FRAME, { x: 360 + tapRadiusPx - 1, y: 640 })).toHaveLength(1);
  expect(markersUnder(sky, FRAME, { x: 360 + tapRadiusPx + 1, y: 640 })).toHaveLength(0);
});

test("a big frame draws big markers, and they are hit to their own edge", () => {
  // The tap radius is a fingertip and does not scale, but a marker drawn larger
  // than one still has to be hittable everywhere it is drawn.
  const box = { width: DESIGN_FRAME_WIDTH_PX * 6, height: 1280 };
  const near = marker({ rangeKm: 400, point: { left: 50, top: 50 } });
  const radius = (markerDiameterPx(near.rangeKm) * (box.width / DESIGN_FRAME_WIDTH_PX)) / 2;
  expect(radius).toBeGreaterThan(MARKER_SELECTION.tapRadiusPx);

  const centre = { x: box.width / 2, y: 640 };
  expect(markersUnder(frame([near]), box, { x: centre.x + radius - 1, y: centre.y })).toHaveLength(1);
  expect(markersUnder(frame([near]), box, { x: centre.x + radius + 1, y: centre.y })).toHaveLength(0);
});

test("hands back the whole group under the finger, nearest to the tap first", () => {
  // Which is the point: markers pile up — the geostationary belt is a line of
  // them a few pixels apart — and picking silently would answer a question the
  // tap did not settle.
  const hits = markersUnder(
    frame([
      marker({ name: "FAR", point: at(375, 640) }),
      marker({ name: "NEAR", point: at(364, 640) })
    ]),
    FRAME,
    { x: 360, y: 640 }
  );

  expect(hits.map((hit) => hit.name)).toEqual(["NEAR", "FAR"]);
});

test("on a shared coordinate, the marker drawn on top is the one asked about", () => {
  // Crew and cargo vehicles sit on the station they are docked to. The frame
  // arrives in painter's order, so the last of them is the one being looked at.
  const hits = markersUnder(
    frame([
      marker({ name: "PROGRESS-MS 27", category: "LANDMARK", point: at(360, 640) }),
      marker({ name: "ISS", category: "LANDMARK", point: at(360, 640) })
    ]),
    FRAME,
    { x: 360, y: 640 }
  );

  expect(hits.map((hit) => hit.name)).toEqual(["ISS", "PROGRESS-MS 27"]);
});

test("offers a few to choose between rather than a list of everything", () => {
  const belt = Array.from({ length: 12 }, (_, index) =>
    marker({ name: `SAT ${index}`, point: at(360 + index, 640) })
  );

  const hits = markersUnder(frame(belt), FRAME, { x: 360, y: 640 });
  expect(hits).toHaveLength(MARKER_SELECTION.maxCandidates);
  // The nearest few to where the finger landed, not an arbitrary few.
  expect(hits.map((hit) => hit.name)).toEqual(["SAT 0", "SAT 1", "SAT 2", "SAT 3", "SAT 4"]);
});

test("empty sky is an empty answer, which is what dismisses the card", () => {
  expect(markersUnder(frame([marker({ point: at(100, 100) })]), FRAME, { x: 600, y: 900 }))
    .toEqual([]);
  expect(markersUnder(frame([]), FRAME, { x: 360, y: 640 })).toEqual([]);
});

test("a frame with no size yet cannot be tapped", () => {
  // Marker positions are percentages, so there is nothing to compare a tap
  // against until the picture has been laid out.
  expect(markersUnder(frame([marker()]), { width: 0, height: 0 }, { x: 0, y: 0 })).toEqual([]);
});

test("offers one entry per name, since a name is what is looked up afterwards", () => {
  // The active catalog repeats names — there is a run of `TBA - TO BE ASSIGNED`
  // in it — and two chips reading alike would be no choice at all.
  const hits = markersUnder(
    frame([
      marker({ name: "TBA - TO BE ASSIGNED", point: at(366, 640) }),
      marker({ name: "TBA - TO BE ASSIGNED", point: at(362, 640) }),
      marker({ name: "STARLINK-1234", point: at(370, 640) })
    ]),
    FRAME,
    { x: 360, y: 640 }
  );

  expect(hits.map((hit) => hit.name)).toEqual(["TBA - TO BE ASSIGNED", "STARLINK-1234"]);
});

test("ignores a marker kept on the frame only for its trail", () => {
  // Off the top edge and drawn for the tail it still has across the frame: a
  // tap near that edge is asking about the marks it can see, and there is no
  // mark of this one to see.
  const gone = marker({
    name: "ISS",
    point: { left: 50, top: -1 },
    next: { left: 50, top: -11 }
  });
  const hits = markersUnder(frame([gone]), FRAME, { x: 360, y: 4 });

  expect(hits).toEqual([]);
});

describe("a tap on the name written along a landmark's path", () => {
  const { nameTapRadiusPx } = MARKER_SELECTION;

  test("asks about an object that has no mark on the frame at all", () => {
    // The case the paths exist for: the station is below the horizon or behind
    // a roof, and its name on the line is the only thing to tap.
    const sky = frame([], [path("ISS", at(360, 640))]);
    expect(namesUnder(sky, FRAME, { x: 362, y: 650 })).toEqual(["ISS"]);
  });

  test("reaches the writing under the anchor, which is where the name is", () => {
    const sky = frame([], [path("ISS", at(360, 640))]);

    expect(namesUnder(sky, FRAME, { x: 360, y: 640 + nameTapRadiusPx - 1 })).toEqual(["ISS"]);
    expect(namesUnder(sky, FRAME, { x: 360, y: 640 + nameTapRadiusPx + 1 })).toEqual([]);
  });

  test("says nothing for an arc with no part of it on the frame", () => {
    expect(namesUnder(frame([], [path("ISS", null)]), FRAME, { x: 360, y: 640 })).toEqual([]);
  });

  test("puts the marks under the finger first", () => {
    // A tap over something that is up there now is asking about that, not about
    // a line running past it — even where the line's name is the nearer of the
    // two to the finger.
    const sky = frame(
      [marker({ name: "SOYUZ-MS 33", point: at(375, 640) })],
      [path("ISS", at(362, 640))]
    );
    expect(namesUnder(sky, FRAME, { x: 360, y: 640 })).toEqual(["SOYUZ-MS 33", "ISS"]);
  });

  test("names an object once, whether it is a mark, an arc, or both", () => {
    const sky = frame([marker({ name: "ISS", point: at(360, 640) })], [path("ISS", at(365, 645))]);
    expect(namesUnder(sky, FRAME, { x: 360, y: 640 })).toEqual(["ISS"]);
  });

  test("offers no more than one tap can choose between", () => {
    const stacked = Array.from({ length: MARKER_SELECTION.maxCandidates + 3 }, (_, index) =>
      path(`LANDMARK ${index}`, at(360 + index, 640))
    );
    expect(namesUnder(frame([], stacked), FRAME, { x: 360, y: 640 })).toHaveLength(
      MARKER_SELECTION.maxCandidates
    );
  });

  test("empty sky is still an empty answer, which is what dismisses the card", () => {
    const sky = frame([], [path("ISS", at(100, 100))]);
    expect(namesUnder(sky, FRAME, { x: 600, y: 900 })).toEqual([]);
    expect(namesUnder(sky, { width: 0, height: 0 }, { x: 0, y: 0 })).toEqual([]);
  });
});
