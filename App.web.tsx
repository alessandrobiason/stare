/**
 * The web build is not the product. It is two harnesses, and this picks between
 * them:
 *
 * - **The replay harness** (the default), which runs the app's view over a
 *   recorded iPhone stream so the projection can be developed and tested
 *   without a phone in hand. See `testing/README.md`.
 * - **The screenshot harness**, reached with `?shot=<scene id>`, which runs the
 *   same view over a still photograph at a fixed place and instant. It is what
 *   the App Store frames are photographed from — see
 *   `docs/app-store-screenshots.md`.
 *
 * One bundle rather than a build flag for the second one, so the capture can
 * walk all six scenes against one already-running dev server.
 *
 * This file exists because the bundler picks the entry by platform: `App.tsx`
 * on the phone, this one on the web. It is the only line in the shipping app's
 * tree that points into `testing/`.
 */
import React from "react";
import ReplayApp from "./testing/replay/App";
import { shotSceneById } from "./testing/screenshots/scenes";
import ShotApp from "./testing/screenshots/ShotApp";

export default function App() {
  const requested =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("shot");
  const scene = shotSceneById(requested);

  // An unknown id is a typo in a capture run, and falling through to the replay
  // would photograph the wrong harness rather than saying so.
  if (requested && !scene) {
    throw new Error(`No screenshot scene called "${requested}" — see testing/screenshots/scenes.ts`);
  }

  return scene ? <ShotApp scene={scene} /> : <ReplayApp />;
}
