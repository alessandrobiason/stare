// Buffer is imported rather than taken from the global scope so the file
// lints under the shared browser-leaning eslint config.
import { Buffer } from "node:buffer";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Fails if a generated app icon carries an alpha channel.
 *
 * App Store Connect rejects an upload whose 1024x1024 icon is transparent or has
 * an alpha channel at all, even a fully opaque one (ITMS-90717). That rejection
 * lands at the very end of a release, after the archive, the export and the
 * upload have all been paid for on a 10x macOS runner. This reads the same PNGs
 * from the Linux prebuild gate, where the same failure costs about a minute.
 *
 * Run it after `expo prebuild`, which is what turns the `icon` in app.json into
 * the asset catalog read here.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * IHDR is always the first chunk and always the same length, so the colour type
 * sits at a fixed offset: 8 magic + 4 length + 4 tag + 4 width + 4 height + 1
 * bit depth. Types 4 (grey+alpha) and 6 (RGBA) carry alpha; 0, 2 and 3 do not.
 */
const COLOUR_TYPE_OFFSET = 25;
const ALPHA_COLOUR_TYPES = new Map([
  [4, "greyscale + alpha"],
  [6, "RGBA"],
]);

/** `ios/<AppName>/Images.xcassets/...`, where the app name comes from app.json. */
function findIconSets(iosDir) {
  if (!existsSync(iosDir)) return [];
  return readdirSync(iosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(iosDir, entry.name, "Images.xcassets", "AppIcon.appiconset"))
    .filter(existsSync);
}

const iconSets = findIconSets("ios");
if (iconSets.length === 0) {
  console.error("::error::No AppIcon.appiconset under ios/. Run `expo prebuild` first.");
  process.exit(1);
}

const offenders = [];
let checked = 0;

for (const dir of iconSets) {
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".png"))) {
    const path = join(dir, name);
    const data = readFileSync(path);
    if (!data.subarray(0, 8).equals(PNG_MAGIC)) {
      offenders.push(`${path} is not a PNG`);
      continue;
    }
    checked += 1;
    const alpha = ALPHA_COLOUR_TYPES.get(data[COLOUR_TYPE_OFFSET]);
    if (alpha) offenders.push(`${path} has an alpha channel (${alpha})`);
  }
}

if (offenders.length > 0) {
  for (const line of offenders) console.error(`::error::${line}`);
  console.error(
    "\nApp Store Connect rejects icons with an alpha channel (ITMS-90717).\n" +
      "Replace assets/icon.png with an opaque RGB image — flatten it against a\n" +
      "background rather than trusting a fully-opaque alpha channel to pass.\n" +
      "tools/make-placeholder-icon.py writes one in the right format.\n" +
      "Note that Expo's built-in fallback icon, used when app.json names none,\n" +
      "is RGBA and will fail here.",
  );
  process.exit(1);
}

console.log(`${checked} app icon file(s) checked, none carry an alpha channel.`);
