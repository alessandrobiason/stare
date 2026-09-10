# Stare — Watch the Satellites

*Vibe coded, with a manual touch.*

An iOS app that draws the live satellite catalog over the iPhone's rear camera.
Point the phone at the sky and the ~16,000 objects CelesTrak tracks are placed
on the picture where they actually are — positioned by GPS, aimed by the phone's
motion sensors, and hidden behind whatever buildings and trees are in the way.

The view opens in **normal** mode: the camera picture, the markers, a marker
count, a collapsed category filter and the next landmark due over you. **A marker is the app's own logo**: the
body and tapered trail of `assets/icon.svg`, a couple of dozen pixels across,
the same shape the boot screen turns five of — both drawn by `tools/make-logo.mjs`
from the geometry in `src/components/bootSky.ts`. It carries five channels at once —
colour for purpose (five categories), shape for whether the object holds station
(a geostationary ring, or a body trailing the 12 seconds of ground track it has
just covered), size for range on a log scale from 400 km to 40,000 km, a
label, spent only on a couple of dozen landmarks, and **strength for whether the
sun is on it**.

That last one is the only channel that is not about where the object is, and it
is the one the app was missing for longest. A satellite is not a light: it is a
few square metres of foil and solar cell reflecting the sun, and half of every
orbit is spent inside the Earth's shadow with nothing to reflect. Drawn the same
as the rest, half the marks on a clear night sky point at nothing — and there
was no way to tell which half. A mark at full strength is in sunlight; one at
half strength is in the Earth's shadow, and the legend says so under the ring
key. Whether *you* can then see it is the other half of the question, and the
sky behind it decides that: see **Whether it can be seen** below.

**Tap a marker and it says what it is.** The overlay's channels answer "what is
it for" and "how far away", and for a couple of dozen landmarks "what is it
called"; a tap fills in the rest for the one object asked about — what it is and
who flies it, a link to the operator's own page, then purpose, whether it can be
seen from here right now, distance, altitude, speed, where to look for it, and
how long its orbit takes.

The description comes first, above the figures, because someone who has just
tapped a light in the sky is asking what it is rather than how many kilometres
away it is. It is written per object for the landmarks — the stations and the
great observatories, which are the reason anyone points a phone at the sky at
all — and per fleet for everything else, since nobody wants a paragraph about
Starlink 4321 in particular. Between the two, 92% of the 16,000-object catalog
gets a description written for it rather than for its category, and a link is
the operator's own page or nothing (`src/satellite/briefing.ts`).

**And for the landmarks it shows them, too.** Words cannot settle what a thing
looks like, so the two stations, the great observatories and the vehicles
visiting them carry a photograph above the description — the picture is
understood before the text is read. Mostly NASA's own photographs of the thing
in orbit, and an agency rendering where nobody has ever photographed it: nothing
has taken a picture of NuSTAR since it left the rocket.

They are not bundled. Nineteen pictures worth looking at is several megabytes of
app download for a panel most launches never open, and they would then be frozen
at the version shipped, so each is fetched the first time somebody taps that
object and left to the platform's own HTTP cache after that. Each is a named
file on Wikimedia Commons, looked at before it was written down — the article's
lead image was the first attempt, and two of the observatories lead with the
mission's *logo* — and checked at the size the card draws it, which is a strip:
that is what ruled out a picture of CHEOPS that was perfectly good and, cropped,
an abstract. The URL is asked for rather than assembled, because Wikimedia
serves thumbnails only at sizes it has decided on.

Existing on Commons is the licence check — that is what says a picture is free
to show — and the caption is the author and the licence out of the file's own
metadata, over a link to the page carrying both in full. Two thirds are NASA's
and in the public domain; the rest are CC BY, CC BY-SA or CC0, which ask to be
credited. Nothing about it is load-bearing: no network, no file, a licence that
has changed, or a picture the phone will not decode all end as the card that was
there before (`src/satellite/landmarkPhotos.ts`).

A fingertip covers a good deal more sky than an eight-pixel marker, so the
target is the finger's size rather than the mark's, and a tap that covers
several satellites — the geostationary belt is a line of markers a few pixels
apart, and crew vehicles sit on the station they are docked to — offers all of
them as a strip of names, with the sky ringing whichever one is being read about
(`src/components/markerHitTest.ts`, `SatelliteCard`). The figures keep up while
the card is open, because they are all moving: a low pass halves its range in
the time it takes to read them.

