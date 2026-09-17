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
/** What a decoded still comes back as, which the video-frame tests set. */
let mockStill: { width: number; height: number; pixels: Uint8Array } = {
  width: 4,
  height: 4,
  pixels: new Uint8Array(4 * 4 * 4)
};
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
            width: () => mockStill.width,
            height: () => mockStill.height,
            readPixels: () => mockStill.pixels
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

describe("frames from the video stream", () => {
  const VIDEO = { width: 32, height: 44 };

  /** A picture with a layout to it: bright at the top left, dark elsewhere. */
  function picture(turned = false): Uint8Array {
    const pixels = new Uint8Array(VIDEO.width * VIDEO.height * 4);
    for (let y = 0; y < VIDEO.height; y += 1) {
      for (let x = 0; x < VIDEO.width; x += 1) {
        const [px, py] = turned ? [VIDEO.width - 1 - x, VIDEO.height - 1 - y] : [x, y];
        const value = px < VIDEO.width / 3 && py < VIDEO.height / 4 ? 240 : (px * 3 + py * 2) % 40;
        const at = (y * VIDEO.width + x) * 4;
        pixels[at] = value;
        pixels[at + 1] = value;
        pixels[at + 2] = value;
        pixels[at + 3] = 255;
      }
    }
    return pixels;
  }

  /** A camera with a frame tap, and a still path the check can compare against. */
  function tappedCamera(frame: () => Promise<ArrayBuffer | undefined>) {
    return {
      ...slowCamera(),
      grabFrameAsync: jest.fn(async () => {
        mockOrder.push("video frame requested");
        return frame();
      })
    };
  }

  let warn: jest.SpyInstance;
  beforeEach(() => {
    mockOrder.length = 0;
    mockStill = { width: VIDEO.width, height: VIDEO.height, pixels: picture() };
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    mockStill = { width: 4, height: 4, pixels: new Uint8Array(4 * 4 * 4) };
    warn.mockRestore();
  });

  test("read the attitude at the request, and take no still once they have been checked", async () => {
    const camera = tappedCamera(async () => picture().buffer as ArrayBuffer);
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    // The first frame is checked against a still of the same moment…
    await grabber.grab(VIDEO, () => mockOrder.push("read the attitude"));
    expect(mockOrder.slice(0, 3)).toEqual(["read the attitude", "video frame requested", "read the attitude"]);
    expect(mockOrder).toContain("capture requested");
    expect(grabber.reading?.().agreement).toMatch(/^matches a still/);

    // …and after that a pass is a video frame and nothing else.
    mockOrder.length = 0;
    const frame = await grabber.grab(VIDEO, () => mockOrder.push("read the attitude"));
    expect(mockOrder).toEqual(["read the attitude", "video frame requested"]);
    expect(frame.pixels).toHaveLength(VIDEO.width * VIDEO.height * 4);
    expect(grabber.reading?.()).toMatchObject({ source: "video frame", preferVideo: true, fallbackReason: null });
  });

  test("go back to stills when the video frame is the wrong way up against one", async () => {
    const camera = tappedCamera(async () => picture(true).buffer as ArrayBuffer);
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    const first = await grabber.grab(VIDEO, () => undefined);
    // The still, not the turned frame, is what this pass segments.
    expect(Array.from(first.pixels)).toEqual(Array.from(picture()));
    expect(grabber.reading?.().fallbackReason).toMatch(/turned/);

    mockOrder.length = 0;
    await grabber.grab(VIDEO, () => undefined);
    expect(mockOrder).not.toContain("video frame requested");
    expect(grabber.reading?.().source).toBe("still photo");
  });

  test("keep checking a picture with nothing in it, but only a few times", async () => {
    const flat = new Uint8Array(VIDEO.width * VIDEO.height * 4).fill(128);
    mockStill = { width: VIDEO.width, height: VIDEO.height, pixels: flat };
    const camera = tappedCamera(async () => flat.slice().buffer as ArrayBuffer);
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    let stills = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      mockOrder.length = 0;
      await grabber.grab(VIDEO, () => undefined);
      if (mockOrder.includes("capture requested")) stills += 1;
    }
    expect(stills).toBe(3);
    expect(grabber.reading?.().agreement).toMatch(/inconclusive after 3 of 3/);
    expect(grabber.reading?.().source).toBe("video frame");
  });

  test("fall back to stills for good on a build whose camera has no frame tap", async () => {
    const camera = tappedCamera(async () => undefined);
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    const frame = await grabber.grab(VIDEO, () => undefined);
    expect(frame.pixels).toHaveLength(VIDEO.width * VIDEO.height * 4);
    expect(grabber.reading?.().fallbackReason).toBe("This build's camera has no video frame tap");

    await grabber.grab(VIDEO, () => undefined);
    expect(camera.grabFrameAsync).toHaveBeenCalledTimes(1);
  });

  test("read a still for each failed video frame, and stop asking after a run of them", async () => {
    const camera = tappedCamera(async () => {
      throw new Error("No video frame arrived in time");
    });
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    for (let pass = 0; pass < 5; pass += 1) {
      const frame = await grabber.grab(VIDEO, () => undefined);
      expect(frame.pixels).toHaveLength(VIDEO.width * VIDEO.height * 4);
    }
    expect(camera.grabFrameAsync).toHaveBeenCalledTimes(3);
    expect(grabber.reading?.().fallbackReason).toBe(
      "3 video frames failed in a row: No video frame arrived in time · video again in 30 s"
    );
  });

  test("try video frames again once the stills after a run of failures have had their half minute", async () => {
    let now = 1_000;
    const clock = jest.spyOn(performance, "now").mockImplementation(() => now);
    try {
      let failing = true;
      const camera = tappedCamera(async () => {
        if (failing) throw new Error("No video frame arrived in time");
        return picture().buffer as ArrayBuffer;
      });
      const grabber = cameraFrameGrabber(() => camera as never, FRAME);
      for (let pass = 0; pass < 3; pass += 1) await grabber.grab(VIDEO, () => undefined);
      expect(grabber.reading?.().fallbackReason).toMatch(/video again in 30 s$/);

      // Still inside the half minute: stills, and no video asked for.
      now += 29_000;
      await grabber.grab(VIDEO, () => undefined);
      expect(camera.grabFrameAsync).toHaveBeenCalledTimes(3);

      // Past it, with the camera working again: video frames, and the fallback gone.
      now += 2_000;
      failing = false;
      await grabber.grab(VIDEO, () => undefined);
      expect(camera.grabFrameAsync).toHaveBeenCalledTimes(4);
      expect(grabber.reading?.()).toMatchObject({ source: "video frame", fallbackReason: null });
    } finally {
      clock.mockRestore();
    }
  });

  test("wait out a camera that is not running, rather than count it against video frames", async () => {
    // The phone locked and unlocked: the session is stopped while it restarts.
    const stopped = new Error(
      "Calling the 'grabFrame' function has failed → Caused by: CameraFrameTapNotRunningException: The capture session is not running"
    );
    const camera = tappedCamera(async () => {
      throw stopped;
    });
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    for (let pass = 0; pass < 5; pass += 1) {
      mockOrder.length = 0;
      // The pass fails, and no still is taken: it would be refused the same way.
      await expect(grabber.grab(VIDEO, () => undefined)).rejects.toBe(stopped);
      expect(mockOrder).not.toContain("capture requested");
    }
    // Five of them, and video frames are still what is asked for.
    expect(camera.grabFrameAsync).toHaveBeenCalledTimes(5);
    expect(grabber.reading?.().fallbackReason).toBeNull();
  });

  test("refuse a frame of the wrong size rather than segmenting garbage", async () => {
    const camera = tappedCamera(async () => new ArrayBuffer(12));
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);

    // One failure is not a run: the pass still gets a still.
    const frame = await grabber.grab(VIDEO, () => undefined);
    expect(frame.pixels).toHaveLength(VIDEO.width * VIDEO.height * 4);
    expect(grabber.reading?.().fallbackReason).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test("switch to stills from the Console, and back to a fresh start", async () => {
    const camera = tappedCamera(async () => picture(true).buffer as ArrayBuffer);
    const grabber = cameraFrameGrabber(() => camera as never, FRAME);
    await grabber.grab(VIDEO, () => undefined);
    expect(grabber.reading?.().fallbackReason).not.toBeNull();

    grabber.setPreferVideo?.(false);
    expect(grabber.reading?.().preferVideo).toBe(false);

    // Switched back on, whatever ruled video frames out is forgotten, and they
    // are checked against a still again.
    grabber.setPreferVideo?.(true);
    expect(grabber.reading?.()).toMatchObject({ preferVideo: true, fallbackReason: null, agreement: null });
    mockOrder.length = 0;
    await grabber.grab(VIDEO, () => undefined);
    expect(mockOrder).toContain("video frame requested");
  });
});
