/*
 * The photographs behind the marks in the App Store frames: where each one came
 * from, and how to get it again.
 *
 *     node tools/screenshots/backgrounds.mjs     # fetch any that are missing
 *
 * `backgrounds/` is gitignored — six full-resolution photographs are twenty
 * megabytes, and they are not this repository's to redistribute — so what is
 * committed is this list instead. Anything that needs the files fetches them:
 * `capture.mjs` before a run, and the workflow before that.
 *
 * All six are Pexels photographs. The Pexels licence allows commercial use,
 * including in App Store listings, and does not require attribution; the page
 * for each is recorded anyway, because "where did this come from" is a question
 * that gets asked about a store listing years later, and the answer should not
 * have to be reconstructed from a chat log.
 *
 * Replacing one is a matter of putting a different file at
 * `backgrounds/<scene id>.jpg` and updating the entry here to say where it came
 * from. Portrait, and at least 2100 x 2800, which is the camera box at the
 * scale the frames are rendered at.
 */

import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where the files live once fetched. Gitignored; see the note above. */
export const BACKGROUNDS_DIR = join(here, "backgrounds");

export const BACKGROUNDS = {
  "01-sky": {
    what: "A hut on the Alpe di Siusi under the Milky Way, the Sassolungo behind it.",
    page: "https://www.pexels.com/photo/old-building-on-lawn-behind-rocks-under-starry-sky-4215109/",
    file: "https://images.pexels.com/photos/4215109/pexels-photo-4215109.jpeg?cs=srgb&fm=jpg"
  },
  "02-tap": {
    // The Seceda ridge under the Milky Way (pexels 4293644) was here and had to
    // go for the same reason the old 05-inview did: the segmentation model
    // reads that kind of dark long-exposure astrophotograph as terrain, so the
    // mask hid everything and the frame came back reading one mark — including
    // the station the frame is about.
    what: "A road under the Milky Way, mountains either side.",
    page: "https://www.pexels.com/photo/road-under-a-sky-full-of-stars-and-by-the-mountains-in-the-evening-24702426/",
    file: "https://images.pexels.com/photos/24702426/pexels-photo-24702426.jpeg?cs=srgb&fm=jpg"
  },
  "03-occlusion": {
    // The one the frame lives or dies on, and the one with a real constraint on
    // it: the picture needs *both* something tall to hide marks behind and
    // enough open sky to have marks in.
    //
    // A tower in Nantes (pexels 4050205) was tried first and cannot work. Its
    // own proportions are 3303 x 4838, and the camera box is 3:4, so covering
    // it crops about nine per cent of the height and keeps all of the width:
    // the crop is nearly the whole photograph, and the building fills nearly
    // the whole photograph. There is no sky left to have marks in, and the
    // capture came back reading "0 visible satellites" — the mask working
    // exactly as it should, on a picture that gave it nothing to do. Cropping
    // it off-centre does not help, because the four per cent either side of
    // centre is all there is to move.
    what: "Straight up a gap between two buildings: a channel of starry sky with walls either side.",
    page: "https://www.pexels.com/photo/upward-view-of-colorful-urban-skyline-at-night-37737798/",
    file: "https://images.pexels.com/photos/37737798/pexels-photo-37737798.jpeg?cs=srgb&fm=jpg"
  },
  "04-legend": {
    what: "Roman rooftops and domes under a clear midday sky.",
    page: "https://www.pexels.com/photo/stunning-view-of-rome-s-historic-skyline-36457893/",
    file: "https://images.pexels.com/photos/36457893/pexels-photo-36457893.jpeg?cs=srgb&fm=jpg"
  },
  "05-inview": {
    // A city rather than a sixth mountain, and the one photograph in the set
    // chosen by what the app made of it rather than by eye.
    //
    // The Milky Way over the Dolomites (pexels 2670898) was here first and had
    // to go: the segmentation model reads that picture's sky as terrain, so the
    // mask hid almost every mark and the frame came back with two. Same place,
    // same instant, same bearing, a different photograph: 111. Worth knowing
    // before dropping a replacement in — a dark long-exposure astrophotograph
    // is not what a phone camera produces at night, and this is the frame where
    // that difference showed up.
    what: "A city skyline under a pink and violet dusk.",
    page: "https://www.pexels.com/photo/vibrant-cityscape-at-twilight-with-colorful-sky-29736776/",
    file: "https://images.pexels.com/photos/29736776/pexels-photo-29736776.jpeg?cs=srgb&fm=jpg"
  },
  "06-pass": {
    // Tre Cime di Lavaredo at the blue hour (pexels 13405515) was here and was
    // dropped for grain: a high-ISO night exposure compressed at about half the
    // bits per pixel of the rest of the set, which reads as mottling across a
    // smooth twilight gradient. Refetching it at a smaller size changed
    // nothing, because the noise is in the photograph and not in the scaling.
    // This one is a clean gradient with a low silhouette and, as it happens, a
    // few contrails — which suit a frame about looking up.
    what: "A twilight gradient over a low mountain silhouette.",
    page: "https://www.pexels.com/photo/serene-sunset-sky-with-mountain-silhouette-34892669/",
    file: "https://images.pexels.com/photos/34892669/pexels-photo-34892669.jpeg?cs=srgb&fm=jpg"
  }
};

/** Where a scene's photograph is on disk, fetched or not. */
export const backgroundPath = (id) => join(BACKGROUNDS_DIR, `${id}.jpg`);

/**
 * Fetches whatever is missing, and leaves alone whatever is there — so a
 * photograph swapped in by hand survives a run, and a checkout with none at all
 * can still produce the frames.
 */
export async function ensureBackgrounds(ids = Object.keys(BACKGROUNDS)) {
  mkdirSync(BACKGROUNDS_DIR, { recursive: true });

  for (const id of ids) {
    const source = BACKGROUNDS[id];
    if (!source) throw new Error(`no background recorded for ${id}`);

    const target = backgroundPath(id);
    if (existsSync(target)) continue;

    process.stdout.write(`  fetching ${id}.jpg … `);
    const response = await fetch(source.file);
    if (!response.ok) {
      throw new Error(`${source.file} answered ${response.status}; fetch it by hand from ${source.page}`);
    }
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    console.log("done");
  }
}

// Fetching is also the whole of what this does when run directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await ensureBackgrounds();
  console.log(`backgrounds are in ${BACKGROUNDS_DIR}`);
}
