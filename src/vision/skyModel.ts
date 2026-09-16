import { Directory, File, FileMode, Paths } from "expo-file-system";
import { env, InferenceSession, Tensor } from "onnxruntime-react-native";
import { DEVICE_CAMERA } from "../constants";
import { SKY_MODEL_URL } from "./skyModelSource";
import { prepareSkyModel } from "./skyModelPreparation";
import { modelInputSize, Size } from "./skySegmentation";
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
 * model is downloaded to the app's own storage first and kept there — and on
 * the phone it is then rewritten once for Core ML, and that is kept too.
 */

const MODEL_DIRECTORY = "stare";
const MODEL_FILE = "skywater-segformer-b2.onnx";

/**
 * The one input size the phone feeds the model, which is written into the
 * prepared model: the camera's frame, shaped to the model's pixel budget. See
 * `modelInputSize`, and `skyModelPreparation.ts` for why a fixed size is what
 * lets Core ML take the network whole.
 */
const INPUT_SIZE = modelInputSize({ width: DEVICE_CAMERA.widthPx, height: DEVICE_CAMERA.heightPx });

/**
 * Bumped whenever `prepareSkyModel` changes what it writes. It names the
 * prepared file and the Core ML cache key both, and the provider never checks
 * whether a cached compilation still matches the model it was made from — so
 * a change here that forgot this would run the old graph from the cache.
 */
const PREPARATION_VERSION = 1;

/**
 * Where the prepared model is kept, and the key its Core ML compilation is
 * cached under. Both carry the input size, which is compiled in.
 */
const PREPARED_TAG = `w${INPUT_SIZE.width}h${INPUT_SIZE.height}v${PREPARATION_VERSION}`;
const PREPARED_FILE = `skywater-segformer-b2.coreml-${PREPARED_TAG}.onnx`;
const COREML_CACHE_KEY = `skywaterb2${PREPARED_TAG}`;

/**
 * Core ML on the Neural Engine, and the model whole.
 *
 * **What this replaced.** The provider list was CPU alone for a while, as an
 * experiment after a hand-held session on an iPhone 12 mini was ended by the
 * operating system twice at 2 GB resident, growing by tens of megabytes a pass.
 * It worked, in the sense that memory held; but B2 at fp32 on the CPU is the
 * better part of a second of every core the phone has, and that was the camera
 * preview stuttering on every pass, for everything else on the phone was
 * waiting on those cores too.
 *
 * **What was wrong with Core ML before.** It was never Core ML that was being
 * run. Handed the published graph — every spatial axis dynamic — the provider
 * could place only a fragment of it: every reshape and slice computes its shape
 * at run time, which Core ML does not accept, and the legacy NeuralNetwork
 * format it was defaulting to has no layer norm and no `Erf` at all. The graph
 * went to Core ML as roughly three hundred and fifty separate models with the
 * CPU running the 886 nodes between them, so a pass was hundreds of round trips
 * between the two runtimes, each allocating on both sides, and whatever the
 * CPU half left undone it did on every core. That is the likeliest account of
 * both the load and the leak — the second is not proven, and the memory gauge
 * on the first long session is what settles it — and neither is a property of
 * running this network on Core ML.
 *
 * **What it is now.** The model is rewritten once so that its shapes are fixed
 * (`skyModelPreparation.ts`), and handed to the provider as:
 *
 * - `MLProgram`, the format with the operators this network needs.
 * - `CPUAndNeuralEngine`, not `ALL`. The GPU is the one other thing on the
 *   phone the camera preview and the marker canvas both draw with, and a pass
 *   that took it would be the same stutter moved to a different chip. The Neural
 *   Engine is a separate processor that nothing else in the app uses.
 * - `RequireStaticInputShapes`, so a graph that somehow reached the provider
 *   with a dynamic shape would be refused and run on the CPU where it shows —
 *   the time in the debug panel — rather than compiled into the flexible model
 *   the old path produced.
 * - A cache directory, so the compilation — many seconds for a network this
 *   size — happens on the first launch rather than every one. Versioned by the
 *   runtime as well as the key, since what a different runtime compiled is not
 *   something to trust.
 *
 * Checked off the phone against the provider's own operator rules for
 * 1.24.3, on the graph ONNX Runtime partitions: all 759 nodes go to Core ML, as
 * one model. Verified on the phone is a different claim, and the one to make
 * with Instruments' Core ML template before trusting either figure.
 */
function executionProviders(cacheDirectory: string): InferenceSession.ExecutionProviderConfig[] {
  return [
    {
      name: "coreml",
      ModelFormat: "MLProgram",
      MLComputeUnits: "CPUAndNeuralEngine",
      RequireStaticInputShapes: "1",
      ModelCacheDirectory: cacheDirectory
    } as InferenceSession.ExecutionProviderOption,
    "cpu"
  ];
}

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
async function localModel(directory: Directory): Promise<File> {
  const file = new File(directory, MODEL_FILE);
  if (file.exists && (file.size ?? 0) > 0) return file;

  return File.downloadFileAsync(SKY_MODEL_URL, file, { idempotent: true });
}

