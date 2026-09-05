import { SKY_MODEL_URL } from "../../src/vision/skyModelSource";
import { Size } from "../../src/vision/skySegmentation";
import { SkyModel } from "../../src/vision/skyModelTypes";

/**
 * The sky model under ONNX Runtime Web (WASM): the harness's half of the pair
 * whose other half, `src/vision/skyModel.ts`, is what ships.
 *
 * Reached through `src/vision/skyModel.web.ts`, which the bundler picks for the
 * web build. Both are the official MIT-licensed ONNX Runtime distributions
 * running the same graph, so the mask the phone computes is the mask the replay
 * computes — which is the only reason a mask checked here says anything about
 * the phone.
 */

type OrtModule = typeof import("onnxruntime-web");

const ONNX_WASM_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/";
const WASM_URL = process.env.EXPO_PUBLIC_ONNX_WASM_URL ?? ONNX_WASM_CDN;

const SESSION_OPTIONS = {
  executionProviders: ["wasm"],
  graphOptimizationLevel: "all"
} as const;

/**
 * Creates the session with inference proxied to a worker, falling back to the
 * calling thread if that worker cannot be started.
 *
 * This model is a SegFormer-B2 in fp32: on single-threaded WASM one pass is on
 * the order of a second. `await`ing it does not make that asynchronous — WASM
 * runs on whatever thread calls it — so unproxied, every run holds the main
 * thread for about a second, and the whole view (video time, attitude, satellite
 * markers) advances in one-second steps because nothing else gets to run in
 * between. `env.wasm.proxy` moves the runtime into a worker of its own, which is
 * what makes the frame rate independent of the model.
 *
 * The proxy worker is inlined in the ONNX Runtime bundle as a blob, so it needs
 * nothing from the bundler; unlike `numThreads > 1` it also needs no
 * SharedArrayBuffer, and so no COOP/COEP headers. A page that blocks blob
 * workers outright still gets a working mask, just a stuttering one.
 */
async function createSession(ort: OrtModule) {
  try {
    ort.env.wasm.proxy = true;
    return await ort.InferenceSession.create(SKY_MODEL_URL, SESSION_OPTIONS);
  } catch (error) {
    console.warn(
      "Sky segmentation could not start its worker; inference will run on the main thread and the view will stutter",
      error
    );
    ort.env.wasm.proxy = false;
    return ort.InferenceSession.create(SKY_MODEL_URL, SESSION_OPTIONS);
  }
}

export async function createSkyModel(): Promise<SkyModel> {
  const ort = await import("onnxruntime-web");
  // Single-threaded avoids needing SharedArrayBuffer (and its COOP/COEP
  // headers), which this application does not otherwise require.
  ort.env.wasm.numThreads = 1;
  // Metro does not copy the package's .wasm files into the web export, so point
  // the runtime at a versioned public copy instead of letting initialization
  // stall on a 404.
  ort.env.wasm.wasmPaths = WASM_URL;

  const session = await createSession(ort);

  return {
    async run(input: Float32Array, size: Size): Promise<Float32Array> {
      // Proxied inference transfers the input buffer to the worker rather than
      // copying it, which detaches `input` here. Nothing reads it back, but a
      // future attempt to reuse one buffer across runs would find it emptied.
      const outputs = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, size.height, size.width])
      });
      // By name from the graph rather than a hard-coded "output", so a remirrored
      // or re-exported model cannot silently hand back `undefined`.
      return outputs[session.outputNames[0]].data as Float32Array;
    }
  };
}
