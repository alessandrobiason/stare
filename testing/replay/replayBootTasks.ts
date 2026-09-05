import { loadActiveCatalog } from "../../src/data/tleProvider";
import { readDeviceCapabilities } from "../../src/device/deviceOrientation";
import { preloadSkySegmenter } from "../../src/vision/skySegmenter";
import { loadRecordingDataset } from "./recordingDataset";
import { ReplayBootTasks } from "./replayBoot";

/**
 * Where `testing/tools/prepare-test-data.mjs` links the selected recording's
 * video.
 *
 * A fixed name rather than a bundled `require()`: the bundler needs a literal
 * path at build time, which would tie the harness to one dataset, so the video
 * is served straight out of `public/` like the sensor JSON instead.
 */
const REPLAY_VIDEO_URL = "/dataset-frames.mov";

/**
 * Resolves the staged recording to a URL a `<video>` element can play.
 *
 * Checked with a HEAD request rather than assumed present, since the file only
 * exists once `npm run prepare-test-data` (or `npm run web`, which runs it) has
 * staged a dataset. Rejects rather than resolving to nothing: the video is the
 * replay's camera, and the sky mask has no frames to read without it.
 */
async function loadVideo(): Promise<string> {
  const response = await fetch(REPLAY_VIDEO_URL, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(
      `No staged recording video at ${REPLAY_VIDEO_URL} (${response.status}). Run \`npm run prepare-test-data\` with TEST_DATA_DIR set.`
    );
  }
  return REPLAY_VIDEO_URL;
}

/**
 * The real work behind each of the replay's boot steps. The catalogue, the
 * sensor probe and the sky model are the app's own, unchanged — they are the
 * parts the harness exists to exercise.
 *
 * `force` is passed through to the catalog when the user asks for a retry by
 * hand, so the throttle that stops us hammering CelesTrak after a failure does
 * not also disable the button offered to fix it.
 */
export function replayBootTasks({ force = false }: { force?: boolean } = {}): ReplayBootTasks {
  return {
    loadCatalog: () => loadActiveCatalog({ force }),
    checkSensors: readDeviceCapabilities,
    loadRecording: () => loadRecordingDataset(),
    loadVideo,
    loadSkyModel: preloadSkySegmenter
  };
}
