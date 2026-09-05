/**
 * The web build is not the product — it is the replay harness, which runs the
 * app's view over a recorded iPhone stream so the projection can be developed
 * and tested without a phone in hand. See `testing/README.md`.
 *
 * This file exists because the bundler picks the entry by platform: `App.tsx`
 * on the phone, this one on the web. It is the only line in the shipping app's
 * tree that points into `testing/`.
 */
export { default } from "./testing/replay/App";
