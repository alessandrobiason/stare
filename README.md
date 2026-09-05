# Stare — Watch the Satellites

An iOS app that draws the live satellite catalog over the iPhone's rear camera.
Point the phone at the sky and the ~16,000 objects CelesTrak tracks are placed
on the picture where they actually are — positioned by GPS, aimed by the phone's
motion sensors, and hidden behind whatever buildings and trees are in the way.

The view opens in **normal** mode: the camera picture, the markers, a marker
count and a collapsed category filter. **A marker is the app's own logo**: the
body and tapered trail of `assets/icon.svg`, a couple of dozen pixels across,
the same shape the boot screen turns five of. It carries four channels at once —
colour for purpose (five categories), shape for whether the object holds station
(a geostationary ring, or a body trailing the 12 seconds of ground track it has
just covered), size for range on a log scale from 400 km to 40,000 km, and a
label, spent only on a couple of dozen landmarks.

Every mark is a coloured core inside a contrasting rim, because a photograph of
the sky is either far brighter or far darker than any fill. Which way round that
runs follows the sun: with it down the marks are light in a dark rim, with it up
they are dark in a light one, and the two ladders cross over a two-degree band
of solar altitude inside civil twilight — worked out from the GPS fix and the
clock, so it is right in Oslo in June as well as on the equator (`src/components/palette.ts`,
`src/coordinates/sunAltitude.ts`).

The `DEBUG` button swaps in the workings: the sky mask tinted over the picture,
and a tabbed panel (SENSORS / STATUS / MASK / SKY / VIEW) sampled twice a second.

The app is the whole of `src/`. `testing/` holds a replay harness that runs the
same view in a browser against a recorded iPhone stream — that is how it is
developed and checked without a phone in hand, and the only reason a web build
exists at all.

## How it works

Every displayed frame runs: clock → sensor snapshot → observer fix → visible
satellites → screen positions → markers, composited over the camera picture.

| Stage | Module |
| --- | --- |
| Clock and observer fix, per frame | `src/hooks/useLiveSky.ts` |
| Attitude from motion + magnetometer, Kalman-fused | `src/device/`, `src/fusion/` |
| SGP4 propagation via `satellite.js`, on a rolling sweep | `src/satellite/` |
| Rectilinear pinhole projection onto the camera's axes | `src/camera/projection.ts` |
| Occlusion: SegFormer sky mask, horizon-capped, IMU-stabilised | `src/vision/` |
| Drawn at display rate, every marker in one canvas | `src/components/markerScene.ts`, `SatelliteMarkers` |
| Day or night palette, from the sun's own altitude | `src/components/palette.ts`, `src/coordinates/sunAltitude.ts` |

**Boot is all-or-nothing** (`src/boot/`). Before the view opens it must have the
catalog, the sensors, a GPS fix, magnetic declination, camera permission and the
segmentation model. Any of them failing fails boot — there is no degraded mode
that looks like it is working, and markers are drawn only against a mask that is
less than 8 seconds old. While it runs, the screen is the logo and
nothing else — five satellites turning around the middle of it
(`src/components/bootSky.ts`, drawn still into `assets/logo-extended.svg`).
Their turning is the only progress report, because the steps behind it are not
ones anyone can act on; a failure stops the sky and says what went wrong.

**Where you are pointing** (`src/fusion/`). The device's Euler angles and the
magnetic bearing to north are fused in a per-axis Kalman filter whose process
noise opens up with measured turn rate, so it smooths while still and tracks
while moving. Heading is the channel that pays: its magnetic term is near-white
at frame rate, and the filter cuts that shimmer about fivefold for a tenth of a
degree of lag. Pitch and roll carry a slow correlated error no smoothing
removes, so they track closely instead. Tuning lives in `ORIENTATION_FILTER` in
`src/constants.ts`.

**What is up there** (`src/satellite/`, `src/data/`). The active catalog is
downloaded from CelesTrak and cached for two hours (their rate limit, persisted
across launches). TLEs are parsed once and reused. A full SGP4 pass over 16k
objects costs ~100 ms, which no cadence can afford on the frame thread, so the
tracker sweeps a slice of the catalog per frame — a full pass every 2 seconds,
capped at 5% of the catalog per frame — and carries each satellite forward on
its velocity in between. Carry-forward error grows with the square of age:
0.0004° at one second, well inside a fiftieth of a pixel.

