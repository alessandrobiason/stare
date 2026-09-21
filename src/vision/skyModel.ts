import { Directory, File, FileMode, Paths } from "expo-file-system";
import { env, InferenceSession, Tensor } from "onnxruntime-react-native";
import { DEVICE_CAMERA } from "../constants";
import { yieldToEventLoop } from "../timeSlice";
import { reportSkyModelDownload, reportSkyModelPhase } from "./skyModelProgress";
import { SKY_MODEL_URL } from "./skyModelSource";
import { prepareSkyModel } from "./skyModelPreparation";
import { modelInputSize, Size } from "./skySegmentation";
import { SkyModel, SkyModelDiagnostics } from "./skyModelTypes";

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
 * model is downloaded to the app's own storage first and rewritten once for
 * Core ML, and it is the rewrite that is kept.
 *
 * **Where "the app's own storage" is, which is not a detail.** Everything this
 * file writes goes under `Paths.cache` — `Library/Caches` on iOS — and that is
 * a deliberate move from the document directory, where it used to live.
 *
 * iOS backs the document directory up to iCloud. Apple's data storage
 * guidelines say plainly that re-downloadable content must not go there, and a
 * 95 MB model fetched from a pinned URL is the example they give: an app that
 * kept it in Documents would be charging every user's iCloud quota — and every
 * restore — for a file any phone can fetch again in a few minutes. `Caches` is
 * the directory that exists for exactly this, so the correct fix is to use it
 * rather than to keep the file where it was and flag it.
 *
 * The reason it was in Documents was that the system may purge `Caches` when
 * the device is short of space, and a re-download nobody asked for read as the
 * app being broken. Two things have since made that the wrong trade:
 *
 * - **A purge is now visible.** The boot screen has a bar fed by this
 *   download's own byte progress (`skyModelProgress.ts`), so a launch that has
 *   to fetch the model again says so and shows how far along it is. The old
 *   objection was to a silent wait, and the wait is no longer silent.
 * - **The app was never offline-durable anyway.** It refuses to open on orbital
 *   elements older than `TLE_USABLE_INTERVAL_MS`, which is a day. A launch that
 *   finds the model purged is, more often than not, a launch that would have
 *   stopped at the catalogue regardless. Keeping 95 MB out of the reach of a
 *   purge bought an offline guarantee the rest of the app does not make.
 *
 * What a purge costs is therefore a visible download on one launch. What
 * Documents cost was every user's backup, permanently.
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
 * The downloaded model, fetched if it is not on disk yet, reporting as it comes.
 *
 * `downloadFileAsync` completes into a temporary location and moves the file
 * into place only on success, so an interrupted download cannot leave a
 * truncated model behind to be loaded next time. Its progress is what the boot
 * screen's bar is made of on a first launch: 95 MB is minutes on an ordinary
 * connection, and every one of them used to pass with nothing on screen moving.
 * See `skyModelProgress.ts`.
 */
async function downloadedModel(directory: Directory): Promise<File> {
  const file = new File(directory, MODEL_FILE);
  if (file.exists && (file.size ?? 0) > 0) return file;

  // Published before the request goes out rather than on the first chunk back:
  // a connection can spend seconds resolving and handshaking, and the bar
  // should be saying "downloading" through those too.
  reportSkyModelDownload(0, 0);
  return File.downloadFileAsync(SKY_MODEL_URL, file, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => reportSkyModelDownload(bytesWritten, totalBytes)
  });
}

/** What `preparedModel` did, for the Console's "Sky model" page. */
type PreparationOutcome = {
  file: File;
  freshlyPrepared: boolean;
  /** `null` when this launch found an earlier one's file rather than rewriting it. */
  gathersRewritten: number | null;
};

