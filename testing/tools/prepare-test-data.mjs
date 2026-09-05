import { copyFile, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Stages one recorded-phone test dataset for the web replay to load.
 *
 * `TEST_DATA_DIR` must point at a folder holding a video and the sensor CSVs
 * directly — see `SENSOR_FILES` below for the expected names. Where that
 * folder came from is not this tool's concern: any recording in that shape
 * works. The app itself only ever reads the fixed `public/dataset-*` names
 * this writes, so it never has to know which recording produced them.
 */
const datasetDir = process.env.TEST_DATA_DIR;
if (!datasetDir) {
  console.error(
    "Set TEST_DATA_DIR to a folder containing frames.mov and the sensor CSVs " +
      "(see testing/tools/prepare-test-data.mjs for the exact names)."
  );
  process.exit(1);
}

const source = resolve(datasetDir);

const SENSOR_FILES = {
  frames: "frames.csv",
  arkit: "arkit.csv",
  locations: "platform-locations.csv",
  accelerometer: "accelerometer.csv",
  gyro: "gyro.csv",
  magnetometer: "magnetometer.csv",
  barometer: "barometer.csv"
};

const sensorTarget = resolve("public/dataset-iphone-sensors.json");
const videoSource = resolve(source, "frames.mov");
const videoTarget = resolve("public/dataset-frames.mov");

const parseCsv = (contents) => contents.trim().split("\n").map((line) => line.split(",").map(Number));

const data = Object.fromEntries(
  await Promise.all(
    Object.entries(SENSOR_FILES).map(async ([key, file]) => [
      key,
      parseCsv(await readFile(resolve(source, file), "utf8"))
    ])
  )
);

await mkdir(dirname(sensorTarget), { recursive: true });
await writeFile(sensorTarget, JSON.stringify(data));
console.log(`Wrote ${sensorTarget} from ${source}`);

await rm(videoTarget, { force: true });
try {
  await symlink(videoSource, videoTarget);
} catch (error) {
  // Cross-device checkouts (EXDEV) and unprivileged Windows accounts (EPERM)
  // can't symlink; falling back to a copy keeps this working there too.
  if (error.code !== "EXDEV" && error.code !== "EPERM") throw error;
  await copyFile(videoSource, videoTarget);
}
console.log(`Linked ${videoTarget} -> ${videoSource}`);
