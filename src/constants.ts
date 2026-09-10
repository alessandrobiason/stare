/**
 * Application-wide tuning knobs, kept together so they are easy to find.
 *
 * The app's, that is. The replay harness keeps its own — the recorded camera it
 * plays back, and the declination where that recording was made — in
 * `testing/replay/constants.ts`, so nothing about a staged recording is in the
 * shipping app's reach.
 */

/**
 * Field of view spanned by a frame extent, in degrees. Derived rather than
 * typed in, because the projection and the sky mask's shift both use it and
 * must agree with each other and with the pixels.
 */
export const fieldOfViewDeg = (extentPx: number, focalLengthPx: number): number =>
  2 * Math.atan(extentPx / 2 / focalLengthPx) * (180 / Math.PI);

/**
 * The phone's own rear camera, as its preview reaches the screen.
 *
 * Nominal, not measured: no API reports the lens, so this is the modern iPhone
 * wide camera — a 4:3 sensor spanning about 68 degrees down its long side —
 * held in portrait. It is the one figure here that guesses at the hardware, and
 * the first to correct if markers sit at the right bearing but the wrong
 * distance from the frame's centre.
 */
export const DEVICE_CAMERA = {
  focalLengthPx: 1067,
  /** Preview size in portrait: the sensor's short side across, long side down. */
  widthPx: 1080,
  heightPx: 1440
} as const;

/*
 * Why the still camera has no capture size set, and where the real fix lives.
 *
 * A note rather than a constant, because what is written down here is the
 * absence of one. Three JavaScript-only attempts were made at the capture
 * failure that kept an iPhone 15 from starting, and all three were wrong in the
 * same way: the fault was never reachable from here.
 *
 *     CameraImageCaptureException: Image could not be captured
 *     (at ExpoCamera/CameraPhotoCapture.swift:130)
 *
 * That line is `didFinishProcessingPhoto` being handed an error by AVFoundation.
 * The cause is automatic deferred photo delivery: on hardware that supports it
 * — an iPhone 15 does, an iPhone 12 mini does not — AVFoundation calls
 * `didFinishCapturingDeferredPhotoProxy` instead, and `expo-camera` implements
 * only the former, so the capture has nothing to resolve it and fails. Expo hit
 * this themselves in 57.0.1 (expo/expo#47728) and fixed it in 57.0.3 by turning
 * deferred delivery off — but inside the responsive-capture guard, which is read
 * mid `beginConfiguration`, before the session runs, where it can still be false
 * on hardware that supports it once the configuration settles. When that guard
 * returns early, deferred delivery is never disabled and every capture fails.
 *
 * There is no prop for any of that. The fix is a native patch, in
 * `patches/expo-camera+57.0.4.patch`, applied by `patch-package` on install.
 * It is therefore in the binary, not the bundle: an OTA update cannot carry it,
 * and shipping it needs a new build.
 *
 * `pictureSize` stays unwritten regardless, and that part of the earlier work
 * stands. On iOS the string picks the `AVCaptureSession` preset, and the preset
 * changes the device's active format — while `expo-camera` goes on handing the
 * photo output's own `maxPhotoDimensions` to every shot. Those dimensions have
 * to match the *current* active format, so writing the prop after the output was
 * configured is a mismatch waiting to happen, and it is a second way to reach
 * the same exception. Nothing here writes it, at any value, and the session
 * stays exactly as `expo-camera` built it.
 *
 * What that gives up is a bounded still, and the cost is transient rather than
 * cumulative: every native image on the path is released by hand and the
 * temporary JPEG deleted, so a pass allocates a great deal and gives all of it
 * back. The thirty-second termination in this app's history was the missing
 * releases rather than the size — the jetsam report that followed it named
 * accumulation, not a spike.
 *
 * How large the still actually is, this note does not claim to know. An earlier
 * version of it asserted twelve to forty-eight megapixels; the AVFoundation
 * header says only that the per-shot default is the smallest supported size and
 * leaves the output's own default unstated, so the figure was a guess dressed as
 * a fact. If memory pressure ever does come back it will come back as the
 * operating system ending the app rather than as this error, and the lever is
 * the interval between passes — `SKY_SEGMENTATION_INTERVAL_MS`, bounded by
 * `SKY_MASK_MAX_AGE_SECONDS` — not this prop.
 */

/**
 * JPEG quality for the still `expo-camera` hands back.
 *
 * Not the quality of anything anyone sees. On the `pictureRef` path the native
 * side encodes the captured image to JPEG and decodes it again to make the ref,
 * and at the default — 1.0 — that is a full-quality encode of a
 * full-resolution bitmap, once a second, for pixels that are about to be
 * resampled to 320x448 and thresholded into a sky mask. Far more detail than
 * survives the resize is being paid for in both directions.
 *
 * Low enough to make that encode cheap, high enough that the resize has real
 * edges to work from: the mask's business is where the sky stops, and blocking
 * artifacts along a roofline are the one thing here that would move it.
 */
export const DEVICE_CAMERA_CAPTURE_QUALITY = 0.4;

/**
 * How long to leave the camera torn down between one session and the next.
 *
 * Generous, because the two halves of a rebuild do not queue behind each other.
 * Each `CameraView` owns a serial queue of its own, so the outgoing view's
 * `stopRunning` — which blocks until the capture graph has actually stopped —
 * runs alongside the incoming view's session setup rather than before it, and a
 * replacement mounted promptly is a second `AVCaptureSession` asking for a
 * camera the first has not finished giving up. That session does not start, and
 * a session that does not start says nothing at all: no error, no
 * `onCameraReady`, just a preview that stays black.
 *
 * Nothing reports when the old one has let go, so this is a gap rather than a
 * wait. It is only ever spent on a camera the segmentation loop has already
 * given up on, so a second and a half of black is cheap against the alternative.
 */
export const DEVICE_CAMERA_REBUILD_GAP_MS = 1500;

/**
 * How long to give a newly built session to report its preview running before
 * treating it as one that will not.
 *
 * `onCameraReady` is the only word there is that a session started, and it
 * never arrives at all when the session failed to configure. Waiting on it
 * unconditionally is a view that shows black forever and a segmentation loop
 * that never gets a first frame to complain about; giving up on it hands the
 * loop a camera to fail against, which is a failure someone eventually sees.
 * Generous, because it is only ever spent on a camera that is already going
 * wrong.
 */
