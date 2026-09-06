import { SATELLITE_MARKERS } from "../src/constants";
import {
  labellablePoints,
  markerDiameterPx,
  trailReach
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

test("measures how far a marker's own motion carries it, in pixels", () => {
  const reach = trailReach({ left: 20, top: 50 }, { left: 40, top: 50 }, FRAME);
  expect(reach).not.toBeNull();
  expect(reach?.dx).toBeCloseTo(144, 6); // 20% of a 720 px frame
  expect(reach?.dy).toBeCloseTo(0, 6);
  expect(reach?.length).toBeCloseTo(144, 6);
});

test("takes the trail direction in pixels, not in percent", () => {
  // Equal percentage steps across a 720x1280 frame are not equal distances, so
  // a direction taken in percent would point the tail away from the line of
  // travel. 10% of the width is 72 px; 10% of the height is 128 px.
  const reach = trailReach({ left: 40, top: 40 }, { left: 50, top: 50 }, FRAME);
  expect(reach?.dx).toBeCloseTo(72, 6);
  expect(reach?.dy).toBeCloseTo(128, 6);
  expect(reach?.length).toBeCloseTo(Math.hypot(72, 128), 6);
});

test("draws no trail for an object that is holding station", () => {
  expect(trailReach({ left: 50, top: 50 }, { left: 50, top: 50 }, FRAME)).toBeNull();
});

test("keeps the label clearance in layout pixels, not in frame percent", () => {
  // A label is set at a fixed size whatever the window is, so halving the
  // window brings two names closer together on screen rather than further
  // apart — and the pair that fitted at full size no longer does.
  const points = [
    { left: 45, top: 50 },
    { left: 55, top: 50 }
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

test("labels landmarks that are far enough apart to be read", () => {
  const points = [
    { left: 20, top: 20 },
    { left: 80, top: 80 }
  ];
  expect(labellablePoints(points, FRAME)).toEqual([true, true]);
});
