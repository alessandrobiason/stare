import { Size } from "./skySegmentation";

/**
 * What a loaded model can say about itself, for the Console's "Sky model" page.
 *
 * Free-form beyond a few fields on purpose: the two implementations behind
 * `SkyModel` run on different runtimes with different failure modes worth
 * showing, and forcing them into one rigid shape would mean neither said
 * anything useful. What both must say is where the graph actually runs and how
 * long the session took to come up — the two figures that tell a stuttering
 * preview apart from a merely slow first launch.
 */
export type SkyModelDiagnostics = {
  /** Where the graph runs: "Core ML (Neural Engine + CPU)", "ONNX Runtime Web (WASM)". */
  backend: string;
  /** One line of whatever else is worth knowing: format, thread count, cache key. */
  detail: string;
  /**
   * How long bringing the session up took, in milliseconds — downloading and
   * rewriting the model included on the native runtime, so a launch stuck
   * recompiling for Core ML reads as a number in the tens of seconds rather
   * than as a session that quietly took its time.
   */
  loadMs: number;
  /** The native runtime's own preparation pass, when there is one. See `skyModelPreparation.ts`. */
  prepared?: {
    /** Whether this launch rewrote the model, or found an earlier launch's copy. */
    freshlyPrepared: boolean;
    /** How many scalar-index gathers the rewrite split, when it ran this launch. */
    gathersRewritten: number | null;
    /** Size of the file the session was actually opened from. */
    bytes: number;
  };
};

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
  /** How this session came up, for the Console. See `SkyModelDiagnostics`. */
  diagnostics: SkyModelDiagnostics;
};
