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

/**
 * Capture sizes to try on the still camera, as `expo-camera`'s `pictureSize`,
 * cheapest first. The last one that a device will actually capture at is the
 * one it runs on; see `negotiatePictureSize`.
 *
 * A list rather than a single size because the right answer is not a property
 * of the app, and cannot be read off the phone either. `pictureSize` is not a
 * quality setting: on iOS the string picks the `AVCaptureSession` preset, and
 * the preset is what bounds a capture. `expo-camera` asks the photo output for
 * its full `maxPhotoDimensions` on every shot, so under the default `Photo`
 * preset each sky-mask pass has the phone produce a twelve- to
 * forty-eight-megapixel still — decoded to a bitmap, cropped, re-encoded and
 * decoded again — and then throws all but 320x448 of it away. Bounding that is
 * worth doing wherever it is allowed.
 *
 * It is not allowed everywhere. `expo-camera` builds its session in the view's
 * initializer, before any prop has been seen, so the photo output is created
 * under the `Photo` preset — and on iOS 17 the output's responsive capture and
 * deferred photo delivery are configured there, once, for that preset. The
 * `pictureSize` prop arrives afterwards and lowers the preset without
 * revisiting either. On a phone whose camera supports those features — an
 * iPhone 15 does, an iPhone 12 mini does not — the output is then configured
 * for a capture it can no longer perform, and every later shot fails outright:
 *
 *     CameraImageCaptureException: Image could not be captured
 *
 * Hence the ladder, and hence its last rung: `undefined` is not a preset at
 * all, it is "never write the prop", which leaves the session exactly as
 * `expo-camera` configured it. That is the one configuration every phone can be
 * relied on to capture in. It is the expensive rung, and the loop above it
 * spaces passes end-to-start, so a slower capture simply runs less often rather
 * than piling up.
 *
 * The rungs are not settings on one camera, though, and that is the part it is
 * easy to get wrong: lowering the preset does not just refuse the shot, it
 * leaves the photo output unable to capture at any size, so propping the size
 * back up does not undo it. A rung is only really tried by building a session
 * for it, and only really abandoned by throwing that session away. See
 * `PictureSizeProbe.mount`.
 *
 * Both rungs are 4:3, and that matters more than the pixels: the projection,
 * the mask grid and the fitted frame on screen are all built on the 4:3 shape
 * recorded in `DEVICE_CAMERA`, and the 16:9 presets would quietly re-crop the
 * preview out from under them. 640x480 is the largest preset below `Photo`
 * that is still 4:3; it is comfortably larger than the model input it is
 * resampled to in both directions, so the mask loses nothing, and the visible
 * cost is a softer preview behind the markers, which is the picture rather
 * than the geometry.
 */
export const DEVICE_CAMERA_PICTURE_SIZES = ["640x480", undefined] as const;

/**
 * How long to let a freshly built capture session settle after it reports
 * itself ready, before judging whether the camera can capture at its size.
 *
 * `onCameraReady` says the session is running, not that the `pictureSize` prop
 * has been through it: the preset write is queued behind the session start on
 * `expo-camera`'s own serial queue, with nothing to wait on. So the negotiation
 * waits instead. Long enough for the reconfiguration to land, short enough to
 * be invisible against a boot sequence that has already downloaded a catalog
 * and a segmentation model.
 */
export const DEVICE_CAMERA_PICTURE_SIZE_SETTLE_MS = 400;

/**
 * How long to leave the camera torn down between one session and the next.
 *
 * A rebuild is a teardown and a rebuild of an `AVCaptureSession`, and the two
 * halves run on separate queues: the old session stops on `expo-camera`'s
 * session queue while the new view is already being constructed on the main
 * one. Overlapping them gives the second session a device the first has not
 * finished releasing. Nothing reports when that has happened, so this is a gap
 * rather than a wait.
 */
export const DEVICE_CAMERA_REBUILD_GAP_MS = 250;

/**
 * How long to give a newly built session to report its preview running before
 * treating it as one that will not.
 *
 * `onCameraReady` is the only word there is that a session started, and it
 * never arrives at all when the session failed to configure. Waiting on it
 * unconditionally is a view that shows black forever and a segmentation loop
 * that never gets a first frame to complain about; giving up on it is a rung
 * the negotiation can step over and, on the last rung, a failure the loop can
 * report. Generous, because it is only ever spent on a camera that is already
 * going wrong.
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
