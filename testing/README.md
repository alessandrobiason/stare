# testing/ — the replay harness and the tools around it

Nothing in this folder ships. The product is an iOS app that draws satellites
over the iPhone's rear camera; everything here exists so that app can be
developed and checked without a phone in hand.

The centre of it is the **replay**: the app's own view, fed a recorded iPhone
stream instead of a live camera. The recording's video is the background, and
its timestamp drives the GPS, ARKit pose and IMU that aim the projection — so
the markers can be checked against a known ground truth, on a machine with no
sky to point at. It runs in a browser, which is the only reason any of this is
"the web build".

```
testing/
  replay/      the harness app: entry, boot, scene, the recording's own camera
  e2e/         Playwright specs, driven against the replay in a real browser
  tools/       staging a recording, the CelesTrak mock, the jitter meter
  fixtures/    committed test data (a fixed active-catalog TLE snapshot)
```

## What the harness supplies, and what it does not

The point is to exercise the app, not to reimplement it. The harness supplies
only the things a phone would otherwise:

| | App (`src/`) | Harness (`testing/replay/`) |
| --- | --- | --- |
| Entry | `App.tsx` → `src/App.tsx` | `App.web.tsx` → `testing/replay/App.tsx` |
| Boot | `runBootSequence` — fix, camera | `runReplayBoot` — recording, video |
| Picture | `expo-camera` preview | the recording's `<video>` |
| Clock | real time, per frame | video playback position |
| Observer | `expo-location` fix | the recording's GPS stream |
| Attitude | `expo-sensors` motion + magnetometer | ARKit poses from the recording |
| Frame pixels | `cameraFrameGrabber` | `videoFrameGrabber` |
| Sky model | ONNX Runtime React Native | ONNX Runtime Web, same graph |

Everything else — the overlay, the markers, the segmentation pipeline, the
temporal filter, the orientation fusion, the catalogue, the boot screen, the
debug panel — is the app's own code, imported from `src/`. That is what makes a
result here worth anything.

**Dependencies point one way: `testing/` imports `src/`, never the reverse.**
Three files in `src/` break that rule and none of them contain logic:
`App.web.tsx` (at the repo root), `src/vision/skyModel.web.ts` and
`src/components/SkyMaskGrid.web.tsx`. Each is a one-line re-export, and each
exists only because the bundler picks an implementation by platform and can
only pick a sibling of the module being imported.

## Running it

```bash
TEST_DATA_DIR=path/to/your-recording npm run web    # stages a dataset, then serves it
npm run e2e                                         # Playwright, against that
npm run mock-celestrak                              # local CelesTrak stand-in
npm run measure-jitter                              # frame-gap and long-task numbers
```

No recording ships with the repo — see **Test data** in the root README for the
shape one has to be in, and `tools/prepare-test-data.mjs` for the exact file
names. Staged output lands in `public/`, which is gitignored.

## Unit tests

The unit tests for this folder live with all the others, in `__tests__/` at the
repo root: `replayBoot`, `recordingDataset`, `timeSeries`,
`magnetometerCalibration`. Keeping every `jest` suite in one place is worth more
than mirroring this split into the test tree.