export const DEVICE_CAMERA_PREVIEW_START_TIMEOUT_MS = 6000;

export const DEVICE_CAMERA_FIELD_OF_VIEW = {
  horizontalDeg: fieldOfViewDeg(DEVICE_CAMERA.widthPx, DEVICE_CAMERA.focalLengthPx),
  verticalDeg: fieldOfViewDeg(DEVICE_CAMERA.heightPx, DEVICE_CAMERA.focalLengthPx)
} as const;

/**
 * Elevation below which a satellite is not placed on the frame.
 *
 * Not an occlusion test. What is behind a building is the sky mask's question,
 * and it answers it per cell from the picture itself; below the horizon the
 * geometric cap answers it outright (`src/vision/horizonPrior.ts`). This floor
 * is for the one error the projection does not model — atmospheric refraction,
 * which lifts an object near the horizon above where the geometry puts it.
 * Bennett's formula gives 0.58 degrees of it at the horizon, 11 pixels of this
 * frame and wider than the marker drawn there; by 5 degrees it is 0.17, about
 * 3 pixels, inside the mark's own outline.
 *
 * It stood at 20 degrees, from before there was a mask, stopping the ground
 * from filling with markers by refusing to look near it. That is expensive on a
 * hand-held recording: the camera sits a few degrees below level, so the frame
 * spans roughly the horizon to 25 degrees up, and a 20 degree floor left only a
 * sliver of eligible sky along the top edge — single figures of markers over a
 * frame a third of which was open sky, with the mask hiding none of them.
 */
export const MINIMUM_SATELLITE_ELEVATION_DEG = 5;

/**
 * Tuning for the satellite tracker (`src/satellite/skyTracker.ts`).
 *
 * A full propagation of the active catalog costs ~100 ms, so no cadence runs
 * it on the frame thread without stalling: the tracker sweeps a slice per frame
 * and carries each satellite forward on its velocity in between. These figures
 * set how thinly that work is spread — accuracy at one end, frame budget at the
 * other — measured against the 16k-entry catalog, where one pixel of the
 * displayed frame is about 0.05 degrees of sky.
 */
export const SATELLITE_TRACKING = {
  /**
   * How long one full pass takes, and so the age of the oldest state drawn.
   * Carry-forward error grows with its square: 0.0004 deg at one second, 0.01
   * at five. Two seconds keeps the worst marker inside a fiftieth of a pixel
   * for about 1.5 ms of SGP4 per 60 Hz frame.
   */
  sweepPeriodSeconds: 2,
  /**
   * Most of the catalog one sweep may take on. The slice is sized from the
   * last frame's duration, so without a cap a backgrounded tab would hand one
   * frame the whole catalog and freeze the view as it came back.
   */
  maxSweepFraction: 0.05,
  /**
   * How far below the display mask an object is still tracked every frame:
   * what a satellite can climb between two sweeps of it. The fastest low passes
   * move at ~1.2 deg/s, so two seconds is under three degrees; the rest is
   * slack for slower frames, costing only a few hundred unnecessary transforms.
   */
  candidateElevationMarginDeg: 10,
  /**
   * How far time may move before a state is re-propagated rather than carried
   * forward. Not the working freshness — the sweep keeps that — but the point
   * where the linear term stops standing in, which in practice means a seek.
   * Five seconds of carry-forward is a hundredth of a degree, so merely slow
   * frames never trip it.
   */
  maxExtrapolationSeconds: 5
} as const;

/**
 * How the markers are drawn (`src/components/markerScene.ts`).
 *
 * The overlay has four channels to spend and only one of them is colour, which
 * is fortunate: five categories is already what colour alone can separate.
 * Shape says whether the object holds station, size says how far away it is,
 * an outline keeps the mark readable against any sky, and a label is spent
 * only where it is worth the space.
 */
export const SATELLITE_MARKERS = {
  /**
   * Marker diameter, in frame pixels, at the near and far ends of the range
   * scale.
   *
   * One frame of sky spans about a hundred to one in distance — 1,200 km to
   * 126,000 km — and drawing all of it at one size throws that away, leaving a
   * flat overlay in which the geostationary belt crowds the foreground. Sizing
   * by the logarithm of range puts it back where it belongs, behind
   * everything else.
   */
  nearDiameterPx: 17,
  farDiameterPx: 8,
  /** Range at the near end of the size scale, in kilometres. */
  nearRangeKm: 400,
  /** Range at the far end, two decades further out. */
  farRangeKm: 40000,
  /**
   * How long a trail is, in seconds of orbital motion.
   *
   * The trail is the object's own path, not a decoration: its length is how
   * far the satellite actually travels in this window, so a low pass draws
   * roughly a fifteenth of the frame and a parked satellite draws nothing at
   * all. Long enough to be legible at a glance, short enough that the
   * straight-line approximation holds.
   *
   * The tracker propagates this far *ahead* (`SkyTracker`), and the tail is
   * drawn the same distance behind the mark instead — the reflection of the
   * step rather than a third propagated state per satellite per frame. Over a
   * window this short the difference is far inside the marker itself.
   */
  trailSeconds: 12,
  /** Trails shorter than this, in frame pixels, are not worth drawing. */
  minimumTrailPx: 4,
  /**
   * Half-width and half-height of the box a landmark's label claims, in frame
   * pixels.
   *
   * Only landmarks are labelled, and even they yield to each other: crew and
   * cargo vehicles sit on the station they are docked to, so without this the
   * one place a name matters most is where the names pile up.
   */
  labelClearancePx: { x: 46, y: 11 }
} as const;

/**
 * The landmarks' own orbits, drawn across the sky ahead of them
 * (`src/satellite/orbitPath.ts`).
 *
 * A marker says where an object is and a trail says which way it is going, and
 * for most of the catalogue that is the whole of what is worth saying. The
 * landmarks are the exception, and they are the exception twice over. They are
 * the couple of dozen objects someone would actually wait outside for, and they
 * are the ones whose trail says least: a trail is twelve seconds long, and
 * twelve seconds of the station is a few degrees — a stub that answers "which
 * way" and nothing at all about "when" or "from where". So a landmark carries
 * its path instead: the arc it will trace between rising and setting, drawn
 * whole, with the clock time it starts at.
 *
 * That is also what makes the path worth drawing when its object is nowhere on
 * screen. A marker off the frame is invisible and there is nothing to be done
 * about it but turn the phone and hope; a path off the frame is a line running
 * out of the edge of the view, and following it is how a phone is turned onto
 * something that has not risen yet.
 */