Every mark is a coloured core inside a contrasting rim, because a photograph of
the sky is either far brighter or far darker than any fill. Which way round that
runs follows the sun: with it down the marks are light in a dark rim, with it up
they are dark in a light one, and the two ladders cross over a two-degree band
of solar altitude inside civil twilight — worked out from the GPS fix and the
clock, so it is right in Oslo in June as well as on the equator (`src/components/palette.ts`,
`src/coordinates/sunAltitude.ts`).

The `DEBUG` button swaps in the workings: the sky mask tinted over the picture —
travelling with the sky it was cut from, so it slides and tilts with the
buildings as the phone moves — and a tabbed panel (SENSORS / STATUS / MASK / SKY
/ VIEW) sampled twice a second. The MASK page carries a switch as well as
figures: *Hide behind terrain* off stops the mask being applied at all, so every
satellite above the elevation mask is drawn wherever it is — over trees, walls
and rooftops included. That is a view of the catalogue rather than of the sky,
and it is what tells a mask hiding the wrong markers apart from a sky that is
genuinely that empty. The segmenter keeps running underneath, so the page goes
on reporting what it would have hidden.

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
| Occlusion: SegFormer sky mask, horizon-capped, aimed at the sky | `src/vision/` |
| Heading checked against the sun or the moon in the same frame | `src/vision/brightBodies.ts`, `src/fusion/celestialNorth.ts` |
| Drawn at display rate, every marker in one canvas | `src/components/markerScene.ts`, `SatelliteMarkers` |
| Where the landmarks will be for the next few hours | `src/satellite/orbitPath.ts`, `src/hooks/useOrbitPaths.ts` |
| The same plan read as a list: what is coming, and when | `src/satellite/upcomingPasses.ts`, `src/components/UpcomingPasses.tsx` |
| Day or night palette, from the sun's own altitude | `src/components/palette.ts`, `src/coordinates/sunAltitude.ts` |
| Whether the sun is on it, and whether it can be seen from here | `src/satellite/illumination.ts`, `src/satellite/nakedEye.ts` |
| A tap back into the sky: which markers, and what they are | `src/components/markerHitTest.ts`, `SkyTracker.describe`, `src/satellite/briefing.ts`, `src/satellite/landmarkPhotos.ts` |

**Boot is all-or-nothing** (`src/boot/`). Before the view opens it must have the
catalog, the sensors, a GPS fix, magnetic declination, camera permission and the
segmentation model. Any of them failing fails boot — there is no degraded mode
that looks like it is working, and markers are drawn only against a mask that is
less than 8 seconds old. While it runs, the screen is the logo and the app's
name — five satellites turning around the one word, which sits in the clear
circle their innermost orbit leaves (`src/components/bootSky.ts`, drawn still
into `assets/logo-extended.svg`). Their turning is the only progress report,
because the steps behind it are not ones anyone can act on; a failure stops the
sky, takes the name off it and says what went wrong.

**The first launch is not that** (`src/onboarding/`, `src/components/IntroScreen.tsx`).
Boot asks for the camera and then for a GPS fix within a second of the app
opening — two system prompts, back to back, over a screen that has explained
nothing, each of them fatal to the view if refused. So a device that has not seen
the app before opens on five pages instead: what it does, how to hold it, what
the screen says about the sky, the two panels that are worked rather than read —
each of the five named beside a copy of the badge it wears, since a bare `12` in
the corner of a photograph says nothing about what it counts — and what it is
about to ask for and why. Two pages of badges rather than one because five
explained badges is taller than the card at the foot of a 4.7-inch screen, which
the suite measures in all twelve languages; given a break to make, it is made
where the panels themselves divide. Two prompts, not three: the
motion sensors the view is aimed by are read without one — iOS gates the
pedometer behind "Motion & Fitness", not `CMMotionManager` — and asking anyway
meant a phone with that setting off refused to aim at all
(`src/device/deviceOrientation.ts`).
Nothing boots until the last page is accepted, which is why `src/App.tsx` mounts
the app proper only then. A flag in the document directory keeps it to
that one launch, alongside the catalog cache and through the same storage
(`src/data/persistentStore.ts`); the launch after it opens straight on the name.

