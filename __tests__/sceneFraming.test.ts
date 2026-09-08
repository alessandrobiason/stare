import {
  frameBoxFor,
  pointInViewport,
  pointOnFrame,
  viewportOf,
  WHOLE_FRAME
} from "../src/components/markerGeometry";
import { DEVICE_CAMERA } from "../src/constants";

/** The phone's camera, as the overlay fits it: portrait, and 3:4 across. */
const CAMERA_ASPECT = DEVICE_CAMERA.widthPx / DEVICE_CAMERA.heightPx;

/** A current iPhone in points: taller than the camera is, by a long way. */
const PHONE = { width: 393, height: 852 };

/** The harness's window: a laptop's, and the other way up. */
const LAPTOP = { width: 1280, height: 720 };

describe("fitting the picture to the screen", () => {
  test("covering fills the screen, and keeps the camera's shape doing it", () => {
    const box = frameBoxFor(PHONE, CAMERA_ASPECT, "cover");

    expect(box).not.toBeNull();
    // Nothing is stretched: the box is the camera's shape whatever its size,
    // which is what keeps a marker placed in percent on the piece of sky it
    // was projected onto.
    expect(box!.width / box!.height).toBeCloseTo(CAMERA_ASPECT, 10);
    // No gap on either axis, and the overflow is on the one that had to grow.
    expect(box!.height).toBeCloseTo(PHONE.height, 10);
    expect(box!.width).toBeGreaterThan(PHONE.width);
  });

  test("fitting keeps the whole frame on screen", () => {
    const box = frameBoxFor(LAPTOP, CAMERA_ASPECT, "contain");

    expect(box!.width / box!.height).toBeCloseTo(CAMERA_ASPECT, 10);
    expect(box!.height).toBeCloseTo(LAPTOP.height, 10);
    expect(box!.width).toBeLessThanOrEqual(LAPTOP.width);
  });

  test("a screen of the camera's own shape is the same box either way", () => {
    const square = { width: 600, height: 800 };

    expect(frameBoxFor(square, CAMERA_ASPECT, "cover")).toEqual(
      frameBoxFor(square, CAMERA_ASPECT, "contain")
    );
  });

  test("no box before there is a screen to measure one against", () => {
    expect(frameBoxFor(null, CAMERA_ASPECT, "cover")).toBeNull();
    expect(frameBoxFor({ width: 0, height: 800 }, CAMERA_ASPECT, "cover")).toBeNull();
  });
});

describe("what is on screen once the picture covers it", () => {
  test("a fitted picture shows the whole frame", () => {
    const box = frameBoxFor(LAPTOP, CAMERA_ASPECT, "contain")!;

    expect(viewportOf(box, LAPTOP)).toEqual(WHOLE_FRAME);
  });

  test("a covering picture shows the middle of it, cut evenly", () => {
    const box = frameBoxFor(PHONE, CAMERA_ASPECT, "cover")!;
    const viewport = viewportOf(box, PHONE);

    // The overflow is horizontal, so the frame's full height is on screen and
    // its sides are not.
    expect(viewport.top).toBe(0);
    expect(viewport.bottom).toBe(100);
    expect(viewport.left).toBeCloseTo(50 - (PHONE.width / box.width) * 50, 10);
    // Centred: what is cut off one side is cut off the other.
    expect(100 - viewport.right).toBeCloseTo(viewport.left, 10);
    // A 4:3 camera on a phone this tall loses a third of its width to it,
    // which is the whole reason the count asks about the viewport at all.
    expect(viewport.right - viewport.left).toBeLessThan(70);
  });

  test("a marker off the window is still on the frame", () => {
    const box = frameBoxFor(PHONE, CAMERA_ASPECT, "cover")!;
    const viewport = viewportOf(box, PHONE);
    const nearTheEdge = { left: 5, top: 50 };

    // Drawn — and clipped — but not counted, and not named in the breakdown
    // the count opens onto.
    expect(pointOnFrame(nearTheEdge)).toBe(true);
    expect(pointInViewport(nearTheEdge, viewport)).toBe(false);
    expect(pointInViewport({ left: 50, top: 50 }, viewport)).toBe(true);
  });

  test("off the frame is off the whole frame, as it always was", () => {
    expect(pointOnFrame({ left: -1, top: 50 })).toBe(false);
    expect(pointOnFrame({ left: 100, top: 100 })).toBe(true);
    expect(pointInViewport({ left: 101, top: 50 }, WHOLE_FRAME)).toBe(false);
  });
});