export const LANDMARK_PATHS = {
  /**
   * How far ahead a path is drawn, in hours.
   *
   * Long enough to be a plan for the evening rather than a description of the
   * next few minutes, short enough that what is drawn is still the sky someone
   * is standing under: three hours is two passes of the station over one place,
   * and the second of them is already an hour and a half of the Earth turning
   * away from where the first one was.
   */
  windowHours: 3,
  /**
   * How often the paths are worked out again, in seconds.
   *
   * The whole plan is a couple of thousand propagations (see `searchStepSeconds`),
   * which is a tenth of what a single sweep of the active catalogue costs — but
   * it is not frame work, and it is not spent per frame. What is spent per frame
   * is projecting a few hundred points that were settled a minute ago. The
   * drawn path is trimmed to the present on every frame (`pathFrom`), so a plan
   * this old is not a stale picture: it is the same arc with less of it left.
   */
  refreshSeconds: 60,
  /**
   * How far the observer may move before the paths are worked out again, in
   * metres.
   *
   * Looser than the sky memory's twenty-five (`SKY_MEMORY.observerDriftMetres`)
   * because what moves is different. That grid holds directions to the roof
   * across the street, which crossing the street changes entirely; this holds
   * directions to something four hundred kilometres up, where a walk of a
   * quarter kilometre is under a thousandth of a degree.
   */
  observerDriftMetres: 250,
  /**
   * Step the plan marches at while the object is below the elevation floor, in
   * seconds.
   *
   * This is what a pass is *found* with rather than what it is drawn with, so
   * it is charged against the three-hour window: 45 seconds is 240 propagations
   * per landmark, and a couple of thousand for the tier. The one thing it can
   * miss is a pass shorter than a step, which for anything in low orbit means
   * one that peaks within half a degree of the floor — below
   * `minimumPeakElevationDeg`, and so not drawn even when it is found.
   */
  searchStepSeconds: 45,
  /**
   * How many times the floor crossing is then bisected.
   *
   * Six halvings of a 45-second step is under a second, which is a fraction of
   * a degree of arc: the path starts where the marker will appear rather than
   * up to a step past it.
   */
  crossingRefinements: 6,
  /**
   * How far apart the samples along a path are, in degrees of arc.
   *
   * Spaced by angle rather than by time, because the two are not the same thing
   * on a pass: the station crosses a degree a second overhead and a tenth of
   * that near the horizon, and Chandra takes an hour to cover what the station
   * covers in a minute. Sampling on a clock therefore either draws a corner
   * every few degrees overhead or spends hundreds of propagations on an object
   * that is barely moving. The step is chosen from the object's own angular
   * rate instead, measured between the last two samples.
   *
   * Four degrees is a chord that sags 0.02 degrees from the arc it stands in
   * for — a fifth of a pixel on this frame — and a projection this one maps a
   * great circle to a straight line exactly, so the straight segments drawn
   * between the samples are the path rather than an approximation of it.
   */
  sampleStepDeg: 4,
  /** The step to open with, before there are two samples to measure a rate from. */
  initialStepSeconds: 10,
  /** Bounds on that step, in seconds: fast overhead, slow at the far end. */
  minimumStepSeconds: 2,
  maximumStepSeconds: 300,
  /** Samples one pass may take, whatever the rate says. A stop, not a budget. */
  maximumSamples: 400,
  /**
   * How high a pass has to reach to be worth pointing anyone at, in degrees.
   *
   * Not a visibility test — the mask answers that from the picture — but a
   * question of what a line is *for*. A pass that never clears ten degrees is
   * an arc along the rooftops, and telling someone to look there is telling
   * them to look at a building. The pass already under way is exempt: its
   * object is on the frame and drawing everything about it except the path it
   * is on is worse than drawing a low arc.
   */
  minimumPeakElevationDeg: 10,
  /**
   * How many paths are drawn at once.
   *
   * The limit is legibility rather than cost. Each path is up to a hundred and
   * eighty degrees of sky, so on a sixty-degree frame two or three of them
   * cross the view at any moment; past four the lines start to read as a mesh
   * over the picture rather than as a route each. Which four is decided by
   * breadth first — every landmark's next pass before any landmark's second —
   * so a station that comes round twice cannot take the whole allowance.
   */
  maximumPaths: 4,
  /**
   * When two passes are the same object twice, in seconds and degrees.
   *
   * The catalogue lists a crew ferry separately from the station it is docked
   * to, and both are landmarks, so the station's arc would be drawn three or
   * four times over — same line, same minute, four names stacked at the rise
   * point. Two passes that start within a minute and a half of each other
   * within three degrees of the same piece of sky are one arc, and the entry
   * kept is the one with the lower catalogue number: a ferry is launched to a
   * station, so the station is the older number of the two.
   */
  duplicateSeconds: 90,
  duplicateDeg: 3,
  /**
   * The cadences a time mark may be placed at, in minutes, and how far apart
   * two of them have to fall on the sky.
   *
   * The marks are what turn a line into a timetable — how long the object takes
   * to cross, and how far along it will be when you get outside — so they are
   * placed on round clock minutes rather than at even spacing. Which cadence is
   * chosen is the path's own business: a minute of the station is sixty degrees
   * overhead and a minute of Chandra is a fifth of one, so the coarsest that
   * keeps two marks a hand's width apart would be unreadable on one and the
   * finest would be a smear on the other. The first cadence whose marks clear
   * twelve degrees wins.
   *
   * An object slower than the coarsest of them still gets one mark, in the
   * middle of its arc. It is the only thing on a path that says which way the
   * object is going, and a line that does not say that is a line someone has to
   * guess at — which is exactly what a fifteen-degree arc of Chandra looked
   * like before it had one.
   */
  tickMinutes: [1, 2, 5, 10, 15, 30, 60],
  tickSeparationDeg: 12,
  /**
   * Line width, in frame pixels at `DESIGN_FRAME_WIDTH_PX`.
   *
   * Thinner than anything else the overlay draws. A path is the longest shape
   * on the frame by two orders of magnitude — a marker is seventeen pixels and
   * an arc is two thousand — so it carries its weight in length rather than in
   * width, and a line drawn at the width of a trail would be the loudest thing
   * on a photograph of the sky.
   */
  widthPx: 2,
  /**
   * The time mark itself: an arrowhead, this long along the path and this far
   * across it, at the design width.
   *
   * A chevron rather than the cross-stroke this was, because a stroke across a
   * line answers "when" and leaves "which way" to be guessed — and which way is
   * the first thing anyone asks of a line drawn across the sky. A satellite
   * with an arc through it could be going either way along it, and the marker's
   * own tail is a dozen pixels of tell at the one end of it.
   *
   * Two strokes meeting at a point, with the point *on* the round minute rather
   * than centred over it: what the mark says is that the object is there at that
   * time, heading that way. Nine by six is a 34-degree half-angle, which is the
   * shallowest that still reads as an arrowhead at the five or six pixels a
   * phone actually draws it at; wider looks like a bird, narrower like a kink in
   * the line.
   */
  arrowLengthPx: 9,
  arrowSpreadPx: 6,
  /**
   * How solid the line is at each end of the window: the pass under way, and
   * one three hours out.
   *
   * The fade is the only thing on the path that says *when* without being read:
   * the arc of the object crossing now is the one nearly opaque line on the
   * frame, and the one that comes round after midnight is a ghost of it. It
   * also settles what happens as an hour goes by, which is that a path brightens
   * as its pass approaches rather than appearing when it arrives.
   */
  nearOpacity: 0.8,
  farOpacity: 0.25
} as const;