/**
 * The downloaded model rewritten for Core ML, made once and kept beside it.
 *
 * Written to a partial file and renamed into place, for the reason the download
 * is: a launch interrupted mid-write must not find a truncated model next time
 * under the name of a finished one. Earlier preparations — another version,
 * another input size — are removed once this one is in place, since each is the
 * size of the model.
 */
async function preparedModel(directory: Directory, source: File): Promise<File> {
  const prepared = new File(directory, PREPARED_FILE);
  if (prepared.exists && (prepared.size ?? 0) > 0) return prepared;

  const { parts } = prepareSkyModel(await source.bytes(), {
    dimensions: { batch: 1, height: INPUT_SIZE.height, width: INPUT_SIZE.width },
    coreMlCacheKey: COREML_CACHE_KEY
  });

  const partial = new File(directory, `${PREPARED_FILE}.partial`);
  partial.create({ overwrite: true });
  const handle = partial.open(FileMode.Truncate);
  try {
    for (const part of parts) handle.writeBytes(part);
  } finally {
    handle.close();
  }
  // An empty file left under the finished name — the one case the check above
  // passes over — would otherwise stop the rename.
  if (prepared.exists) prepared.delete();
  partial.rename(PREPARED_FILE);

  for (const entry of directory.list()) {
    if (entry instanceof File && entry.name.includes(".coreml-") && entry.name !== PREPARED_FILE) {
      entry.delete();
    }
  }
  return new File(directory, PREPARED_FILE);
}

/**
 * Where Core ML's compilations are kept, as the plain path the provider takes.
 *
 * One directory per runtime version, and any other version's removed: a
 * compilation is the size of the model again, and nothing will read an old
 * runtime's.
 */
function coreMlCacheDirectory(directory: Directory): string {
  const root = new Directory(directory, "coreml-cache");
  // The binding's version, which the pod is pinned to (see the patch to
  // `onnxruntime-react-native`), and so the native runtime's as well.
  const current = `onnxruntime-${env.versions["react-native"] ?? "unknown"}`;
  root.create({ intermediates: true, idempotent: true });
  for (const entry of root.list()) {
    if (entry instanceof Directory && entry.name !== current) entry.delete();
  }
  const cache = new Directory(root, current);
  cache.create({ intermediates: true, idempotent: true });
  return decodeURIComponent(cache.uri.replace(/^file:\/\//, "")).replace(/\/$/, "");
}

export async function createSkyModel(): Promise<SkyModel> {
  const directory = new Directory(Paths.document, MODEL_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });

  const model = await preparedModel(directory, await localModel(directory));
  const session = await InferenceSession.create(model.uri, {
    executionProviders: executionProviders(coreMlCacheDirectory(directory)),
    graphOptimizationLevel: "all",
    /**
     * One thread for whatever ONNX Runtime still runs itself, which with the
     * whole graph on Core ML is the copy in and the copy out.
     *
     * Its default is a pool as wide as the phone, which is what took every core
     * from the camera when the network ran here; left at that default it would
     * do so again the moment anything fell back to the CPU. One thread makes a
     * fallback slow instead — a stale mask, which the debug panel shows — rather
     * than a stuttering camera, which is the problem this whole arrangement is
     * the answer to.
     */
    intraOpNumThreads: 1,
    extra: {
      optimization: {
        /**
         * The one ONNX Runtime optimisation Core ML cannot afford.
         *
         * It runs before the graph is partitioned and fuses every `MatMul` and
         * `Add` into a `Gemm`, and the provider writes a `Gemm`'s weights into
         * the compiled model *as text* rather than into its weight file — for
         * this network, most of its 95 MB several times over, parsed at every
         * compilation. Off, the same arithmetic stays two operators Core ML
         * takes as they are. See microsoft/onnxruntime#32212.
         */
        disable_specified_optimizers: "MatMulAddFusion"
      }
    }
  });

  return {
    async run(input: Float32Array, size: Size): Promise<Float32Array> {
      // The size is compiled in, so another one is a bug upstream rather than
      // something to try: Core ML would refuse it, and the error it gives does
      // not say why.
      if (size.width !== INPUT_SIZE.width || size.height !== INPUT_SIZE.height) {
        throw new Error(
          `The sky model is prepared for ${INPUT_SIZE.width}x${INPUT_SIZE.height}, not ${size.width}x${size.height}`
        );
      }
      const outputs = await session.run({
        [session.inputNames[0]]: new Tensor("float32", input, [1, 3, size.height, size.width])
      });
      // By name from the graph rather than a hard-coded "output", so a
      // re-exported model cannot silently hand back `undefined`.
      return outputs[session.outputNames[0]].data as Float32Array;
    }
  };
}
