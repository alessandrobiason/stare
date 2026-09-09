# App Store screenshots

Six frames for the iPhone listing, and the generator that draws them:
`docs/app-store/*.png`, from `tools/screenshots/`.

    node tools/screenshots/render.mjs

Output is **1290 × 2796**, which App Store Connect takes for the 6.9 and
6.7-inch classes and scales down for every size below them. Nothing else has to
be uploaded unless the listing is later given iPad screenshots, which this app
cannot have — `supportsTablet` is false.

**The camera picture in these frames is drawn, not photographed.** Everything
laid over it is the app: the panels are the app's own styles at the app's own
sizes, and the markers come from a transcription of `markerScene.ts`, so a mark
is the size, shape, colour and rim the phone would give an object at that range,
and a landmark's path is the line, the weight and the minute marks the app would
draw along the arc that object is on. What no machine here can produce is a
photograph of the sky with a building in it. See
[What is still needed](#what-is-still-needed).

## The six, and why they are these six

The order is the one the store shows them in, and the first two carry the
listing: most people see one and a half frames.

| # | File | What it shows | Caption |
| --- | --- | --- | --- |
| 1 | `01-sky.png` | The plain view: a night sky over a city filling the screen, twenty-one marks on it, the count and the filter in their corners. | **Point it at the sky** — The satellites passing over you, drawn on the picture where they actually are. |
| 2 | `02-tap.png` | A tap on the ISS: the selection ring on the sky, the strip of names the tap covered, the briefing and the five figures. | **Tap a light, learn what it is** — What it is, who flies it, how far away — and the figures keep moving while you read. |
| 3 | `03-occlusion.png` | A tower up the right of the frame. The Starlink train runs down to its corner, one mark mid-fade on the edge, and nothing over the building. | **It knows what is in the way** — Anything behind a building or a tree is left out, rather than drawn over it. |
| 4 | `04-legend.png` | The same app at midday, filter open: the five categories, the parked ring, and the daylight palette on a bright sky. | **Colour is what it is for** — Size is how far away. A ring holds station over the equator. Day or night, the sky decides the ink. |
| 5 | `05-inview.png` | The count opened into the breakdown behind it: Starlink 6, SES 3, Galileo 2, GPS 2, ISS 1, six others. | **What is overhead, right now** — The live public catalogue — some 16,000 tracked objects — sorted into what the sky in front of you actually holds. |
| 6 | `06-pass.png` | Two landmark paths: CHEOPS crossing now, at full strength with its minute marks, and the station's next pass — no marker, since it has not risen — faded by how far off it is, named and timed where it will come up. | **Know when to look up** — Each landmark carries the arc it will cross, marked minute by minute, and the time it comes up. |

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

Two passes, in `tools/screenshots/render.mjs`:

1. **The phone screen**, laid out at 430 × 932 points and rasterised at the
   device scale factor a 6.9-inch iPhone has, so the panels are drawn at the
   size the phone draws them rather than being drawn small and scaled up.
2. **The store frame** around it: the caption, the night the boot screen is
   drawn on, and that image laid in.

The layout inside the screen is the app's, and reproduces three things that
are easy to get wrong by eye:

- The picture is the camera's own 3:4 box **covering** the screen
  (`frameBoxFor`), not fitted into it — so it is 699 × 932 points, centred, with
  a third of its width off the sides and none of the app's background showing.
  That is what the phone shows: the camera reaches all four corners, the status
  bar and the home indicator are over it rather than beside it, and the panels
  are inset off both by the safe area (`SafeAreaLayer`), which is why the count
  and the filter sit below the sensor housing rather than against the screen's
  own top edge.
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
  tail's business. Its marks are one minute apart, which is five of the twelve
  seconds the tail stands for, and its weight says how far ahead the pass is:
  full strength for one under way, a quarter for one three hours out. Where the
  first mark falls inside that minute is a choice, since the app puts them on
  round clock minutes and nothing rises on one.

Where the numbers come from, if a frame has to be argued about:

| In the frame | In the app |
| --- | --- |
| The picture's box, and how much of it is on screen | `frameBoxFor`, `viewportOf` in `src/components/markerGeometry.ts` |
| The safe area the panels are inset by | `src/components/SafeAreaLayer.tsx` |
| Marker sizes, rims, tails, rings, halos | `src/components/markerScene.ts`, `SATELLITE_MARKERS` in `src/constants.ts` |
| The landmarks' paths, their marks and their fade | `src/satellite/orbitPath.ts`, `LANDMARK_PATHS` in `src/constants.ts` |
| Marker colours, night and daylight | `src/satellite/categories.ts`, `src/components/palette.ts` |
| Panels, card, console pill | `SceneStatus`, `CategoryLegend`, `SatelliteCard`, `DebugToggle`, `theme.ts` |
| Every word on screen | `src/i18n/strings/en.ts` |
| The ISS briefing and its link | `src/satellite/briefing.ts` |

## Editing them

- **The story**: `tools/screenshots/scenes.mjs` — one entry per frame, holding
  the caption, the sky, the markers on it, the landmark paths across it and
  which panels are open. Marker positions are percentages of the camera frame,
  as the projection hands them to the overlay; a path is taken from its own
  object rather than typed beside it (`pathAhead`), so it cannot end up pointing
  somewhere its marker is not going.
- **The sky**: `tools/screenshots/page/sky.js` — grade, stars, skyline, grain.
- **The overlay**: `tools/screenshots/page/markers.js` — keep this in step with
  `markerScene.ts` and the canvas backend beside it; if a mark or a path changes
  in the app it has to change here, or the store is showing a different app.
- **The panels**: `tools/screenshots/page/screen.css`, which mirrors the React
  Native styles a value at a time.

## What is still needed

Ranked by what each is worth.

1. **Real camera captures behind the markers.** Six stills from the phone the
   app is built for, one per frame: a night sky over a street, the same with a
   tall building crossing the upper half (frame 3 lives or dies on this), a
   bright daylit sky with a roof line at the bottom (frame 4), and three more
   night skies — one of them with the horizon low enough to put a rise point
   over the rooftops (frame 6). Portrait, from the rear wide camera, and framed as the app
   frames it — mostly sky, the horizon in the bottom quarter. Only the middle
   third of the width is on screen, so whatever the frame is about belongs
   there. Drop them in
   `tools/screenshots/backgrounds/` named after the scene (`03-occlusion.jpg`)
   and they replace the drawn sky with nothing else changed.
2. **Or, better, six real screenshots.** A TestFlight build on a phone, the
   sky in front of it, and the volume-down + side-button capture: then the
   frames are the app rather than a drawing of it, and the generator only lays
   the caption around them. That needs a build on a device and a clear evening;
   it is the honest version of frames 1, 2 and 5, and the only version of frame
   3 that proves anything.
3. **A decision on the marketing name.** The listing name can be up to 30
   characters and the app is called `Stare` in `app.json`. "Stare" alone is a
   hard search term; "Stare — Satellites Overhead" or similar is findable. The
   frames carry no wordmark, so this changes nothing here — but it changes the
   subtitle and the keywords, which are the other half of the same page.
4. **Localised captions.** The app ships in twelve languages and the App Store
   takes a screenshot set per storefront. The captions here are English; the
   six titles and six bodies are the whole of what needs translating, and
   they should be translated by whoever wrote `src/i18n/strings/*.ts` rather
   than machine-translated, since they are written in that voice.
5. **The rest of the listing**, which these frames do not cover: the 30-second
   preview video (optional, and hard to shoot honestly for this app), the
   description, the subtitle, the keywords, the support and privacy URLs, and
   the privacy nutrition labels — for which the true answer is that nothing
   leaves the device except a request to CelesTrak for the public catalogue.

## What a reviewer will ask

Apple's guideline is that screenshots show the app in use. Frames drawn with a
synthetic sky are a risk under that rule if they are shipped as they stand —
the panels are real, the marks are real, but the photograph is not. Ship real
captures behind them (1 or 2 above) before the listing goes to review.