/**
 * Tapping a marker to read what it is (`src/components/markerHitTest.ts`).
 *
 * The overlay says what a satellite is *for* with colour and how far away it is
 * with size, and there it stops: a couple of dozen objects carry a name and the
 * other sixteen thousand carry none. A tap is how the rest of it is asked for,
 * and the two figures here are what a finger makes of a sky drawn at these
 * sizes.
 *
 * In layout pixels, and deliberately not scaled to the frame — unlike every
 * size in `SATELLITE_MARKERS`, which is quoted against `DESIGN_FRAME_WIDTH_PX`.
 * A marker is drawn smaller on a smaller frame; a fingertip is not.
 */
export const MARKER_SELECTION = {
  /**
   * How far from a marker's centre a tap still counts as hitting it.
   *
   * Half of the 44-point target Apple's guidelines put a floor at, which is
   * about what a fingertip actually covers. The markers themselves are 8 to 17
   * pixels across, so without this the far half of the catalogue would be a
   * four-pixel radius target, and a tap would mostly be a miss.
   */
  tapRadiusPx: 22,
  /**
   * The same, for the name written along a landmark's path.
   *
   * The reason a name is a target at all is the case the paths exist for: an
   * object that has not risen has no mark to tap, and its name on the line is
   * the only thing on the frame that is about it. Someone reading `SOYUZ-MS 33`
   * off a line running out of the top of the view is asking who that is, and
   * before this there was nowhere to ask.
   *
   * Larger than a mark's, because what is being aimed at is larger: the name is
   * set below its anchor and runs to two lines (`ARC_LABEL_GAP_PX`), so a target
   * the size of a marker's would cover the point on the line and none of the
   * writing under it. A disc rather than the box the name is set in, because a
   * label turns with the camera roll — a rectangle would be the right target
   * only with the phone held level, and the sky is read with it tilted.
   */
  nameTapRadiusPx: 40,
  /**
   * How many satellites one tap may offer to choose between.
   *
   * A finger over the geostationary belt covers a dozen markers, and a list
   * that long is not a choice anyone makes — it is a scroll through names that
   * all look alike. The nearest few to where the tap landed are the ones that
   * were plausibly aimed at; past that, aiming more precisely is the better
   * answer, and zooming is not a thing this view does.
   */
  maxCandidates: 5
} as const;

/**
 * Quiet left between sky segmentation runs, measured end-to-start rather than
 * as a rate: a pass takes roughly this long itself, so as a period it would
 * leave no gap at all. See `startSegmentationLoop`.
 *
 * This is the gap for a camera that is still, which is the case the gap was
 * chosen for: nothing in front of a phone lying on a table changes, and a pass
 * spent on it buys nothing. A camera that has been turned is the opposite case
 * — see `SKY_SEGMENTATION_MINIMUM_INTERVAL_MS`.
 */
export const SKY_SEGMENTATION_INTERVAL_MS = 1000;

/**
 * The shortest that gap may be cut to when the mask has been left behind.
 *
 * The mask maps the sky rather than the screen, so turning the phone does not
 * make it wrong — it makes it *smaller*, until the part of the view it can
 * answer for is not the part being looked at. Waiting out a full second of
 * quiet in that state is the one case where the gap is pure lag: the sky on
 * screen is unmapped, the markers over it are not drawn, and the segmenter is
 * deliberately idle. So the loop polls during the gap and starts the next pass
 * as soon as the view has turned off the mask's aim by
 * `SKY_MASK_CHASE_FRACTION` of the frame.
 *
 * A floor rather than no gap at all, and the floor is the memory bound. Every
 * pass is a full-resolution still — see the note above on why the capture size
 * is left unwritten — which is a large transient, and that note names the
 * interval between passes as the lever to reach for if memory pressure ever
 * returns. Chasing shortens it and so pulls that lever the wrong way, which is
 * affordable only because it is bounded: a pass's own cost is most of the cycle
 * either way, so the floor buys back perhaps a third of the period rather than a
 * multiple of the rate, and only while the phone is actually being moved. If the
 * app does start being killed, raise this before raising anything else.
 *
 * Not applied after a failed pass, which keeps its own budget — see
 * `MAX_CONSECUTIVE_FAILURES`, whose eight strikes are eight seconds only for as
 * long as a failure waits the full gap.
 */
export const SKY_SEGMENTATION_MINIMUM_INTERVAL_MS = 300;

/**
 * How far the view may turn off the mask's aim before the next pass is due, as
 * a fraction of the narrower of the frame's two fields of view.
 *
 * An eighth is about seven degrees on this camera, which is well past what a
 * hand holding a phone still produces and is reached within a fraction of a
 * second of a deliberate pan. Larger, and a turn is left showing a band of
 * undrawn sky down one side; smaller, and the sensor's own noise would be
 * enough to keep the camera capturing while nobody is moving.
 */
