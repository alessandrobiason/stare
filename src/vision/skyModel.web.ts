/**
 * The web build is the replay harness, and its sky model runs under ONNX
 * Runtime Web rather than the React Native runtime `skyModel.ts` uses.
 *
 * This file exists only because the bundler picks the implementation by
 * platform, and can only pick a sibling of the module being imported. The
 * implementation itself is the harness's, and lives with the rest of it.
 */
export { createSkyModel } from "../../testing/replay/skyModelWeb";
