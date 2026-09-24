# App Store screenshots

Six frames for the iPhone listing, one set per storefront language, and the
pipeline that makes them: `docs/app-store/`, from `tools/screenshots/`.

    npm run screenshots                            # every language
    npm run screenshots -- --locale it             # just that one

That is two steps, and they can be run apart:

    node tools/screenshots/capture.mjs   # photograph the running app
    node tools/screenshots/render.mjs    # lay the captions around it

**Every language in one run.** English writes `docs/app-store/`, each other
language a directory beside it. One invocation covers them all because the
expensive parts — Metro's first bundle, the segmentation model, the browser —
are paid once however many sets come out, and because running the tool once per
language is how the sets drifted apart before: only English had been captured
from the app, and Italian was still the old hand-drawn mirror, with its own copy
of the marker colours.

Output is **1290 × 2796**, which App Store Connect takes for the 6.9 and
6.7-inch classes and scales down for every size below them. Nothing else has to
be uploaded unless the listing is later given iPad screenshots, which this app
cannot have — `supportsTablet` is false.

**The words inside the phone are the app's own.** The filter's categories, the
count in the header, the card's five labels, the letters on the compass and the
tab bar are read out of `src/i18n/strings/<locale>.ts` while the frame is
drawn, not copied into the generator — so a panel the app rewrites cannot go on
being advertised in its old wording, and a new language gets a full set of
frames the day its strings land. The captions around the frame and the prose
inside a scene are in `scenes.mjs`, one entry per language. See
[Editing them](#editing-them).

The rest of the listing — the names, the keywords, the description, the age
rating, the trader status, the privacy answers and the note to App Review — is
[docs/app-store-listing.md](app-store-listing.md).

**The phone screen in these frames is the app, photographed.** Not a drawing of
it: the web build is booted against a real photograph at a fixed place and
instant, driven through real taps, and screenshotted. The marks are where the
app's own SGP4 puts them, the counts are what it counted, the briefing is the
one it would show, and the marks behind a building are missing because the app's
own segmentation model looked at that photograph and cut them out. A change to a
panel changes these frames, which is the whole point — see
[How a frame is built](#how-a-frame-is-built) and
[Keeping them current](#keeping-them-current).

It was not always so. Until this pipeline existed the screen was drawn by a
second implementation of the app's panels in HTML and CSS, which had to be
edited by hand whenever the app changed and silently advertised the old app
whenever nobody did. That mirror is still in the tree as a fallback for a run
with no dev server, and it is not equal in standing to a capture.

**The sky behind the marks is a real photograph, and it is somebody else's.**
Six stock photographs, listed with their sources in
`tools/screenshots/backgrounds.mjs` and fetched rather than committed. They are
not captures from the phone the app runs on — see
[What is still needed](#what-is-still-needed).

## The six, and why they are these six

The order is the one the store shows them in, and the first two carry the
listing: most people see one and a half frames.

| # | File | What it shows | Caption |
| --- | --- | --- | --- |
| 1 | `01-sky.png` | The plain view: the Alpe di Siusi under the Milky Way, about a hundred marks across it, the app's name over what it counts, the freeze and filter buttons, the compass strip along the foot of the frame and the station's next pass on the card. | **Point it at the sky** — The satellites passing over you, drawn on the picture where they actually are. |
| 2 | `02-tap.png` | The station picked out: its card open over the Seceda ridge, with the photograph, who flies it and what it is. | **Tap a light, learn what it is** — What it is, who flies it, how far away — and the figures keep moving while you read. |
| 3 | `03-occlusion.png` | Straight up a gap between two buildings: the marks fill the channel of sky and stop dead at the walls, because the mask read that photograph. | **It knows what is in the way** — Anything behind a building or a tree is left out, rather than drawn over it. |
| 4 | `04-legend.png` | The same app over Rome in daylight, filter open: the six categories with their colours and the switches under them, and the same marks read by their dark edges against a bright sky. | **Colour is what it is for** — The same soft colours by day and by night. Size is how far away; a ring holds station over the equator. |
| 5 | `05-inview.png` | A city at dusk with the count opened into the breakdown behind it: how many are Starlink, how many Eutelsat, how many of them are lit. | **What is overhead, right now** — The live public catalogue — some 16,000 tracked objects — sorted into what the sky in front of you actually holds. |
| 6 | `06-pass.png` | A twilight sky over a low ridge, arcs drawn across it with an arrowhead on every minute, and the panel along the bottom naming what is coming up and counting it down. | **Know when to look up** — Each landmark carries the arc it will cross, an arrowhead for every minute, and the time it comes up. |

Frames 3 and 4 are the two that are hard to copy and are the reason to keep
them: hiding satellites behind buildings is the thing no other sky app does,
and a legible daylit sky is the thing every other one gets wrong. Frame 5
answers the question the count provokes, and is the only place the size of the
catalogue is claimed. Frame 6 is the one that answers "so when do I go
outside" — the other five all show a sky someone is already standing under,
and this is the only one that is about a sky that has not arrived yet.

**Frame 6 is last and does not have to be.** The order here is the listing's
rather than the app's, and a benefit frame this plain would carry earlier — third,
say, after the tap — at the cost of renumbering the files. Left where it is
because moving it is a marketing decision rather than a technical one.

The captions describe what is in the frame under them rather than the app in
general, and none of them promises anything the app does not do. Two words are
worth keeping as they are: "drawn where they actually are" (the claim the whole
app rests on) and "left out, rather than drawn over it", which is the intro
screen's own wording (`src/i18n/strings/en.ts`).

## How a frame is built

Two passes, and they are two different programs:

1. **The phone screen** — `tools/screenshots/capture.mjs`. It starts the mock
   CelesTrak server and Metro, opens the web build at `/?shot=<scene id>` in
   Chromium sized to a 6.9-inch iPhone, waits for the app to boot, presses
   whatever that scene is about, waits for the picture to stop changing, and
   saves the screen to `.capture/<locale>/<id>.png`.
2. **The store frame** around it — `tools/screenshots/render.mjs`. The caption,
   the night the boot screen is drawn on, the phone, and that image laid into
   it. It uses the capture when there is one and falls back to the drawn mirror
   when there is not.

The browser is set to a device scale factor of 1090/430, not the phone's 3, so
the screen is rasterised once at exactly the size the store frame lays it in
rather than being resampled on the way.

### The phone around the screen

A screenshot with rounded corners does not read as a phone. What the second pass
draws around it: a titanium rail, a black bezel, a 55-point display radius, the
Dynamic Island, the home indicator, and a status bar whose clock is the scene's
own local time rather than Apple's 9:41 — a night sky under a morning clock is
the kind of detail that makes a listing look assembled.

**All six are square-on.** Turning the phone a few degrees in 3-D, the way a lot
of App Store pages do, was tried and dropped: it looked cheap at this size, and
it softened the panels, because a rotated and scaled element is one the browser
resamples rather than drawing pixel for pixel. Square-on, the capture lands 1:1
— `assertNativeSize` in `render.mjs` fails the run if it ever stops doing so,
since a resampled screen still renders and simply looks worse.

Two things about the app in these frames come from this pipeline having been
built. Names are kept out of the bands the app's own panels cover — a satellite
crossing the top of the screen used to print its name across the title, which is
unreadable on a phone as much as in a listing (`labelKeepOut` in `SkyOverlay`).
And the capture runs in `Europe/Rome`, because the app formats pass times in the
device's zone: in UTC, as CI is, a card read "3:01 AM" under a status bar
reading 05:01.

The chrome is drawn over the capture rather than inside it, because it is the
operating system's and a browser has none of it. For it to land in empty space
rather than over the app's own controls, the capture has to be laid out as the
phone lays it out — so the harness forces the 6.9-inch safe area (59 points at
the top, 34 at the bottom) instead of the zeroes a browser window reports. See
`IPHONE_INSETS` in `testing/screenshots/ShotApp.tsx`.

### What the app is given

The harness lives in `testing/screenshots/` and is the third scene in the
codebase, beside the phone's (`DeviceScene`) and the replay's (`ReplayScene`).
Like them it owns nothing on screen: everything visible is `SkyOverlay`. What
it supplies is the four things a scene is:

- **A place and an instant** (`OrbitEpoch`), held still. Nothing advances, which
  is what makes two runs produce the same pixels.
- **A bearing**, published as a fixed attitude reading. A scene that names a
  target resolves it through the app's own tracker first, so the object lands in
  the middle of the frame.
- **A photograph** where the camera preview goes, laid into the camera's own 3:4
  box with `object-fit: cover` exactly as the phone fills it.
- **The same pixels, to the segmenter.** `stillFrameGrabber` reproduces that
  cover crop when it reads the image, so the mask lines up with what is on
  screen. Read the whole file instead and every mask boundary lands in the wrong
  place.

Everything else — the projection, the marker sizes, the tails, the palette, the
counts, the passes, the wording — is the app, unmodified.

### Which way to point, which is measured rather than reasoned

How full a frame looks depends on where it is pointed, and the answer is not
something to work out on paper. Three things bear on it at once:

- **The sky is not evenly populated.** From these latitudes the geostationary
  belt is an arc across the south at about 30 degrees up. A frame pointed into
  it is worth three times one pointed north-west.
- **Most of the camera frame is off the screen.** The picture covers a
  430-point-wide screen with a 699-point-wide frame, so a third of the width is
  lost off the sides, and the count is measured against what is left
  (`viewport` in `useAnimatedMarkers`).
- **The mask takes out whatever is behind the terrain** in that particular
  photograph, which is different for every scene.

Two attempts to model that were both wrong by an order of magnitude — the first
set of bearings came back drawing between one and forty marks. So the app is
asked instead:

    node tools/screenshots/probe-aims.mjs 01-sky --az 90,120,150,180 --el 12,20,30

It turns the running view through a grid of bearings and prints the count the
header publishes at each. The figures on each scene in `scenes.ts` came from it,
and it is how to move one. It needs a dev server up, which `capture.mjs` leaves
behind if you interrupt it.

### The scenes, and why their times are what they are

`testing/screenshots/scenes.ts` holds them. The times were found by search, not
picked, and three things constrain each one: the TLE fixture's own epoch
(2026-08-23 — SGP4 drifts badly away from it), the sun's altitude at that place
(the app colours the sky by it, so a night photograph needs a dark sky), and
whether the thing being shown is actually happening. The station in `02-tap` is
40° up in a sky 5° past sunset, which is the window a satellite is really
visible in; CHEOPS in `06-pass` is eight minutes from rising, which is why there
is no mark for it and a countdown instead.

### The drawn mirror, which is now the fallback

`render.mjs` still carries the hand-written HTML and CSS reproduction of the
panels (`page/screen.css`, `page/markers.js`, `page/sky.js`, and the panel
builders in `render.mjs` itself), and uses it for any scene with no capture. It
reproduces things that are easy to get wrong by eye:

- The picture is the camera's own 3:4 box **covering** the screen
  (`frameBoxFor`), not fitted into it — so it is 699 × 932 points, centred, with
  a third of its width off the sides and none of the app's background showing.
  That is what the phone shows: the camera reaches all four corners, the status
  bar and the home indicator are over it rather than beside it, and the app's
  own controls are inset off both by the safe area (`SafeAreaLayer`), which is
  why the title sits below the sensor housing and the tab bar above the home
  indicator rather than against the screen's own edges.
- The compass strip along the foot of the frame is placed from the scene's own
  `headingDeg`, on the same scale the app uses — 62° either side of the middle
  (`HorizonCompass`) — so the letters under the diamond and the bearing on the
  card above them agree.
- The count is the marks **on the screen** rather than the marks on the frame,
  which is the figure the app publishes (`pointInViewport`) and the reason the
  first frame, whose scene holds thirty-one markers, shows twenty-one. The breakdown's "Others" row
  is derived from that count, so the rows always add up to the number above
  them.
- Marks are sized, rimmed, tailed and haloed by the rules in
  `src/components/markerScene.ts` — 17 points across at 400 km down to 8 at
  40,000, a rim at 0.16 of the diameter, a tail of the ground covered in twelve
  seconds, a ring instead of a body for anything parked over the equator.
- A landmark's path runs along that object's own heading, from the object
  forward, because that is all the app draws — the ground already covered is the
  tail's business. Its arrowheads are one minute apart, which is five of the
  twelve seconds the tail stands for, and its weight says how far ahead the pass
  is: full strength for one under way, a quarter for one three hours out. Where
  the first mark falls inside that minute is a choice, since the app puts them on
  round clock minutes and nothing rises on one.
- An arc carries its object's name unless the object's own marker is on the frame
  carrying it already, which is the app's rule (`anchorFor`) and the reason only
  the last frame shows one: everywhere else the landmark is on screen with its
  name under it.

Where the numbers come from, if a frame has to be argued about:

| In the frame | In the app |
| --- | --- |
| The picture's box, and how much of it is on screen | `frameBoxFor`, `viewportOf` in `src/components/markerGeometry.ts` |
| The safe area the controls are inset by | `src/components/SafeAreaLayer.tsx` |
| Marker sizes, rims, tails, rings, halos | `src/components/markerScene.ts`, `SATELLITE_MARKERS` in `src/constants.ts` |
| The landmarks' paths, their marks and their fade | `src/satellite/orbitPath.ts`, `LANDMARK_PATHS` in `src/constants.ts` |
| Marker colours and edge, and the day and night glow and names | `src/components/palette.ts` |
| The header, the filter, the cards, the tab bar | `SkyHeader`, `CategoryLegend`, `SatelliteCard`, `UpcomingPasses`, `TabBar`, `theme.ts` |
| The compass strip and its scale | `src/components/HorizonCompass.tsx` |
| The glyphs on the buttons and the bar | `src/components/Icon.tsx` |
| Every word on screen | `src/i18n/strings/en.ts` |
| The ISS briefing and its link | `src/satellite/briefing.ts` |

## Keeping them current

The frames are photographs of the app, so they go stale when the app moves.
`.github/workflows/screenshots.yml` is what notices:

- **A push that changes the view** — `src/components/`, `src/i18n/strings/`,
  `src/constants.ts` or the pipeline itself — regenerates the frames on Linux,
  attaches them to the run as an artifact, and fails if they differ from what is
  committed. That is a prompt to look at them, not a verdict: browsers do not
  rasterise identically across machines.
- **A manual run with `commit: true`** regenerates them and pushes the result.
  That is how the listing is actually updated, once somebody has looked.

Both cover every language the app speaks, so a change to an Italian string is
caught by the same run that catches a change to an English one.

Committing six 2 MB PNGs on every interface tweak would bloat the history, which
is why the automatic half stops at telling you.

The staging in `capture.mjs` presses the app's own controls, found by the
accessibility labels the app publishes — the same surface
`testing/e2e/replay.spec.ts` drives. A control that is renamed or moved fails
the capture rather than quietly producing last month's picture. Those labels are
read out of `src/i18n/strings/<locale>.ts` per language rather than written into
the tool, since an Italian app publishes `Catalogo` and `satelliti visibili`.

## Editing them

- **The scenes**: `testing/screenshots/scenes.ts` — where the phone is standing,
  when, where it is pointing, and which panel to open. Read the note at the top
  of that file before moving a time.
- **The photographs**: `tools/screenshots/backgrounds.mjs` — the list of six and
  where each came from. Drop a different file at `backgrounds/<scene id>.jpg`
  and update its entry. Portrait, and at least 2100 × 2800.

  **Swapping one in is not a cosmetic change, and two of the six proved it.** A
  photograph of a tower that filled the frame left the mask nothing to do and
  the capture read "0 visible satellites". A dark long-exposure Milky Way shot
  was read by the segmentation model as terrain rather than sky, and the same
  scene at the same instant drew two marks where another photograph drew 111.
  Both are written up in `backgrounds.mjs`. After a swap, run `probe-aims.mjs`
  and look at the number before believing the frame.
- **The captions**: `tools/screenshots/scenes.mjs`, which still holds the words
  around the frame in each language.

### Editing the fallback mirror

Only worth doing if the mirror is still being used for something:

- **The story**: `tools/screenshots/scenes.mjs` — one entry per frame, holding
  the caption in each language, the sky, the markers on it, the landmark paths
  across it, which way the camera is pointing and which panels are open. The
  text a scene carries is split by what it is: a caption and a briefing are
  written per language here, while a tally, a bearing or a distance is a
  number here and is worded by the app's own strings when the frame is drawn
  (`figureRows`, `sunlightLine`), so "38° up" becomes "38° sopra" without a
  second copy of the sentence. Marker positions are percentages of the camera frame,
  as the projection hands them to the overlay; a path is taken from its own
  object rather than typed beside it (`pathAhead`), so it cannot end up pointing
  somewhere its marker is not going.
- **The sky**: `tools/screenshots/page/sky.js` — grade, stars, skyline, grain.
- **The overlay**: `tools/screenshots/page/markers.js` — keep this in step with
  `markerScene.ts` and the canvas backend beside it; if a mark or a path changes
  in the app it has to change here, or the store is showing a different app.
- **The panels**: `tools/screenshots/page/screen.css`, which mirrors the React
  Native styles a value at a time. Their *words* are not mirrored — those are
  loaded from `src/i18n/strings/` — so a renamed category is picked up here on
  its own and a restyled one is not.

## What is still needed

Ranked by what each is worth.

1. **Captures from the phone, behind the markers.** The six photographs are
   real, but they are stock: taken by other people, with other cameras, at
   places the app was not being held up in. Six stills from the phone the app is
   built for would be better on every count — the framing would be the app's own
   (mostly sky, the horizon in the bottom quarter, and only the middle third of
   the width on screen), and frame 3 would be proving the occlusion against a
   building somebody actually stood under. Drop them in
   `tools/screenshots/backgrounds/` named after the scene (`03-occlusion.jpg`)
   and the next capture uses them with nothing else changed.
2. **Somewhere to put the observer that matches them.** A photograph swapped in
   needs its scene's place, time and bearing moved with it, or the app will be
   drawing the sky of one location over a photograph of another. That is the
   note at the top of `testing/screenshots/scenes.ts`.
3. **A 30-second preview video.** Optional, and hard to shoot honestly for
   this app for the same reason the frames were: it wants a real sky. Worth
   doing only once there is one.

Three things that used to be on this list are done. The captions exist in both
languages the app speaks, and so does everything else on the frame — a
storefront gets its own set from `--locale`. The marketing name is settled: the
record is "Stare - Watch the Satellites", with the subtitle and keywords written
out in [docs/app-store-listing.md](app-store-listing.md). And the phone screen
is no longer a drawing.

## What a reviewer will ask

Apple's guideline is that screenshots show the app in use, and the screen in
these frames now is: the app, running, photographed. The panels, the marks, the
counts and the briefing are what it produced from the real catalogue at the
instant each scene names.

What is not from a phone is the picture behind the marks, which is a stock
photograph rather than a camera frame. That is a weaker claim than it was but
not nothing — a frame is still saying "this is what you would see", and what
somebody would see through their own camera is their own street. Item 1 above
is the fix, and it needs a build on a device and a clear evening.