**Where it lands on the frame** (`src/camera/`). ECI → ECEF → ENU, then a
rectilinear pinhole projection onto the camera's own axes. `DEVICE_CAMERA` in
`src/constants.ts` is a *nominal* iPhone wide lens — no API reports the real one
— and is the first figure to correct if markers sit at the right bearing but the
wrong distance from centre. Satellites below 5° elevation are dropped, not as an
occlusion test but because unmodelled atmospheric refraction there (0.58° at the
horizon) is wider than the marker itself.

**What is in the way** (`src/vision/`). A frame goes to the MIT-licensed
SkyWater-Seg SegFormer about once a second, at its own aspect ratio within a
fixed pixel budget. The model runs under ONNX Runtime — React Native on the
phone, WASM in the browser — behind one shared module, so it is the same
algorithm either side. Two corrections sit on top of its output:

- **The horizon cap** (`horizonPrior.ts`). Sky reflected in water, wet asphalt
  or glass is *a picture of the sky*, and no amount of looking harder at pixels
  settles it. But gravity-referenced pitch already knows where the horizon
  crosses the frame, so cells below it are suppressed as a matter of geometry.
- **Temporal stabilisation** (`skyMaskTemporalFilter.ts`). Consecutive masks are
  blended by re-aiming the previous one through the attitude change since it was
  taken, with the prior's weight falling to zero as rotation rate rises.
- **Per-marker hysteresis** (`markerVisibility.ts`). The mask is a fresh guess
  once a second, so near an edge its confidence crosses the threshold from pass
  to pass and every marker over that cell blinks with it. Each marker instead
  low-passes the confidence along its own path and switches only on clearing the
  far side of a band — two agreeing passes to move it, a mask alternating clear
  and blocked moves it never — and crossfades when it does.

The first run downloads a 95 MB model and caches it;
`EXPO_PUBLIC_SKYWATER_MODEL_URL` and `EXPO_PUBLIC_ONNX_WASM_URL` point at
mirrors.

**What gets drawn** (`src/components/`, `src/hooks/`). The overlay is the one
tree in the app under real time pressure, and it is not a tree any more. A busy
frame is some seventy markers, each of which was a mark, a rim, a halo, two
bars of trail and a box to hold them — around five hundred views whose
position, size and opacity all changed sixty times a second. No amount of
memoizing makes that cheap: every one of them still has to be reconciled,
crossed into native, laid out and composited, and a view that fades a group of
children is composited into an off-screen buffer of its own to do it. On an
iPhone 12 mini the overlay held 60 Hz over an empty sky and under 10 over a
full one.

So the marks are drawn rather than built. `markerScene.ts` turns a frame of
markers into circles and tapered polygons in layout pixels — the one place that decides
what a satellite looks like, and the one the tests read — and a backend draws
them into a single node: a Skia picture on the phone, a 2D canvas in the replay
harness, which is a browser and already has one. The cost now grows with the
number of circles rather than with the number of views. The landmark names stay
views, because text needs a typeface handed to a canvas and there are never
more than a couple of dozen names.

Nothing that changes at sensor rate is React state. Attitude readings arrive
twenty to forty times a second and go straight into the filter on a
subscription (`useSmoothedOrientation`); drawn frames reach the overlay the same
way (`MarkerSource`), so the component that draws is the only thing that renders
at display rate — the camera picture, the legend and the debug panel above it do
not. The epoch, the frame rate and the debug figures live in refs, and the
marker count is published four times a second rather than per frame.

### Layout

```
App.tsx / App.web.tsx   app entry / harness entry (bundler picks by platform)

src/          the product, and nothing else
  constants.ts  tuning knobs, each with the measurement behind it
  math/ camera/ coordinates/        quaternions, ENU -> frame, ECI -> ECEF
  satellite/ data/                  TLE parsing, SGP4 sweep, CelesTrak cache
  device/ fusion/                   sensors, GPS, declination, attitude filter
  vision/                           sky mask, segmentation loop, filters
  boot/ debug/ hooks/ components/   startup gate, debug panel, glue, scene

testing/      nothing here ships - see testing/README.md
  replay/ e2e/ tools/ fixtures/     harness, Playwright, staging + mocks, TLEs

__tests__/    jest suites for both trees
tools/        iOS release helpers (distribution cert, icon and update checks)
```

