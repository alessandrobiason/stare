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

/** Whether Skia's codec takes the hand-off JPEG, which a test can refuse. */
let mockNativeDecodes = true;
/** Native decoder objects made and not yet released. */
let mockLiveNativeObjects = 0;

jest.mock("../src/components/skia", () => {
  const made = <T extends object>(object: T) => {
    mockLiveNativeObjects += 1;
    return { ...object, dispose: () => (mockLiveNativeObjects -= 1) };
  };
  return {
    AlphaType: { Unpremul: 3 },
    ColorType: { RGBA_8888: 4 },
    Skia: {
      Data: { fromBytes: () => made({}) },
      Image: {
        MakeImageFromEncoded: () => {
          mockOrder.push("decode");
          if (!mockNativeDecodes) return null;
          return made({
            width: () => 4,
            height: () => 4,
            readPixels: () => new Uint8Array(4 * 4 * 4)
          });
        }
      }
    }
  };
});

jest.mock("jpeg-js", () => ({
  decode: () => {
    mockOrder.push("decode in JavaScript");
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

test("the frame is decoded natively, and the native objects are let go of", async () => {
  mockOrder.length = 0;
  const grabber = cameraFrameGrabber(() => slowCamera() as never, FRAME);

  const frame = await grabber.grab(SIZE, () => undefined);

  // Decoded off the interpreter: a JPEG decoded in JavaScript is a frozen sky
  // for as long as it takes, on every pass.
  expect(mockOrder).toContain("decode");
  expect(mockOrder).not.toContain("decode in JavaScript");
  expect(frame.pixels).toHaveLength(SIZE.width * SIZE.height * 4);
  expect(mockLiveNativeObjects).toBe(0);
});

test("a frame the native codec declines is decoded in JavaScript rather than failing the pass", async () => {
  mockOrder.length = 0;
  mockNativeDecodes = false;
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const grabber = cameraFrameGrabber(() => slowCamera() as never, FRAME);

    const frame = await grabber.grab(SIZE, () => undefined);

    expect(mockOrder.slice(-2)).toEqual(["decode", "decode in JavaScript"]);
    expect(frame.pixels).toHaveLength(SIZE.width * SIZE.height * 4);
    expect(mockLiveNativeObjects).toBe(0);
  } finally {
    mockNativeDecodes = true;
    warn.mockRestore();
  }
});
