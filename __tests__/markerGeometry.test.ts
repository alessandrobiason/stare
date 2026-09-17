import { SATELLITE_MARKERS } from "../src/constants";
import {
  clipPolyline,
  clipSegment,
  labellablePoints,
  markerDiameterPx,
  pointOnFrame,
  trailOnFrame,
  trailPixels,
  WHOLE_FRAME
} from "../src/components/markerGeometry";

/** The recording's own frame, so pixel figures read at their design size. */
const FRAME = { width: 720, height: 1280 };

test("shrinks the marker with the logarithm of distance", () => {
  const { nearDiameterPx, farDiameterPx, nearRangeKm, farRangeKm } = SATELLITE_MARKERS;
  expect(markerDiameterPx(nearRangeKm)).toBe(nearDiameterPx);
  expect(markerDiameterPx(farRangeKm)).toBeCloseTo(farDiameterPx, 6);

  // Halfway in decades is halfway in size, which is what makes a hundred-to-one
  // range legible as depth rather than collapsing past low orbit.
  const midpoint = Math.sqrt(nearRangeKm * farRangeKm);
  expect(markerDiameterPx(midpoint)).toBeCloseTo((nearDiameterPx + farDiameterPx) / 2, 6);
});

test("clamps the marker size at both ends of the scale", () => {
  expect(markerDiameterPx(10)).toBe(SATELLITE_MARKERS.nearDiameterPx);
  // The lunar-distance science orbits sit far past the far end.
  expect(markerDiameterPx(400_000)).toBe(SATELLITE_MARKERS.farDiameterPx);
});

test("lays the trail out in pixels, from the mark back through where it has been", () => {
  const path = trailPixels(
    { left: 20, top: 50 },
    [
      { left: 30, top: 50 },
      { left: 40, top: 50 }
    ],
    FRAME
  );
  expect(path?.points).toEqual([144, 640, 216, 640, 288, 640]);
  expect(path?.length).toBeCloseTo(144, 6); // 20% of a 720 px frame
});

test("measures the trail in pixels, not in percent", () => {
  // Equal percentage steps across a 720x1280 frame are not equal distances, so
  // a length taken in percent would stretch the dashes along one axis. 10% of
  // the width is 72 px; 10% of the height is 128 px.
  const path = trailPixels({ left: 40, top: 40 }, [{ left: 50, top: 50 }], FRAME);
  expect(path?.length).toBeCloseTo(Math.hypot(72, 128), 6);
});

test("follows the trail round its corners rather than cutting across them", () => {
  const path = trailPixels(
    { left: 50, top: 50 },
    [
      { left: 60, top: 50 },
      { left: 60, top: 60 }
    ],
    FRAME
  );
  expect(path?.length).toBeCloseTo(72 + 128, 6);
});

test("draws no trail for an object that is holding station", () => {
  expect(trailPixels({ left: 50, top: 50 }, [{ left: 50, top: 50 }], FRAME)).toBeNull();
  expect(trailPixels({ left: 50, top: 50 }, [], FRAME)).toBeNull();
});

test("counts a point as on the frame up to its very edge", () => {
  expect(pointOnFrame({ left: 50, top: 50 })).toBe(true);
  expect(pointOnFrame({ left: 0, top: 100 })).toBe(true);
  expect(pointOnFrame({ left: -0.1, top: 50 })).toBe(false);
  expect(pointOnFrame({ left: 50, top: 100.1 })).toBe(false);
});

test("keeps a marker whose mark has left the frame but whose trail has not", () => {
  // Travelling right to left and gone off the left edge: the trail runs back
  // the way it came, which is still across the view.
  const gone = { left: -10, top: 50 };
  expect(pointOnFrame(gone)).toBe(false);
  expect(trailOnFrame(gone, [{ left: 20, top: 50 }])).toBe(true);
});

test("lets go of a marker once its trail has left the frame too", () => {
  // The same satellite a moment later: the whole shape, tip included, is past
  // the edge, and there is nothing left of it to draw.
  expect(trailOnFrame({ left: 140, top: 50 }, [{ left: 155, top: 50 }, { left: 170, top: 50 }])).toBe(
    false
  );
});

test("holds a trail whose later stretches are the ones on the frame", () => {
  // The first stretch runs along outside the top edge; the curve brings the
  // second one down into the view.
  expect(
    trailOnFrame({ left: 50, top: -5 }, [
      { left: 60, top: -5 },
      { left: 70, top: 10 }
    ])
  ).toBe(true);
});

test("holds a trail that crosses a corner without either end being on the frame", () => {
  // Head off the right edge, tip off the bottom, and the line between the two
  // clips the corner. The test has to answer for the middle of a stretch, not
  // only for its ends.
  expect(trailOnFrame({ left: 105, top: 80 }, [{ left: 75, top: 130 }])).toBe(true);
  // The same shape carried out past the corner: nothing of it is in view.
  expect(trailOnFrame({ left: 130, top: 105 }, [{ left: 100, top: 155 }])).toBe(false);
});