Dependencies point one way: `testing/` imports `src/`, never the reverse. The
three exceptions are one-line re-exports forced by the bundler's platform
resolution (`App.web.tsx`, `src/vision/skyModel.web.ts`,
`src/components/SkyMaskGrid.web.tsx`).

## Developing

Development happens in a **Docker container under WSL2**. `docker/Dockerfile`
is the only image definition: Node, the build deps some native modules need at
install time, and a system Chromium for the e2e suite. VS Code picks it up as a
devcontainer (`.devcontainer/devcontainer.json`), which adds mounts and editor
wiring on top of it -- `--network=host`, port 8081 forwarded -- and sets no
environment of its own.

The image copies no source in; both ways of running it mount `/app` instead:

```bash
docker build -f docker/Dockerfile -t stare:dev .
docker run --rm -it -p 8081:8081 -v "$PWD":/app -w /app stare:dev
```

Two named volumes carry state across a rebuild. `stare-node-modules` holds
`node_modules`, and `stare-home` holds the container's home directory, which is
where everything a rebuild would otherwise discard lives:
the Playwright browser cache, the npm cache, the VS Code server, `~/.gitconfig`
and `~/.ssh/known_hosts`. Deleting either volume is the way to force a clean
one; a plain rebuild keeps both.

The base is Debian 12 (bookworm). Bullseye's LTS ended in August 2026, and its
packages move to `archive.debian.org` after that, which takes `apt-get install
chromium` with them -- `docker build --build-arg BASE_IMAGE=...` pins a
different base without editing the file.

Outside a container, `npm install --legacy-peer-deps` — the onnxruntime and
react 19 peer ranges need it.

| Command | What it does |
| --- | --- |
| `npm run check` | typecheck + lint + jest |
| `npm run web` | Stages the test dataset, then serves the replay harness on :8081 |
| `npm run start` | Metro for a dev-client build on a phone that can reach this machine |
| `npm run tunnel` | The same, over an ngrok tunnel — needs an authtoken, see below |
| `npm run e2e` | Playwright suite against the replay harness |
| `npm run mock-celestrak` | Local CelesTrak stand-in on :8787 |
| `npm run prebuild` | Regenerates `ios/` from `app.json` — a config check, not a build |

There are three ways to see this app run, and the container serves the first of
them:

- **The replay harness, in a browser on this machine.** `npm run web`, then
  open `localhost:8081`. Everything in `src/` runs — overlay, projection,
  fusion, segmentation, boot — against a recorded iPhone stream instead of a
  live camera. Nothing leaves the machine, so there is no address to forward,
  no firewall rule and no LAN to be on.
- **A TestFlight build, on a real iPhone.** An iOS binary needs macOS and
  Xcode, so it is built by a GitHub Actions runner and installed through the
  TestFlight app — see [`docs/ios-builds.md`](docs/ios-builds.md).
- **A dev-client build on that iPhone, reading the bundle from here.**
  `npm run start`, or `npm run tunnel` when the phone cannot reach this machine
  directly. The binary is built the same way and carries the same native
  modules; only the JavaScript comes from this checkout, which is what makes it
  worth the setup — a change to the overlay is a reload rather than a release.

**Expo Go cannot run this app**, whichever of those is running: its binary
carries none of the native modules the view is built on (camera, location,
motion sensors, ONNX Runtime).

Two things about the dev-client path are not obvious, and both report themselves
as something other than what they are:

- **React Native DevTools is an Electron app, and Electron refuses to run as
  root without `--no-sandbox`.** Its install probe runs the binary with
  `--version`, which is fatal under root, and `expo start` reports it as "An
  unknown error occurred while installing React Native DevTools" with a `FATAL`
  from `electron_main_delegate.cc` underneath. `ELECTRON_DISABLE_SANDBOX=1` is
  the answer; the image sets it, and the `start` and `tunnel` scripts set it
  again so the commands also work in a shell that did not inherit it.
