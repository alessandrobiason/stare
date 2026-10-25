import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFromSource } from "../screenshots/tsModule.mjs";

// A missing capture must fail the gate even if the renderer can draw a fallback.
const { SHOT_SCENES } = await loadFromSource("testing/screenshots/scenes.ts");
const locales = readdirSync("src/i18n/strings")
  .filter((name) => name.endsWith(".ts")).map((name) => name.slice(0, -3));
const sizes = [[1206, 2622], [1179, 2556]];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function png(path, width, height) {
  const data = readFileSync(path);
  if (data.length < 33 || !data.subarray(0, 8).equals(signature) ||
      data.toString("ascii", 12, 16) !== "IHDR" ||
      data.readUInt32BE(16) !== width || data.readUInt32BE(20) !== height) {
    throw new Error(`${path}: expected a ${width} × ${height} PNG`);
  }
}
let count = 0;
for (const locale of locales) {
  for (const scene of SHOT_SCENES) {
    png(join("tools/screenshots/.capture", locale, `${scene.id}.png`), 1090, Math.round(932 * 1090 / 430));
    for (const [width, height] of sizes) {
      const directory = `docs/app-store/${width}x${height}`;
      png(join(directory, locale, `${scene.id}.png`), width, height);
      count += 1;
    }
  }
}
console.log(`Verified ${count} App Store frames from fresh captures in ${locales.length} languages.`);
