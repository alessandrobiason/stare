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