export const SKY_MASK_CHASE_FRACTION = 1 / 8;

/**
 * How old the newest sky mask may be before it stops being trusted.
 *
 * A pass that never returns would otherwise leave the last mask in place for as
 * long as the app is open, and a map of where the buildings were a minute ago is
 * worse than no map: it hides satellites that are in the clear and shows ones
 * that are not. Past this the mask is dropped and the markers stop with it.
 */
export const SKY_MASK_MAX_AGE_SECONDS = 8;

/** Confidence at or above which a mask cell counts as open sky. */
export const SKY_CONFIDENCE_THRESHOLD = 0.5;

/**
 * The sky the phone has already looked at, kept after the mask that saw it has
 * been replaced (`src/vision/skyMemory.ts`).
 *
 * A mask covers the frame it was cut from and nothing else, so every pass
 * throws away what the last one learned about the sky either side of it. What
 * that costs is the whole of the delay in panning: turn the phone and the new
 * sky has no reading until a pass lands on it — a second or two — and turn back
 * and the sky that was mapped a moment ago has to be looked at again, because
 * the only mask in existence is now aimed somewhere else.
 *
 * Nothing about that second wait is honest. The buildings did not move while
 * the phone was pointed away from them, and a reading taken twenty seconds ago
 * from the same spot is the same reading. So each pass is also written into a
 * grid fixed to the sky rather than to the frame, and a direction the live mask
 * cannot answer for is asked of that instead — which makes turning back
 * immediate and leaves only genuinely unlooked-at sky waiting on the segmenter.
 *
 * The two things that can invalidate it are time and the observer moving, and
 * both are bounded here rather than trusted.
 */
export const SKY_MEMORY = {
  /**
   * Cell size of the remembered grid, in degrees of azimuth and elevation.
   *
   * The mask's own resolution: 3,600 cells over this camera's 54 x 69 degree
   * frame is almost exactly a degree either way, so a finer grid would store
   * detail no pass ever put there and a coarser one would throw away edges the
   * model did resolve.
   */
  cellDeg: 1,
  /**
   * Lowest elevation the grid covers, in degrees. Below the horizon there is
   * nothing to remember, and `MINIMUM_SATELLITE_ELEVATION_DEG` keeps every
   * marker well above this — the margin is only so that a marker at the floor
   * still has cells beneath it to interpolate between.
   */
  floorElevationDeg: 0,
  /**
   * How long a remembered reading is trusted, in seconds.
   *
   * Not how long a roof stays where it is — that is indefinite — but how long
   * this app is willing to answer for a hand-held phone without having looked
   * again. A minute and a half covers panning around the sky and coming back,
   * which is what this is for, and expires anything left over from a walk that
   * did not trip `observerDriftMetres`.
   */
  maxAgeSeconds: 90,
  /**
   * Share of a direction's four surrounding cells that must carry a live
   * reading before the memory answers for it at all.
   *
   * The reading is interpolated between cell centres, as the mask's own is, so
   * the edge of the remembered region has directions with one or two of their
   * four neighbours filled. Answering from those means extrapolating the sky
   * beyond where anything looked; a half is the point at which the direction is
   * more inside the mapped region than outside it.
   */
  minimumCoverage: 0.5,
  /**
   * How far the observer may move before everything remembered is dropped, in
   * metres.
   *
   * The grid is a map of directions, and directions to nearby buildings are
   * only fixed while the observer is. Measured from where the memory was
   * started rather than from the last fix, so a slow walk accumulates instead
   * of being absorbed a metre at a time. Horizontal only: a phone's GPS
   * altitude wanders by more than this on its own while sitting still.
   */
  observerDriftMetres: 25
} as const;

/**
 * How long a marker holds its answer to "am I behind something"
 * (`src/vision/markerVisibility.ts`).
 *
 * The segmenter looks at one isolated frame a second, so a cell whose real
 * confidence sits near `SKY_CONFIDENCE_THRESHOLD` — the sky just past a roof
 * line, a thin branch, a wall the exposure keeps changing its mind about —
 * flips from pass to pass while the phone is barely moving. Read as a plain
 * threshold, every marker in that cell flips with it, which is whole groups of
 * satellites blinking in and out of a still frame.
 *
 * Two mechanisms, and they answer different halves of that:
 *
 * 1. **A low pass per marker.** Each one carries its own smoothed confidence,
 *    so what decides its fate is the run of mask passes over the piece of sky
 *    it is actually crossing rather than the newest one alone.
 * 2. **A band, not a line.** A hidden marker needs `showConfidence` to come
 *    back and a drawn one needs to fall past `hideConfidence`, so a value
 *    hovering at the threshold changes nothing at all.
 *
 * Together they cost the mask two agreeing passes to move a marker. At a
 * one-second cadence, one stray pass carries the smoothed value 1 - e^(-1/1.2)
 * = 0.57 of the way to it: from open sky at 0.95 a single bad reading lands at
 * 0.41, comfortably above `hideConfidence`, and a mask alternating clear and
 * blocked settles at 0.30 without ever reaching it. Two bad passes in a row
 * reach 0.18 and the marker goes. Real occlusion therefore takes about two
 * seconds to be believed, which is the price of not blinking; at the ~1.2
 * deg/s of the fastest low pass that is a couple of degrees of sky, and
 * geostationary objects do not move at all.
 *
 * The band is symmetric about `SKY_CONFIDENCE_THRESHOLD` for the same reason:
 * whatever a run of passes does to a drawn marker, the mirror of that run has
 * to do the same to a hidden one, or the sky quietly fills up or empties out.
 *
 * The change itself is then a crossfade rather than a pop, because a marker
 * that vanishes between two frames reads as a glitch even when it is right.
 *
 * None of it applies to a direction the mask has no reading for — sky the phone
 * has turned onto ahead of the segmenter (`AnchoredSkyMask`). Both mechanisms
 * are for arbitrating between successive *answers* about one piece of sky, and
 * there is no answer to arbitrate: the marker keeps what the last pass that
 * could see it decided, and simply is not drawn until a pass covers it again.
 * Fed in as a nought instead, it would cost `confidenceTimeConstantSeconds` and
 * the width of the band before anything happened — the better part of two
 * seconds with a satellite on screen over a building nobody has looked at.
 */