**Where you are pointing** (`src/fusion/`). The device's Euler angles and the
magnetic bearing to north are fused in a per-axis Kalman filter whose process
noise opens up with measured turn rate, so it smooths while still and tracks
while moving. Heading is the channel that pays: its magnetic term is near-white
at frame rate, and the filter cuts that shimmer about fivefold for a tenth of a
degree of lag. Pitch and roll carry a slow correlated error no smoothing
removes, so they track closely instead. The rate the filter carries is bounded by
what the gyro says the phone is doing, because a reading is stamped when it is
handled rather than when it was taken: block the main thread mid-turn and the
readings taken during the block all arrive at once, describing degrees of turn in
fractions of a millisecond. Believed, that put the drawn sky over a hundred
degrees from where the phone was pointing for a few frames — every marker off the
frame and then fading back in, which is what a quick sweep across the sky used to
flicker with. Tuning lives in `ORIENTATION_FILTER` in `src/constants.ts`.

A compass is the only thing aiming this view with nothing to check it against, so
it is checked against the sky. The sun's bearing at a given instant from a given
place is known to an arcminute, and on a clear day the sun is in the frame: the
difference between where the app draws it and where the camera sees it is the
compass error, measured rather than guessed. The frames come from the
segmentation pass, so a sighting costs no capture — one threshold-and-flood-fill
over a buffer that is already in memory (`src/vision/brightBodies.ts`). The
ephemeris is [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT),
which is topocentric and refracted: the moon's parallax is up to a degree and the
atmosphere lifts a low sun by half of one, and both are being compared against a
photograph of the thing itself.

What makes it safe to believe is that elevation is an independent check. Turning
the phone about the vertical moves a ray's azimuth and leaves its elevation
exactly where it was, so how high a blob sits is a fact that does not depend on
the heading being solved for — and it comes from gravity, which is not what is
wrong with a compass. A street lamp is not at the sun's elevation. Past that
gate a sighting must be repeated at the same implied bearing before it is used,
and it then goes in as a measurement like the magnetometer's, carrying a
standard deviation of a fraction of a degree against the compass's three to
forty. No mode and no override: the Kalman gain snaps the north reference onto
the sighting, holds it there, and lets it decay back to the compass over minutes
if the sky clouds over. `CELESTIAL_ALIGNMENT` in `src/constants.ts`, and the SKY
FIX debug page for what the last frame made of it.

One thing that had to change for it to work at all. A magnetic bearing used to
be fused on every reading, forty a second, which asserted that each was fresh
evidence about where north is. What is wrong with a phone compass is a *bias*,
and a bias does not average away — forty readings a second of the same captured
field is one measurement repeated forty times, and counting it forty times is
how the reference came to hold a half-degree standard deviation around a bearing
thirty degrees wrong. That overconfidence is why two phones on one table each
hold a different heading and neither wavers. The noise is now widened by the
square root of how many readings fall inside the window over which a compass
error holds still (`magneticCorrelationSeconds`), which leaves the compass its
whole job of carrying the heading between sightings and costs it only the
authority it never had.

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
fixed pixel budget — and sooner than that when the phone has been turned off
what the last pass covered, since a gap is only quiet worth having while the
camera is still (`segmentationLoop.ts`). The model runs under ONNX Runtime —
React Native on the phone, WASM in the browser — behind one shared module, so it
is the same algorithm either side. Six things sit between its output and a marker being
hidden:

- **An aim, not a decal** (`anchoredMask.ts`). A mask is a grid over a *frame*,
  and a frame is a piece of sky only once you know where the camera was pointing.
  So every mask is filed under the attitude read at its own shutter — the near
  end of the capture, since the far end is a full-resolution encode and decode
  later and reading it there files the mask under an aim a whole capture ahead of
  its own frame. A satellite is then looked up at the place it occupied in the
  mask's frame rather than at the place it occupies on screen now. Turning the
  phone moves the markers and leaves what the mask says about each of them alone;
  what it does change is how much of the view the mask still covers, and a
  direction outside that is no reading rather than either answer — not drawn,
  and not argued with by the hysteresis below either.
