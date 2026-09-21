/**
 * The segmentation model itself, named in one place because both platforms load
 * the same file.
 *
 * SkyWater-Seg is a SegFormer MiT-B2 fine-tuned on ADE20K for sky, water and
 * person, published under the MIT licence. Its ONNX graph declares both spatial
 * axes dynamic, so the one file serves the recording's portrait frame and the
 * phone's 4:3 preview without reshaping either. The class order it outputs is in
 * `skySegmentation.ts`, next to the code that reads it.
 */

/** Pinning the revision keeps the downloaded model reproducible. */
const DEFAULT_MODEL_URL =
  "https://huggingface.co/Realcat/skywater_seg/resolve/dac255883ec5faf508561a47172096bfd8708db0/skywater_segformer_b2_fp32.onnx";

/**
 * Where the model is fetched from. Mirror it and set the variable for offline or
 * self-hosted deployments; the 95 MB download is otherwise a first-run cost on
 * both the web and the phone.
 */
export const SKY_MODEL_URL = process.env.EXPO_PUBLIC_SKYWATER_MODEL_URL ?? DEFAULT_MODEL_URL;

/**
 * Who the model belongs to, for the About page.
 *
 * SkyWater-Seg is somebody else's work under the MIT licence, and the licence
 * asks for the notice to travel with it. The weights are downloaded at runtime
 * rather than compiled into the binary, so strictly the app distributes
 * nothing — but the app is unusable without them, and a credit costs one line.
 * It lives here beside the URL it credits so the two cannot drift apart.
 */
export const SKY_MODEL_CREDIT = {
  name: "SkyWater-Seg",
  /** The model card, which is where the licence and the weights both are. */
  page: "https://huggingface.co/Realcat/skywater_seg"
} as const;

/**
 * Roughly how large that file is, for the one case where the bar would
 * otherwise have no denominator.
 *
 * The download reports its own total, taken from the response's
 * `Content-Length`, and that is the figure used whenever there is one — this is
 * only what stands in when a server answers without it. Being approximate
 * costs nothing: it is never shown as the *finished* size, only divided into
 * what has arrived so far, and a bar that is a percent out is a bar, where a
 * bar with no denominator is a stripe that does not move.
 *
 * Measured against the pinned revision above. A different revision is a
 * different file, so this moves with the URL.
 */
export const SKY_MODEL_APPROXIMATE_BYTES = 99_310_780;