export const MARKER_VISIBILITY = {
  /** Time constant of the per-marker confidence low pass, in seconds. */
  confidenceTimeConstantSeconds: 1.2,
  /** Smoothed confidence a hidden marker must reach to be drawn again. */
  showConfidence: 0.75,
  /** Smoothed confidence a drawn marker must fall below to be hidden. */
  hideConfidence: 0.25,
  /** How long a marker takes to fade all the way in or out, in seconds. */
  fadeSeconds: 0.35,
  /**
   * Longest step the filter integrates over. A stalled frame — the app coming
   * back to the foreground, a long GC, a sky pass decoding its JPEG — would
   * otherwise arrive as one huge `dt` and snap every marker to its target,
   * which is the pop this exists to remove.
   *
   * Under `fadeSeconds`, and by a good margin, because that is what makes the
   * sentence above true rather than merely intended: a step at or above the
   * fade *is* the snap, so a cap set above it stops nothing at all. This was
   * half a second — long enough for one 200 ms frame, which a chased mask pass
   * can produce while the phone is being turned, to cut a marker outright and
   * leave it fading back in. A frame this long is already a stall rather than a
   * slow frame: at 60 Hz it is six of them, and the display does not produce
   * one while it is keeping up.
   */
  maxStepSeconds: 0.1,
  /** Below this opacity a marker is not worth drawing, and counts as hidden. */
  minimumDrawnOpacity: 0.02
} as const;

/**
 * Tuning for the attitude fusion filter (`src/fusion/orientationFilter.ts`).
 *
 * Fitted against a real recording, whose noise floor is measurable: each
 * channel's high-frequency residual is the same size still or turning, which is
 * sensor noise rather than motion. Heading is the channel that pays — its
 * magnetic term is near-white at frame rate, and these values cut its shimmer
 * about fivefold for a tenth of a degree of lag. Pitch and roll carry a slow
 * correlated error no smoothing removes, so they track closely instead.
 */
export const ORIENTATION_FILTER = {
  /** Measurement noise of the yaw channel, in degrees. */
  headingNoiseDeg: 0.15,
  /** Measurement noise of the pitch channel, in degrees. */
  pitchNoiseDeg: 0.18,
  /** Measurement noise of the roll channel, in degrees. */
  rollNoiseDeg: 0.18,
  /**
   * Measurement noise of the magnetic bearing to north, in degrees, for a
   * compass the platform has said nothing about — a recording, or the seconds
   * before the first heading arrives. Fitted against a recording made with a
   * well-calibrated phone, so it is the figure a *good* compass earns; see
   * `magneticNoiseByCompassAccuracy` for the rest of them.
   */
  magneticNoiseDeg: 3,
  /**
   * The same noise by what the platform says about its own calibration, indexed
   * by accuracy level: 0 unusable, 3 high (`CompassReading`).
   *
   * Roughly half of each level's documented uncertainty band — 3 is better than
   * 20°, 2 than 35°, 1 than 50° — read as a bound of about two sigma. The point
   * is not the exact figures but the ratio: at level 0 the north reference
   * moves about a hundredth as fast per reading as at level 3, so a phone whose
   * magnetometer has been captured by a magnet drifts slowly on the gyro
   * instead of being yanked forty degrees off by a bearing that is not one.
   *
   * It still converges — the reference is a random walk, and a steady wrong
   * bearing eventually wins — because the alternative is a compass that has
   * genuinely moved never being believed. What it buys is time for the platform
   * to recalibrate, and for `COMPASS_ACCURACY` to have said so on screen.
   */
  magneticNoiseByCompassAccuracy: [40, 20, 10, 3],
  /**
   * How fast the magnetic reference may wander, in deg/sqrt(s). Rejecting the
   * bearing's noise is nearly free even at this looseness, so the figure is set
   * by the other end: slow enough to smooth walking past a steel frame, fast
   * enough not to sit a degree behind real drift.
   */
  magneticDriftDegPerRootSecond: 0.4,
  /**
   * How long a phone compass's error stays the same, in seconds — the window
   * over which its readings are one measurement rather than many.
   *
   * The readings arrive around forty a second and used to be fused at forty a
   * second, which quietly asserted that each was fresh evidence about where
   * north is. They are not. What is wrong with a phone compass is a *bias* — a
   * magnet in a case, a steel desk, another phone on the same table — and a
   * bias does not average away. Forty readings a second of the same captured
   * field is one piece of information repeated forty times, and counting it
   * forty times is what let the reference settle to a standard deviation of
   * half a degree around a bearing that was thirty degrees wrong.
   *
   * That overconfidence is not academic: it is exactly why two phones side by
   * side each hold a different heading and neither wavers. It is also what a
   * sighting of the sun has to argue against, and against forty readings a
   * second the sighting loses on arithmetic however much sharper it is.
   *
   * So the noise a magnetic bearing is fused with is widened by the square root
   * of how many readings fall inside this window, which is the standard
   * correction for correlated samples and leaves the *rate* of information
   * unchanged at one honest reading per window. Widening rather than dropping
   * readings, because a compass whose noise happens to be periodic — and a
   * phone's is, at the frame rate — would be aliased by taking every nth one,
   * and sampled at the wrong phase a systematic error is what comes out.
   *
   * Half a second is well inside the drift the reference is allowed anyway
   * (`magneticDriftDegPerRootSecond`), so the compass keeps its whole job of
   * carrying the heading between sightings and loses only the authority it
   * never had.
   */
  magneticCorrelationSeconds: 0.5,
  /**
   * Shortest reading interval the widening above will assume, in seconds.
   *
   * Two readings arriving at the same timestamp — the first of a session, or a
   * motion and a magnetometer sample publishing together — would otherwise
   * divide by nothing. A hundred hertz is faster than either sensor is asked
   * for (`UPDATE_INTERVAL_MS`), so it bounds the widening without ever being
   * the figure in normal running.
   */
  minimumMagneticIntervalSeconds: 0.01,
  /** Angular acceleration allowed while the device is still, in deg/s^2. */
  baseAngularAccelerationDegPerSecondSquared: 10,
  /** Extra angular acceleration allowed per deg/s of measured turn rate. */
  angularAccelerationPerDegPerSecond: 2,
  /**
   * Share of the gyro's total rate counted towards one axis's process noise.
   * The gyro is not resolved onto the Euler axes, so its whole magnitude would
   * unlock every axis at once; a quarter registers that motion has begun before
   * the rate states catch up.
   */
  gyroRateShare: 0.25,
  /** Longest the view will coast on the rate estimate before it just holds. */
  maxExtrapolationSeconds: 0.1,
  /** Gap beyond which the filter restarts instead of fusing across it. */
  maxSampleGapSeconds: 0.5,
  /*
   * The next three bound the rate estimate by what the gyro says the phone is
   * actually doing, and they are here because of one failure.
   *
   * A reading is stamped when it is *handled* (`useSmoothedOrientation`), which
   * is the only clock the render loop shares with it. Handling is not when the
   * sensor took it: block the JavaScript thread — a sky pass decoding its JPEG,
   * a long GC — and every reading taken during the block arrives afterwards,
   * back to back, each stamped a fraction of a millisecond after the last. What
   * the filter is then handed is a device that turned seven degrees in half a
   * millisecond, and a constant-velocity filter believes it: the rate state went
   * to four and then thirty *thousand* degrees a second, and `sample` coasted a
   * tenth of a second on that, which put the drawn heading 30 to 170 degrees
   * from where the phone was pointing. The markers left the frame, and with the
   * frame empty every visibility track was forgotten and faded back in from
   * nothing — the fraction of a second of empty sky this whole block is for.
   * Only ever while turning, because the lie is (angle change)/(interval) and a
   * still phone has no angle change to divide.
   *
   * The gyro is the answer, because it measures the turn rate directly rather
   * than inferring it from two angles and a timestamp. It is not resolved onto
   * the Euler axes — the reason it only lends `gyroRateShare` to the process
   * noise — but it does bound them: with the body turning at w, the pitch rate
   * is at most w, and the heading and roll rates at most w/cos(pitch), which
   * dominates every one of the three. So a rate outside that band is not fast
   * motion, it is a timestamp that is not describing the reading it came with.
   */
  /**
   * Rate allowed on an axis beyond the gyro's bound, in deg/s. Slack for the
   * gyro's own noise, for the reading it is a moment out of step with, and so
   * that a phone the gyro reports as still can still be tracked. Small enough
   * that coasting the whole `maxExtrapolationSeconds` on it is a few degrees.
   */
  rateSlackDegPerSecond: 45,
  /**
   * Smallest `cos(pitch)` the bound above is evaluated at, so an axis pointed
   * at the zenith — where heading and roll are the same rotation and both are
   * divided by nothing — has a finite bound rather than no bound at all. 0.1 is
   * 84 degrees up, past which the cap is eleven times the gyro's magnitude.
   */
  verticalPitchCosineFloor: 0.1,
  /**
   * The bound where a reading carries no gyro at all, in deg/s.
   *
   * Every source that aims this view does carry one — the phone's
   * `DeviceMotion`, and the recording's own stream — so this is the backstop
   * rather than a working figure, and it is set where hand motion stops instead
   * of where the sensor does: a flick of the wrist is a few hundred degrees a
   * second, and nothing holding a phone reaches this.
   */
  maxRateWithoutGyroDegPerSecond: 720
} as const;