- **The sky already looked at** (`skyMemory.ts`). One mask covers one frame, so
  each pass used to throw away what the last one learned about the sky either
  side of it: turn the phone and the new view waits on the segmenter, turn back
  and the sky mapped a moment ago waits all over again. Every pass is therefore
  also written into an azimuth/elevation grid fixed to the sky, and a direction
  the live mask cannot answer for is asked of that. Turning back is then
  immediate, and only genuinely unlooked-at sky waits. It is a fallback and not
  a licence: the live mask wins wherever it reaches, a reading expires after
  ninety seconds, moving twenty-five metres drops the lot — directions to
  nearby buildings are only fixed while the observer is — and a direction whose
  neighbouring cells are mostly empty still gets no answer at all.
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
  and blocked moves it never — and crossfades when it does. What the low pass
  arbitrates is *answers*, so the first one a marker ever gets is taken at its
  word instead. Averaged in from the nought a marker with nothing to go on
  starts at, a satellite the phone had turned onto ahead of the segmenter spent
  1.9 seconds climbing out of a figure nothing had measured — on top of the
  pass it was already waiting for, and for most of a walk through a city that
  was the whole of the delay in turning.
- **Warmed a frame ahead** (`useAnimatedMarkers.ts`). Both of those cost time —
  a decision, then a fade — and both used to start at the frame's edge, so the
  sky a turn arrived on came up empty and filled in behind it. The loop follows
  the satellites a frame's width past every edge as well, and a turn then brings
  in markers that are already drawn. A band rather than the whole sky, which was
  tried and was worse: off the frame only the memory can answer, and a satellite
  left out there long enough settles hard on what it last saw, which the band
  above then charges two live passes to undo.

The first run downloads a 95 MB model and caches it;
`EXPO_PUBLIC_SKYWATER_MODEL_URL` and `EXPO_PUBLIC_ONNX_WASM_URL` point at
mirrors.

**Whether it can be seen** (`src/satellite/illumination.ts`,
`src/satellite/nakedEye.ts`). Everything above answers *where* a satellite is
and whether anything is standing in front of it. Neither of those is the
question somebody holding a phone at the sky actually has, which is whether
there is anything up there to look at — and for most of the day the honest
answer for all sixteen thousand objects is no. Point the app at a blue midday
sky and it drew seventy marks over a sky that was empty to the eye, with nothing
on the screen saying so. It was not wrong. It was answering a different question
from the one being asked of it.

Three things have to hold at once, and only the third is an estimate.

- **The satellite is in sunlight.** Geometry, exact, and known for every object
  in the catalogue without knowing anything about any of them. The Earth casts
  an umbra — a converging cone about 1.4 million kilometres long, since the sun
  is the larger body — inside a diverging penumbra where part of the disc still
  shows, and a satellite's position against those two cones is a dot product and
  a hypotenuse. The shadow is cast at the equatorial radius plus eighty
  kilometres of atmosphere, because sunlight grazing the top of the mesosphere
  is scattered out of the beam rather than arriving to be reflected: it moves
  eclipse by about ten seconds on a low orbit, which is the difference between a
  station that visibly reddens and fades on its way in — as everyone who has
  watched one has seen it do — and one the app would have called fully lit until
  it went out. Worked out once per frame and asked of every marker, it costs far
  less than the rotation that placed the marker.
- **The observer is not.** The single largest filter, and the one nobody
  expects: a sunlit satellite against a sunlit sky is a fifth-magnitude object
  on a background thousands of times brighter, which is why nobody has ever seen
  the station at noon. The sun's altitude here already exists — the palette
  turns on it — so this costs nothing new. Above civil twilight the answer for
  the whole sky is none, with no partial credit; below it the limiting magnitude
  walks from the first-magnitude stars (which is what the end of civil twilight
  *means*) down to whatever a suburban sky gives up. That interpolation is what
  makes the order right: the station clears the bar the moment the sun is down,
  and a Starlink does not clear it until the sky is genuinely dark.
- **What it reflects is enough.** A magnitude, from the range and how much of
  the lit side is turned this way, against a **standard magnitude** — what the
  object shows at a thousand kilometres with half its disc lit, which is the
  convention the observing catalogues record against. This is the one figure
  geometry cannot supply, it is measured by people watching satellites, and
  there is no such measurement for most of this catalogue anywhere.

So `standardMagnitude.ts` is deliberately short and **what is not in it returns
`null` rather than a default**. A default is a number the rest of the app cannot
tell apart from a measurement, and the honest thing to do with an object nobody
has recorded is to say the brightness is unknown — the card then talks about
where it is and whether the sun is on it, which are both facts, and stops. What
is listed is the twelve landmarks, by catalogue number, and the large
constellations by name; between them about three quarters of the catalogue by
object count has a figure. Of those only the station, Tiangong and Hubble are
recorded observations, and the card hedges the rest ("around magnitude 5.2")
rather than stating them. The suite holds the landmark list here and the one in
`categories.ts` together, so a landmark added without a brightness fails rather
than shrugging on the card.

