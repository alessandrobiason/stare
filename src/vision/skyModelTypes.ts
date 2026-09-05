import { Size } from "./skySegmentation";

/**
 * A loaded segmentation model: one forward pass, class logits out.
 *
 * The two implementations behind it — `skyModel.ts` on ONNX Runtime React
 * Native, and the harness's on ONNX Runtime Web — differ only in which official
 * build of the runtime executes the graph and where the file came from. The
 * graph, its input layout and its output layout are the same on both, which is
 * what lets everything either side of this interface be shared.
 */
export type SkyModel = {
  /**
   * Runs the network over one normalized CHW image.
   *
   * @param input `3 * width * height` floats, planar, ImageNet-normalized.
   * @returns `4 * width * height` class logits, planar, at the input's size.
   */
  run(input: Float32Array, size: Size): Promise<Float32Array>;
};
