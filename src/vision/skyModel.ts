import { Directory, File, Paths } from "expo-file-system";
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import { SKY_MODEL_URL } from "./skyModelSource";
import { Size } from "./skySegmentation";
import { SkyModel } from "./skyModelTypes";

/**
 * The sky model under ONNX Runtime React Native.
 *
 * What ships. The web build — the replay harness — resolves `skyModel.web.ts`
 * to the same graph under ONNX Runtime Web instead. Both are the official
 * MIT-licensed ONNX Runtime distributions executing the same SkyWater-Seg graph
 * on the same normalized input, so the harness produces the mask the phone
 * would rather than an approximation of it.
 *
 * The one difference the runtimes force is where the file comes from. ONNX
 * Runtime Web fetches a URL itself; the native runtime takes a path, so the
 * model is downloaded to the app's own storage first and kept there.
 */

const MODEL_DIRECTORY = "stare";
const MODEL_FILE = "skywater-segformer-b2.onnx";

/**
 * CPU only, for now, and this is a measurement rather than a preference.
 *
 * CoreML belongs first here: it puts the graph on the Neural Engine, which is
 * the difference between a few milliseconds and a few hundred on a phone, and
 * listing CPU after it was never a fallback mask — ONNX Runtime places whatever
 * CoreML cannot take on the CPU either way. That line is the one this replaces,
 * and it should come back.
 *
 * What replaces it, and why: a hand-held session on an iPhone 12 mini was ended
 * by the operating system twice, with Stare at 2.0 GB resident out of 4 GB and
 * named as `largestProcess` in the jetsam report — once for `vm-pageshortage`
 * and once, in the foreground, for `proc-thrashing`. Two figures in that report
 * say what kind of failure it is. `lifetimeMax` equals the resident count in
 * both kills, so the memory only ever went up; and it got there on 10 seconds of
 * CPU time, which at this loop's rate is a few dozen passes. That is on the
 * order of 30-50 MB retained per inference, growing without bound.
 *
 * It is not the capture path — every native ref there is released by hand and
 * the temporary JPEG is deleted, which is what d60cdda was about — and it is not
 * the tensors, which are 4 MB a pass and would need hundreds of passes to
 * account for it. It is native, per-run, and this is the only native per-run
 * thing left. The suspicion is the CoreML EP not releasing prediction buffers
 * between runs on a graph whose spatial axes are declared dynamic.
 *
 * So: one variable at a time. If memory flattens with CoreML out of the list,
 * the leak is the EP and the fix is upstream of this preference — fixed input
 * dimensions in the exported graph, or the session's arena settings. If it does
 * not flatten, the suspicion was wrong and this line goes straight back.
 *
 * The cost meanwhile is real. B2 at fp32 on the CPU is seconds rather than
 * milliseconds per pass; `startSegmentationLoop` spaces from the end of a pass
 * so it degrades into a slower mask rather than a treadmill, but expect
 * SKY_MASK_MAX_AGE_SECONDS to start firing. This is not a state to ship in.
 */
const EXECUTION_PROVIDERS = ["cpu"];

/**
 * The model in the app's document directory, downloaded if it is not there yet.
 *
 * The document directory rather than the cache: iOS evicts the latter when it is
 * short of space, and re-downloading 95 MB on a launch the user expected to be
 * offline is worse than the space it costs. `downloadFileAsync` completes into a
 * temporary location and moves the file into place only on success, so an
 * interrupted download cannot leave a truncated model behind to be loaded next
 * time.
 */
async function localModel(): Promise<File> {
  const directory = new Directory(Paths.document, MODEL_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });

  const file = new File(directory, MODEL_FILE);
  if (file.exists && (file.size ?? 0) > 0) return file;

  return File.downloadFileAsync(SKY_MODEL_URL, file, { idempotent: true });
}

export async function createSkyModel(): Promise<SkyModel> {
  const file = await localModel();
  const session = await InferenceSession.create(file.uri, {
    executionProviders: EXECUTION_PROVIDERS,
    graphOptimizationLevel: "all"
  });

  return {
    async run(input: Float32Array, size: Size): Promise<Float32Array> {
      const outputs = await session.run({
        [session.inputNames[0]]: new Tensor("float32", input, [1, 3, size.height, size.width])
      });
      // By name from the graph rather than a hard-coded "output", so a
      // re-exported model cannot silently hand back `undefined`.
      return outputs[session.outputNames[0]].data as Float32Array;
    }
  };
}