Which channel to spend was the one real design question, and the answer came
from what is in use *at rest*. Hue, fill, shape and size are all carrying
something permanently, so any of them would have traded one fact for another —
and fill in particular is already the difference between a parked ring and an
ordinary dot, which is why an unlit mark cannot be a hollow one: the legend
would have had two rings in it meaning different things. Opacity is not spent:
at rest a marker is either faded fully in or has been dropped, and everything in
between belongs to the terrain crossfade, which is a transition rather than
something to read. It also happens to mean the right thing — an object in the
Earth's shadow *is* fainter — so a mark at half strength needs no key to be
guessed at, and gets one anyway.

Four places say it. The **marks** are drawn at half strength, with the
**legend** carrying the key under the one for the geostationary ring. The
**count panel** opens onto a line before the fleet list — the
count is a fact about the overlay and this is the fact about the sky, and at
noon those two are as far apart as they get. And the **card** answers outright
for the one object asked about: *bright enough to see now · magnitude -1.8*, or
*in the Earth's shadow*, or *the sun is still up here*. The debug console's SKY
page carries the same split as figures, which is what tells a sky with nothing
in it apart from a shadow cast against the wrong sun — the two look identical on
the frame.

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

**The landmarks carry their orbits with them** (`src/satellite/orbitPath.ts`).
A marker says where an object is and a trail says which way it is going, which
is the whole of what is worth saying about sixteen thousand satellites and much
too little to say about the dozen anyone would go outside for. The question
about the station is not where it is — most of the time it is under the floor,
and no marker can be drawn for that — but *when* it comes over and *where* to
stand. So a landmark is drawn with the arc it will trace across the sky: rise to
set, for every pass in the next three hours, with an arrowhead at each round
clock minute and the object's name written on the line itself.

Both of those are the second draft. The marks were strokes *across* the line,
which answer "when" and leave "which way" to be guessed — the one thing a line
cannot say by itself, and the first thing anyone asks of one. And the name was
written only where the object comes up, which is a fixed piece of sky and the
right place for it, except that most of the time it is not on the frame: an arc
whose object is behind a roof was an anonymous streak. It is now written at one
of the arc's own sample points, four degrees apart, and stays on that point
until it leaves the view — so the name is pinned to the sky like everything else
here rather than hovering near the middle of the screen while the world turns
under it.

Under the name is the clock time its object is at *that point of the line*. The
anchor is one of the arc's own samples and so knows the instant it is reached,
which is the whole of what the label means: this object, this piece of sky, this
minute. It used to be the time the pass began, written wherever the name had
landed — a time for the point it is set under only where that point is the rise,
and as the anchor moved along the line the same minute turned up at both ends of
one arc, saying nothing about either.

And the name is a target (`namesUnder`). A landmark below the horizon or behind
a roof is a line and a name and nothing else, which makes it the one thing on
the frame with no way to ask what it is — and the most conspicuous unanswered
question on the picture, since the line crosses sky that has nothing on it.
Tapping `SOYUZ-MS 33` where it is written now opens the same card its mark would
have. The target is a disc around the anchor rather than the box the name is set
in, because a label turns with the camera roll and a rectangle would be the
right shape only with the phone held level; the marks under the finger are still
offered first, since something that is up there now outranks a line running past
it.

The plan is a few thousand propagations, made once a minute off the frame
thread in slices (`src/timeSlice.ts`) and trimmed to the present on every frame,
so the line always starts at the object and never at where it was when the plan
was made. It is sampled by *angle* rather than by the clock — four degrees a
step, chosen from the object's own rate — which is what makes one arc out of a
station crossing at a degree a second and Chandra crawling at a degree a minute.
Four paths at a time, breadth first, with a ferry docked to a station collapsed
into the station's own line; below ten degrees a pass is along the rooftops and
is not drawn at all.

Two things make it worth having. A path is drawn **whether or not its object is
on the frame**, so a line running out of the top of the view is a direction to
turn the phone, and following it is how you find something that has not risen
yet. And it is drawn **whether or not the sky mask has anything to say about
it**: the mask decides whether an object can be seen, and a path is not a
sighting — it is where to point, which is worth drawing across the roof the
thing is about to come out from behind. The marker itself still waits for the
mask, exactly as every other marker does.