/**
 * What the app makes of the platform's own verdict on its compass
 * (`CompassReading.accuracy`).
 *
 * The levels are worth saying out loud because a compass is the one sensor here
 * that fails silently and plausibly. A hard-iron bias — a magnetic case, a car
 * door, a phone lying next to this one — is indistinguishable from the field it
 * corrupts, and it does not shimmer or drop out: the sky is simply drawn
 * somewhere else, steadily, and looks fine. At these latitudes the horizontal
 * field is only about half the total (the rest is the dip), so 13 µT of bias is
 * already thirty degrees of heading.
 *
 * `warnAtOrBelow` is 2 rather than 1 because of what level 2 licenses: 35° of
 * uncertainty against a frame `DEVICE_CAMERA_FIELD_OF_VIEW` wide is most of the
 * screen, so a satellite drawn under it can be off the picture entirely. That
 * is not a degraded view, it is a wrong one, and it is worth a line over the
 * sky — one the phone can act on, and which goes away when it does, unlike
 * boot's warnings (see `DebugToggle`).
 */
export const COMPASS_ACCURACY = {
  /** At or below this level the view says the compass needs calibrating. */
  warnAtOrBelow: 2,
  /** What each level is called, indexed by it, for the readouts. */
  names: ["unusable", "low", "medium", "high"]
} as const;

/**
 * How the sun and the moon are turned into a bearing, and how far that bearing
 * is trusted (`src/fusion/celestialNorth.ts`).
 *
 * The compass is the only thing aiming this view that has no check on it. It
 * fails silently and plausibly (`COMPASS_ACCURACY`), the platform's own grade of
 * it is a coarse four-level guess, and nothing else on the phone knows which way
 * is north. But something in the picture does: on a clear day the sun is in the
 * frame, its bearing is known to an arcminute from the clock and the GPS fix,
 * and the difference between where it is drawn and where it is seen is the
 * compass error outright — no calibration, no figure-eight, and nothing for the
 * person holding the phone to do.
 *
 * The figures below are all about not believing the wrong bright thing. A
 * street lamp, a window catching the sun and the moon are the same blob to a
 * threshold, and a sighting that is accepted is worth thirty degrees of heading,
 * so the gates are set to throw away far more than they let through.
 */
