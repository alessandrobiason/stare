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
 */
export const SKY_SEGMENTATION_INTERVAL_MS = 1000;

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
   * back to the foreground, a long GC — would otherwise arrive as one huge
   * `dt` and snap every marker to its target, which is the pop this exists to
   * remove.
   */
  maxStepSeconds: 0.5,
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
  /** Measurement noise of the magnetic bearing to north, in degrees. */
  magneticNoiseDeg: 3,
  /**
   * How fast the magnetic reference may wander, in deg/sqrt(s). Rejecting the
   * bearing's noise is nearly free even at this looseness, so the figure is set
   * by the other end: slow enough to smooth walking past a steel frame, fast
   * enough not to sit a degree behind real drift.
   */
  magneticDriftDegPerRootSecond: 0.4,
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
  maxSampleGapSeconds: 0.5
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
