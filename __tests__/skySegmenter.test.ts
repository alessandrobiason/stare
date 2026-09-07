import { maskGridFor, modelInputSize, Size } from "../src/vision/skySegmentation";
import { segmentSky, ShutterCallback, SkyFrameGrabber } from "../src/vision/skySegmenter";

/** What happened, in the order it happened, across one pass. */
const mockOrder: string[] = [];

jest.mock("../src/vision/skyModel", () => ({
  createSkyModel: async () => ({
    run: async (_input: Float32Array, size: { width: number; height: number }) => {
      mockOrder.push("model");
      return new Float32Array(4 * size.width * size.height);
    }
  })
}));

const FRAME: Size = { width: 720, height: 1280 };

/** A frame source that reports its shutter and then takes its time about it. */
function slowGrabber(): SkyFrameGrabber {
  return {
    size: () => FRAME,
    async grab(size: Size, onShutter: ShutterCallback) {
      mockOrder.push("shutter");
      onShutter();
      // Standing in for the resize, the JPEG round trip and everything else
      // between the shutter and a block of pixels.
      await Promise.resolve();
      mockOrder.push("pixels");
      return {
        pixels: new Uint8Array(size.width * size.height * 4),
        channels: 4 as const
      };
    }
  };
}

test("the shutter is reported before the work the frame is put through", async () => {
  const seen: string[] = [];
  const pass = await segmentSky(slowGrabber(), () => seen.push("read the attitude"));

  // The mask is aimed by the attitude read at the shutter, so that reading has
  // to happen while the camera is still on the frame being segmented — not after
  // a resize, an encode and the better part of a second of inference, by which
  // time a phone being panned is pointing somewhere else.
  expect(seen).toEqual(["read the attitude"]);
  expect(mockOrder).toEqual(["shutter", "pixels", "model"]);

  // And the pass is otherwise the pass it was: a mask over the frame's own grid.
  expect({ columns: pass.mask.columns, rows: pass.mask.rows }).toEqual(maskGridFor(FRAME));

  // The pixels the model was shown come back with it, at the size it was given
  // them: the celestial alignment reads the same frame rather than capturing
  // another one. See `SegmentedFrame`.
  expect(pass.size).toEqual(modelInputSize(FRAME));
  expect(pass.pixels.pixels.length).toBe(pass.size.width * pass.size.height * 4);
});