test("keeps the label clearance in layout pixels, not in frame percent", () => {
  // A label is set at a fixed size whatever the window is, so halving the
  // window brings two names closer together on screen rather than further
  // apart — and the pair that fitted at full size no longer does.
  const points = [
    { left: 40, top: 50 },
    { left: 60, top: 50 }
  ];
  expect(labellablePoints(points, FRAME)).toEqual([true, true]);
  expect(labellablePoints(points, { width: 360, height: 640 })).toEqual([true, false]);
});

test("gives a label to the first of two landmarks sharing a coordinate", () => {
  // The station and the vehicles docked to it project onto the same point.
  const station = { left: 50, top: 50 };
  const docked = { left: 50.5, top: 50.2 };
  expect(labellablePoints([station, docked], FRAME)).toEqual([true, false]);
});

test("keeps names apart by more than their own width, so a strip of sky is not a block of text", () => {
  // Side by side, a label's width apart: the two boxes would not overlap, but
  // two names edge to edge read as one line. Not written.
  const x = (px: number) => (px / FRAME.width) * 100;
  const y = (px: number) => (px / FRAME.height) * 100;
  expect(
    labellablePoints([{ left: x(300), top: y(400) }, { left: x(420), top: y(400) }], FRAME)
  ).toEqual([true, false]);
  // Two lines of label and a gap stacked above each other: the same.
  expect(
    labellablePoints([{ left: x(300), top: y(400) }, { left: x(300), top: y(440) }], FRAME)
  ).toEqual([true, false]);
  // And diagonally, where the two names would sit at each other's corners.
  expect(
    labellablePoints([{ left: x(300), top: y(400) }, { left: x(390), top: y(430) }], FRAME)
  ).toEqual([true, false]);
  // With room round them, all three are written.
  expect(
    labellablePoints(
      [
        { left: x(100), top: y(400) },
        { left: x(260), top: y(400) },
        { left: x(180), top: y(470) }
      ],
      FRAME
    )
  ).toEqual([true, true, true]);
});

test("labels landmarks that are far enough apart to be read", () => {
  const points = [
    { left: 20, top: 20 },
    { left: 80, top: 80 }
  ];
  expect(labellablePoints(points, FRAME)).toEqual([true, true]);
});

describe("clipping a line to the frame", () => {
  test("leaves a segment already inside it alone", () => {
    const clipped = clipSegment({ left: 20, top: 20 }, { left: 80, top: 80 }, WHOLE_FRAME);
    expect(clipped).toEqual({ from: { left: 20, top: 20 }, to: { left: 80, top: 80 } });
  });

  test("cuts the part that hangs over an edge, on the line it was drawn along", () => {
    const clipped = clipSegment({ left: 50, top: 50 }, { left: 150, top: 100 }, WHOLE_FRAME);
    // Halfway along, where the segment crosses the right-hand edge: the top
    // must follow, or the drawn line leaves at the wrong angle.
    expect(clipped?.to.left).toBeCloseTo(100);
    expect(clipped?.to.top).toBeCloseTo(75);
  });

  test("says nothing crosses when nothing does", () => {
    expect(clipSegment({ left: 120, top: 10 }, { left: 140, top: 90 }, WHOLE_FRAME)).toBeNull();
  });

  test("keeps a segment that passes clean through both edges", () => {
    const clipped = clipSegment({ left: -50, top: 50 }, { left: 150, top: 50 }, WHOLE_FRAME);
    expect(clipped?.from.left).toBeCloseTo(0);
    expect(clipped?.to.left).toBeCloseTo(100);
  });

  test("breaks a path that leaves the frame and comes back into two runs", () => {
    // A landmark's arc crossing a corner of the view, out of it, and back: two
    // lines rather than one drawn straight across the sky between them.
    const runs = clipPolyline(
      [
        { left: 50, top: 50 },
        { left: 150, top: 50 },
        { left: 150, top: 90 },
        { left: 50, top: 90 }
      ],
      WHOLE_FRAME
    );

    expect(runs).toHaveLength(2);
    expect(runs[0][0]).toEqual({ left: 50, top: 50 });
    expect(runs[0][1].left).toBeCloseTo(100);
    expect(runs[1][0].left).toBeCloseTo(100);
    expect(runs[1][runs[1].length - 1]).toEqual({ left: 50, top: 90 });
  });

  test("keeps a path that only touches the frame in the middle", () => {
    const runs = clipPolyline(
      [
        { left: -200, top: 50 },
        { left: 50, top: 50 },
        { left: 300, top: 50 }
      ],
      WHOLE_FRAME
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].map((point) => Math.round(point.left))).toEqual([0, 50, 100]);
  });

  test("has nothing to draw for a path that never reaches the frame", () => {
    expect(
      clipPolyline(
        [
          { left: 150, top: 10 },
          { left: 160, top: 40 },
          { left: 170, top: 80 }
        ],
        WHOLE_FRAME
      )
    ).toEqual([]);
  });
});