**And the same plan is read out as a list** (`src/satellite/upcomingPasses.ts`,
`UpcomingPasses`). A line is an answer to somebody already pointing the phone at
the piece of sky it crosses, and for most of the three hours it covers that is
nobody — the plan is the whole sky and the camera holds sixty degrees of it. So
the question asked *before* the phone goes up at all, and the one the other two
panels are both in the wrong tense for, had no answer on screen: is anything
coming, and how long have I got.

It is a third pill, in the corner above the bottom row, and **shut it is the
next pass rather than a title** — `ISS · 14 min`, which is the whole answer most
of the times anyone glances at it. That is what separates it from the two above
it: a filter has nothing to report until it is opened, and this has one fact
worth more than its own name. Open, it is the rest of the plan, soonest first,
each pass with the compass point it comes up at, how high it gets and whether it
can be seen. A row is a target like the names written along the paths: it opens
the same card the object's own mark would, which for a pass that has not begun
is the card saying how far below the horizon it still is.

**And the card answers in the pass's own tense.** Everything `SkyTracker.describe`
returns is resolved at the instant it is read, which is right for an object on
the frame and wrong for one that is under the floor until this evening — and
between now and a pass three hours out, the sun is what moves most. A card
opened from the list at two in the afternoon was saying *the sun is still up
here* about a pass at half past nine, which is true of the moment it was asked
and false of the thing it was asked about. So a card for a pass that has not
begun says *When it comes over at 21:31: visible to the eye · magnitude -2.2*
instead: the verdict `upcomingPasses` already took at that pass's own high
point, with the clock time that makes the tense readable rather than merely
correct. The figures under the line stay about now, because that is what they
are. What decides which tense is the object's own elevation rather than the
existence of a plan — a station crossing the sky has a next pass too, and its
mark is on the picture — and it is re-read on the card's own timer, so a card
left open through a rise switches at the moment the marker appears.

The rows carry a verdict because **a countdown is a promise**. Told "ISS,
14 min" and sent outside, somebody who finds an empty sky has been given a worse
answer than no answer — and for most of the day that is the answer the geometry
alone gives, since the arc is real, the object is really on it, and the sun is
up. So each pass is judged at its own highest point, with the same arithmetic
the card uses for the object under the finger (`nakedEye.ts`), and the row says
*in the Earth's shadow* or *daylight — nothing to see* beside the time. Nothing
here is planned or propagated twice over: the passes were found for the lines,
and this is one propagation and one sun position each, on the same background
job, once a minute.

Nothing at all when there is nothing coming — the tier filtered off, or a sky
where no landmark clears the roofline for three hours, which at high latitudes
is most of them most of the time. A permanent pill saying "nothing" is a word
over the picture in exchange for the absence of news. It also gives way to the
compass notice, which stands under it and grows into it, and which says the
bearings this panel is about to give are tens of degrees out.

The picture is the whole screen. The camera keeps its own 4:3 shape, is scaled
until it covers the display and is clipped where it runs past the edges
(`frameBoxFor`) — so the sky is edge to edge, the status bar and the home
indicator sit over it, and nothing is spent on black bars. Everything drawn is
still placed in percentages of that frame, which is what keeps a marker on the
piece of sky it was projected onto; the third of the frame's width that falls
off the sides is drawn and then cropped, exactly as a trail hanging over an edge
always was. The one thing that has to know the difference is the count in the
corner, which is a claim about the sky someone can see rather than about the
frame, so it counts the marks inside the visible window (`viewportOf`). What is
inset instead is the writing: the panels sit in a layer that carries the safe
area (`SafeAreaLayer`), so each one measures its corner from the notch and the
home indicator rather than from the screen's edge. Those insets are the phone's
own, from `react-native-safe-area-context` — the one native dependency this
layout has, and the reason it needs a build rather than an over-the-air update.
A browser reports zero on every edge, so the harness runs the same layer
against the same numbers.

