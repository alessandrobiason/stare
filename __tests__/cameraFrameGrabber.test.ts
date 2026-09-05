import { cameraFrameGrabber } from "../src/vision/cameraFrameGrabber";

/** What happened, in the order it happened, across one grab. */
const mockOrder: string[] = [];

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: () => ({
        renderAsync: async () => {
          mockOrder.push("resize");
          return {
            saveAsync: async () => ({ uri: "file://frame.jpg" }),
            release: () => undefined
          };
        },
        release: () => undefined
      })
    })
  }
}));

jest.mock("expo-file-system", () => ({
  File: class {
    exists = false;
    async arrayBuffer() {
      mockOrder.push("read");
      return new ArrayBuffer(0);
    }
    delete() {}
  }
}));

jest.mock("jpeg-js", () => ({
  decode: () => {
    mockOrder.push("decode");
    return { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) };
  }
}));

const FRAME = { width: 1080, height: 1440 };
const SIZE = { width: 4, height: 4 };

/**
 * A camera whose still takes a while to come back, as a real one does: the
 * capture is encoded to JPEG at full resolution and decoded again before
 * `takePictureAsync` resolves.
 */
function slowCamera() {
  return {
    async takePictureAsync() {
      mockOrder.push("capture requested");
      await Promise.resolve();
      mockOrder.push("capture returned");
      return { release: () => undefined };
    }
  };
}

test("the attitude is read when the still is asked for, not when it comes back", async () => {
  const camera = slowCamera();
  const grabber = cameraFrameGrabber(() => camera as never, FRAME);

  await grabber.grab(SIZE, () => mockOrder.push("read the attitude"));

  // The photons land at the near end of a capture, with the preview already
  // running; the far end is a full-resolution encode and decode later. Read at
  // the far end, the mask is filed under an aim a whole capture ahead of the
  // frame it describes — which is the mask trailing the buildings by tens of
  // degrees whenever the phone is panned at hand speed.
  expect(mockOrder.indexOf("read the attitude")).toBeLessThan(
    mockOrder.indexOf("capture requested")
  );
  expect(mockOrder).toEqual([
    "read the attitude",
    "capture requested",
    "capture returned",
    "resize",
    "read",
    "decode"
  ]);
});