- **`--tunnel` runs on Expo's ngrok account, not on one of yours.** `@expo/cli`
  carries a token and the `exp.direct` domain and writes them to
  `~/.expo/ngrok.yml`, so the address is
  `<randomness>-<user>-<port>.exp.direct` and there is nothing to sign up for.
  Which means `failed to start tunnel` followed by `remote gone away` is not a
  credential and, despite the message the CLI prints with it, usually not an
  ngrok outage either: that is the 2.3.41 agent saying the server closed its
  session. The two things that do it are another agent still holding the
  session from an `expo start` that never exited — free ngrok is one session at
  a time — and a subdomain collision on that shared account, which the CLI
  retries three times with fresh randomness before it gives up. So
  `pgrep -af ngrok` before retrying, and `EXPO_TUNNEL_SUBDOMAIN=<unique>` if a
  collision keeps happening. If ngrok is genuinely unreachable, forward 8081 by
  other means (VS Code's Ports panel will) and point the phone at that address
  with `EXPO_PACKAGER_PROXY_URL=https://<host> npm run start` — `UrlCreator`
  reads it and rewrites every URL handed to the device.

## Testing

There is no sky to point a container at, so the app is exercised through the
**replay harness** in `testing/replay/`: the app's own view, fed a recorded
iPhone stream instead of a live camera. The recording's video becomes the
background and its playback position drives the clock, GPS, ARKit pose and IMU
together, so the projection can be checked against a known ground truth. It runs
in a browser — that is what the web build is for, and the whole of it.

The harness substitutes only what a phone would otherwise supply (picture,
clock, observer, attitude, frame pixels, the ONNX runtime). The overlay,
markers, segmentation pipeline, filters, fusion, catalog, boot and debug panel
are the app's own code imported from `src/`, which is what makes a result here
worth anything. [`testing/README.md`](testing/README.md) has the full table.

### Test data

No recording ships with the repo — stage your own. Point `TEST_DATA_DIR` at a
folder holding a video and seven sensor CSVs:

```
<your-recording>/
  frames.mov  frames.csv  arkit.csv  locations.csv
  accelerometer.csv  gyro.csv  magnetometer.csv  barometer.csv
```

`arkit.csv` rows are `[time, x, y, z, qw, qx, qy, qz]` in a gravity-aligned
frame with +y up (`testing/replay/recordingDataset.ts`); `locations.csv` rows
are `[time, latitudeDeg, longitudeDeg, heightM]`; the rest are `[time, x, y, z]`.
Any capture in this shape works, as long as you have the rights to it.

```bash
TEST_DATA_DIR=path/to/your-recording npm run web                 # stages, then starts
TEST_DATA_DIR=path/to/your-recording npm run prepare-test-data   # restage only
```

Staging writes `public/dataset-iphone-sensors.json` and links
`public/dataset-frames.mov` — both gitignored, so nothing you stage gets
committed. `EXPO_PUBLIC_DATASET_LABEL` changes the name shown in the view.

Recordings keep time as elapsed seconds rather than an absolute date, so
propagation uses a replay epoch chosen when the page opens. Two tests
(`recordingDataset`, `orientationFilter`) run against a staged recording when
one is present and skip otherwise, so a fresh checkout still passes.

### Offline catalog

`testing/fixtures/active.tle` is a committed snapshot (16,063 TLEs, downloaded
2026-08-23) and `npm run mock-celestrak` serves it over a compatible `gp.php`
endpoint on :8787 without rate limits — for testing, not as a production
provider.

```bash
EXPO_PUBLIC_TLE_URL='http://localhost:8787/NORAD/elements/gp.php?GROUP=active&FORMAT=tle' npm run web
```

`npm run measure-jitter` reports frame-gap and long-task numbers against a
running harness.

## Known limits

- The full CelesTrak active catalog is downloaded, then filtered on-device.
- Propagation is synchronous on the main thread: ~60 ms per full catalog tick
  against a 100 ms budget.
- **The phone's frame source has not been run on hardware.** `expo-camera` has
  no frame-processor API, so each pass takes a still, resizes it natively and
  decodes the JPEG. At one pass a second that should be affordable, but the cost
  and any preview hitch are unmeasured.
- The device lens is assumed, not calibrated.