Nothing that changes at sensor rate is React state. Attitude readings arrive
twenty to forty times a second and go straight into the filter on a
subscription (`useSmoothedOrientation`); drawn frames reach the overlay the same
way (`MarkerSource`), so the component that draws is the only thing that renders
at display rate — the camera picture, the legend and the debug panel above it do
not. The epoch, the frame rate and the debug figures live in refs, and the
marker count is published four times a second rather than per frame. A tap is
the same idea from the other end: it reads the newest drawn frame out of a ref
to work out what is under the finger, and the card it opens re-reads its figures
twice a second, so neither costs the view a render per frame.

### Layout

```
App.tsx / App.web.tsx   app entry / harness entry (bundler picks by platform)

src/          the product, and nothing else
  constants.ts  tuning knobs, each with the measurement behind it
  math/ camera/ coordinates/        quaternions, ENU -> frame, ECI -> ECEF, sun and moon
  satellite/ data/                  TLE parsing, SGP4 sweep, CelesTrak cache,
                                    the Earth's shadow and what can be seen
  device/ fusion/                   sensors, GPS, declination, attitude filter, sky fix
  vision/                           sky mask, segmentation loop, filters, bright bodies
  boot/ debug/ hooks/ components/   startup gate, debug panel, glue, scene

testing/      nothing here ships - see testing/README.md
  replay/ e2e/ tools/ fixtures/     harness, Playwright, staging + mocks, TLEs

__tests__/    jest suites for both trees
tools/        iOS release helpers (distribution cert, icon and update checks),
              plus the logo and App Store screenshot generators
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
wiring on top and sets no environment of its own. The image copies no source in;
both ways of running it mount `/app` instead:

```bash
docker build -f docker/Dockerfile -t stare:dev .
docker run --rm -it -p 8081:8081 -v "$PWD":/app -w /app stare:dev
```

Two named volumes carry state across a rebuild — `stare-node-modules` and
`stare-home`, the latter holding the logins and caches a rebuild would otherwise
discard — so deleting one is how you force a clean one.
[`docs/dev-environment.md`](docs/dev-environment.md) has the rest: the base
image, and the two dev-client failure modes that report themselves as something
other than what they are.

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
  When either of them fails, it is usually one of the two things in
  [`docs/dev-environment.md`](docs/dev-environment.md).

**Expo Go cannot run this app**, whichever of those is running: its binary
carries none of the native modules the view is built on (camera, location,
motion sensors, ONNX Runtime).

## Testing

There is no sky to point a container at, so the app is exercised through the
**replay harness** in `testing/replay/`: the app's own view, fed a recorded
iPhone stream instead of a live camera. The recording's video becomes the
background and its playback position drives the clock, GPS, ARKit pose and IMU
together, so the projection can be checked against a known ground truth.

The harness substitutes only what a phone would otherwise supply — picture,
clock, observer, attitude, frame pixels, the ONNX runtime. Everything else is
the app's own code imported from `src/`, which is what makes a result here worth
anything. [`testing/README.md`](testing/README.md) has the full table.

The jest suites run in that same web build: `react-native` maps to
`react-native-web`, and `.web.tsx`/`.web.ts`/`.web.js` win the file-extension
race, so a package split by platform — `react-native-safe-area-context`, whose
native half is a view jest cannot instantiate — resolves to the implementation
the harness itself runs.

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
provider. The date is the point: the epochs in that file do not move, so
positions propagated from it are wrong by kilometres and grow worse the longer
ago 2026-08-23 was, and objects launched or decayed since are respectively
missing and still there. `testing/fixtures/README.md` covers where it came
from, what may be done with it, and how to refresh it.

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
- **North comes from the phone's compass whenever the sky cannot be seen, and a
  compass is a soft-failing sensor.** A hard-iron bias — a magnetic case, a car
  door, a second phone on the table — reads exactly like the field it corrupts:
  no dropout, no shimmer, just a sky drawn steadily somewhere else. At mid
  latitudes the horizontal component is about half the total, so 13 µT of bias
  is thirty degrees of heading, which is most of the frame. With the sun or the
  moon in view this is now measured and corrected outright (above), and the
  residual is a fraction of a degree for the badly-biased compasses that
  motivated it. Without one — indoors, overcast, a moonless night — the view is
  back to the magnetometer: it reports what the platform says about its own
  calibration and trusts the bearing accordingly (`COMPASS_ACCURACY`), and asks
  for a figure-eight when it will not vouch for it, but nothing corrects a bias
  it cannot see. Comparing two phones is the fastest way to be misled: yaw alone
  is measured from each platform's own origin and the two will differ by any
  amount at all while both are working — only `yaw + northOffset`, the "Aim" row
  on the STATUS page, is a bearing.
- **The landmark photographs have not been seen on a device.** Every one of the
  nineteen was checked against Commons as it is written in
  `src/satellite/landmarkPhotos.ts` — the file exists, the lookup resolves, the
  picture it returns is served and is freely licensed, and the crop was looked at
  — but that was a laptop and a browser, not the card on a phone.
  `STARE_LIVE_PHOTOS=1 npx jest landmarkPhotos` re-runs the checking part of that
  against Commons; the rest of the suite mocks the network, as it must. The
  failure is quiet by design: a file renamed out from under the table shows no
  picture, which looks exactly like a phone with no signal.
- **One photograph is 1.7 MB.** Wikimedia will not scale a file up, and the only
  honest picture of a Shenzhou is a PNG barely wider than the card. It is
  downloaded once, only by somebody who taps a Shenzhou, and cached after that —
  but it is twelve times the next largest.
- **A celestial fix is not remembered once the body is gone.** The correction
  lives in the north reference's variance, so the magnetometer takes the heading
  back as that reopens — inside half a minute for a compass the platform grades
  high, five minutes for one it grades unusable. What would outlast it is
  estimating the compass *bias* as a state and carrying it, which is a real
  extension and a riskier one: a remembered bias is wrong the moment the
  magnetic case comes off.

## Licence and attribution

The code in this repository is MIT licensed — see [`LICENSE`](LICENSE). That
covers what is written here and nothing else: the catalog the app downloads, the
photographs it fetches and the model it runs are other people's work, carrying
their own terms, and the notes below say whose and which. None of them is
vendored, so a fork inherits the code freely and the obligations separately.

### The catalog

Orbital elements come from **[CelesTrak](https://celestrak.org)**, which
publishes the general-perturbations catalog maintained by the United States
Space Force's 18th/19th Space Defense Squadron. The underlying data is a work of
the US federal government and carries no copyright in the United States;
CelesTrak, which serves it, asks to be credited and asks not to be hammered. The
app honours both: attribution here, and a two-hour cache that is the rate limit
written down (`src/satellite/`). `testing/fixtures/active.tle` is a dated
snapshot for tests only — see [`testing/fixtures/README.md`](testing/fixtures/README.md).

### The sky model

Occlusion uses **[SkyWater-Seg](https://huggingface.co/Realcat/skywater_seg)**, a
SegFormer MiT-B2 fine-tuned on ADE20K for sky, water and person, published under
the MIT licence. The weights are not in this repository: they are fetched at
first run from a pinned HuggingFace revision named in
`src/vision/skyModelSource.ts`, so the 95 MB never enters the git history and the
file a build gets is the file that was tested. Point
`EXPO_PUBLIC_SKYWATER_MODEL_URL` at a mirror to self-host it.

### The photographs

The nineteen landmark pictures are named files on **[Wikimedia Commons](https://commons.wikimedia.org)**,
fetched on demand rather than bundled (`src/satellite/landmarkPhotos.ts`). Each
carries its own licence — about two thirds are NASA's and in the public domain,
the rest are CC BY, CC BY-SA or CC0 — and the app credits every one of them in
place: the caption is the author and the licence read out of the file's own
metadata, over a link to the Commons page carrying both in full. That crediting
is not decoration; for the CC BY and CC BY-SA files it is the licence condition,
so if you reuse this code and keep the photo card, keep the caption with it.

### The libraries

Runtime work rests on **[satellite.js](https://github.com/shashwatak/satellite-js)**
(SGP4 propagation), **astronomy-engine** (solar and lunar positions), **Expo**
and **React Native**, **@shopify/react-native-skia** (the overlay is drawn on a
Skia canvas) and **onnxruntime** (the model runs on it, natively and on the
web). Of the direct dependencies all are MIT except **jpeg-js**, which is
BSD-3-Clause; per-package terms are recorded in `package-lock.json` and in each
package's own tree.

`patches/expo-camera+57.0.4.patch` is a local modification of expo-camera, MIT
like its original, applied by patch-package at install. It is a fix to capture
and session handling that has not been upstreamed; the workflow in
`.github/workflows/ios-build.yml` verifies it actually reached `node_modules`
before spending a macOS runner on a build, because a patch that silently failed
to apply produces a binary indistinguishable from one where the fix did not work.