export const CELESTIAL_ALIGNMENT = {
  /**
   * How far above the horizon a body must be before it is looked for.
   *
   * Below this the sighting is worth little and wrong often: refraction is
   * lifting the disc by a third of a degree and rising, the air is thick enough
   * to redden and spread it, and the horizon is where the lamps, headlights and
   * lit windows that could be mistaken for it all live.
   */
  minimumAltitudeDeg: 10,
  /**
   * And how far up it stops being a bearing at all.
   *
   * Azimuth is ill-conditioned near the zenith — the same angular error in the
   * sighting spans `1 / cos(altitude)` times as much of it — so a sun overhead
   * says almost nothing about which way the phone is facing. The noise model
   * below already carries that factor; this is where it has grown large enough
   * (about three) that the sighting is not worth the risk of having found the
   * wrong thing.
   */
  maximumAltitudeDeg: 70,
  /**
   * How far the sighting's own elevation may sit from the ephemeris before it
   * is thrown away.
   *
   * This is the gate that does nearly all the work, and it is free: elevation
   * comes from pitch and roll, which are gravity's, and gravity is not what is
   * wrong with a compass. It is also independent of the heading being solved
   * for — turning the phone about the vertical moves a ray's azimuth and leaves
   * its elevation alone — so it tests the sighting without assuming the answer.
   *
   * A street lamp at four degrees is not a sun at forty; a reflection in a
   * window is at the wrong height almost always. Four degrees covers the
   * attitude filter's own error and the lens being assumed rather than
   * measured, and admits very little else.
   */
  elevationAgreementDeg: 4,
  /**
   * The largest heading correction a sighting is allowed to ask for.
   *
   * A compass captured by a magnet is tens of degrees out, which is the whole
   * point of this, so the bound has to be generous. Past it the disagreement is
   * more likely to be a sighting of the wrong object than a compass that wrong,
   * and adopting it would swing the view somewhere new and confident.
   */
  maximumCorrectionDeg: 80,
  /**
   * How far two consecutive sightings may disagree and still count as the same
   * body seen twice.
   *
   * Nothing is fed to the filter on one sighting. Two agreeing is what
   * separates the sun from the one bright thing that happened to pass every
   * other gate: a false positive has to be repeated, at the same implied
   * bearing, from a frame the phone has usually moved between — which a
   * reflection does not manage and the sun does trivially.
   */
  agreementDeg: 3,
  /**
   * How long a sighting stands as something for the next one to agree with.
   *
   * Longer than the gap between segmentation passes by enough to survive a few
   * failed ones, and short enough that two sightings either side of it are not
   * treated as consecutive: the phone can be carried a long way in half a
   * minute, and the agreement test assumes the two are of the same sky.
   */
  holdSeconds: 20,
  /**
   * Angular error assumed in a sighting at the centre of the frame, in degrees,
   * before the two terms below are applied.
   *
   * Covers the centroid — the disc is a few pixels across at the model's input
   * size and its centre is found to well inside one — together with the pitch
   * and roll the ray is built from. It is deliberately several times the
   * arcminute the ephemeris itself is good to: what is uncertain here is the
   * phone, never the sky.
   */
  baseNoiseDeg: 0.4,
  /**
   * Extra angular error per degree away from the centre of the frame, as a
   * fraction of that angle.
   *
   * The lens is assumed rather than calibrated — `DEVICE_CAMERA` is one focal
   * length for every phone the app runs on — so a sighting's angle off the
   * optical axis is only as good as that figure. The error is proportional to
   * the angle, which is what makes a body near the middle of the frame worth
   * several near its corner, and the filter weighs them accordingly instead of
   * the code having to choose.
   */
  lensNoiseFraction: 0.04,
  /**
   * Luminance below the frame's brightest pixel at which a blob stops being
   * part of it, and the floor no blob may be dimmer than.
   *
   * Relative rather than absolute because the same numbers have to find a sun
   * that has saturated the sensor and a moon that has not. Both are the
   * brightest thing in their own frame by a distance; nothing else in daylight
   * is within forty counts of the sun, and at night the moon clears the sky
   * around it by far more than that.
   */
  peakDropCounts: 40,
  minimumPeakLuminance: 150,
  /**
   * Bounds on the disc, as the angular radius of a circle of the blob's area.
   *
   * The sun and the moon are both about a quarter of a degree in radius and the
   * camera makes both bigger — a saturated sun blooms across a good part of a
   * degree, more through haze. The floor throws out a hot pixel and a distant
   * lamp; the ceiling throws out the case this would otherwise fail worst on, a
   * bright overcast where a whole quarter of the sky passes a relative
   * threshold and its centroid is nothing at all.
   */
  minimumRadiusDeg: 0.1,
  maximumRadiusDeg: 6,
  /** Pixels a blob must cover before its centroid is worth taking. */
  minimumBlobPixels: 4,
  /**
   * How many bright blobs are pulled out of a frame and offered to the gates.
   *
   * More than one because the brightest thing in the frame is not always the
   * one being looked for — a window returning the sun can out-read the sun
   * itself once the sun is behind haze — and the gates, not the ranking, are
   * what decides. Kept small because each one costs a flood fill, and because a
   * frame that needs more than a few has too much in it to be sure about: a
   * body is only accepted when exactly one candidate passes.
   */
  candidateBlobs: 4,
  /**
   * How long after the last sighting the heading is still the sky's rather than
   * the compass's, in seconds.
   *
   * Not a property of this code but a measurement of what the filter does with
   * it. A sighting collapses the north reference's variance; the random walk
   * then reopens it (`magneticDriftDegPerRootSecond`) and the magnetometer
   * gradually takes the reference back. How gradually depends on the grade: a
   * compass the platform vouches for reclaims it inside half a minute, one it
   * grades unusable takes five.
   *
   * Thirty seconds is the fast end of that, which is the safe end for what this
   * is used for — deciding whether to stop asking someone to calibrate a
   * compass that is no longer aiming anything. Wrong in this direction, the app
   * asks for a figure-eight that was not needed; wrong the other way, it stays
   * silent about a compass that has quietly taken the sky back.
   */
  fixStandsForSeconds: 30
} as const;

/**
 * How long a downloaded TLE catalog is served before a refresh is attempted.
 *
 * CelesTrak asks that the active catalog be pulled at most once every couple of
 * hours and blocks clients that ignore it. The window only holds if it outlives
 * the process, so the download time is persisted with the catalog — see
 * `src/data/tleStore.ts`.
 */
export const TLE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * How long to wait before retrying a failed download. Shorter than the refresh
 * interval, so a dropped connection is not punished for two hours, but long
 * enough that an offline app is not hammering the server every launch.
 */
export const TLE_RETRY_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Shortest time the boot screen stays up on a cold start, in milliseconds.
 *
 * Boot's five steps race each other (`runBootSequence`), and a warm cache can
 * clear all of them in a couple of hundred milliseconds — too fast for the
 * turning sky (`BootSky`) to read as anything but a flash. It is the app's
 * one moment of its own before the camera takes the screen, so it holds for
 * this long regardless of how quickly the work underneath it finishes. See
 * `useAppBoot`.
 */
export const MIN_BOOT_SCREEN_MS = 2500;