/**
 * The model rewritten for Core ML: made once, kept, and the only copy kept.
 *
 * The download is behind this rather than beside it, which is the whole of the
 * arrangement: a launch that already has a prepared file never asks the network
 * anything, and a launch that does not is the only one that pays for 95 MB.
 * They used to be resolved in the other order — the source first, then the
 * rewrite — which meant a phone whose *source* file had been evicted from the
 * cache re-downloaded the whole thing to prepare a file it already had.
 *
 * The source is then deleted, because after this it is dead weight. It is only
 * ever read again if `PREPARATION_VERSION` or the input size moves, which is an
 * app update away and a fresh download either way; keeping it against that
 * charged every phone a permanent 95 MB, and charged it *in the cache*, where
 * the two files compete for the same purgeable budget as each other. Holding
 * the spare made losing the one that matters more likely.
 *
 * Written to a partial file and renamed into place, for the reason the download
 * is: a launch interrupted mid-write must not find a truncated model next time
 * under the name of a finished one. Earlier preparations — another version,
 * another input size — are removed once this one is in place, since each is the
 * size of the model.
 */
async function preparedModel(directory: Directory): Promise<PreparationOutcome> {
  const prepared = new File(directory, PREPARED_FILE);
  if (prepared.exists && (prepared.size ?? 0) > 0) {
    return { file: prepared, freshlyPrepared: false, gathersRewritten: null };
  }

  const source = await downloadedModel(directory);
  reportSkyModelPhase("preparing");
  /**
   * One frame for the screen to say so, before the rewrite takes the thread.
   *
   * `prepareSkyModel` is a synchronous walk over 95 MB of protobuf and it holds
   * the JS thread for the whole of its length: the boot sky stops turning and
   * the bar stops moving, which is exactly the shape this release set out to
   * stop looking like. It cannot be sliced without restructuring the rewrite,
   * and it does not need to be — a freeze that happens while the screen already
   * reads "preparing the sky detection model" is a wait somebody can make sense
   * of. Without this yield the phase is published to a ref and the thread is
   * gone before any frame carrying it is drawn, so the words would arrive only
   * after the wait they explain.
   */
  await yieldToEventLoop();
  const { parts, gathersRewritten } = prepareSkyModel(await source.bytes(), {
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
  // Only once the rewrite is safely under its finished name: an interruption
  // between the two must cost the preparation, never both copies.
  if (source.exists) source.delete();

  return { file: new File(directory, PREPARED_FILE), freshlyPrepared: true, gathersRewritten };
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

/**
 * Clears out the copy earlier builds kept in the document directory.
 *
 * Cheap — one `exists` on a launch that has nothing to remove — and the only
 * thing that makes the move above real for a phone that has already run an
 * older build. Without it those phones keep ~190 MB of a re-downloadable model
 * in the backed-up directory forever, which is the whole of what the move was
 * for; the new build would simply have stopped reading it.
 *
 * Swallowed on failure: this is housekeeping, and a phone that will not let go
 * of the old directory is not a reason to refuse to start.
 */
function discardLegacyDocumentCopy(): void {
  try {
    const legacy = new Directory(Paths.document, MODEL_DIRECTORY);
    if (legacy.exists) legacy.delete();
  } catch {
    // Nothing to do about it, and nothing worth stopping boot for.
  }
}

export async function createSkyModel(): Promise<SkyModel> {
  const startedAtMs = performance.now();
  const directory = new Directory(Paths.cache, MODEL_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  discardLegacyDocumentCopy();

  const preparation = await preparedModel(directory);
  reportSkyModelPhase("starting");
  const session = await InferenceSession.create(preparation.file.uri, {
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

  // Whichever of the two is slow says what to look at: a slow *load* on every
  // launch is the compile cache not holding, and a slow first *run* once
  // segmentation starts is inference having fallen off the Neural Engine.
  const diagnostics: SkyModelDiagnostics = {
    backend: "Core ML (Neural Engine + CPU) on ONNX Runtime",
    detail:
      `MLProgram · ${INPUT_SIZE.width}x${INPUT_SIZE.height} · cache "${COREML_CACHE_KEY}"` +
      (preparation.freshlyPrepared ? " · rewritten this launch" : " · reused from an earlier launch"),
    loadMs: performance.now() - startedAtMs,
    prepared: {
      freshlyPrepared: preparation.freshlyPrepared,
      gathersRewritten: preparation.gathersRewritten,
      bytes: preparation.file.size ?? 0
    }
  };

  reportSkyModelPhase("ready");

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
    },
    diagnostics
  };
}
