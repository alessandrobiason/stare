import {
  MINIMUM_SATELLITE_ELEVATION_DEG,
  SATELLITE_TRACKING,
  SKY_CONFIDENCE_THRESHOLD,
  SKY_SEGMENTATION_INTERVAL_MS,
  SKY_SEGMENTATION_MINIMUM_INTERVAL_MS,
  TLE_REFRESH_INTERVAL_MS,
  TLE_RETRY_INTERVAL_MS
} from "../constants";
import { CameraAttitude } from "../camera/attitude";
import { CachedCatalog } from "../data/tleCache";
import { DeviceCapabilities } from "../device/capabilities";
import { DeviceOrientation } from "../device/deviceOrientation";
import { MarkerStats } from "../hooks/useAnimatedMarkers";
import { SkySegmentationStats } from "../hooks/useSkySegmentation";
import { SkyTrackerStats } from "../satellite/skyTracker";
import { ObserverLocation } from "../types";
import { AnchoredSkyMask, maskOffsetDeg } from "../vision/anchoredMask";
import { refinedCellCount, skyCoverage } from "../vision/skyMask";
import { SkyMemoryStats } from "../vision/skyMemory";
import { bytes, clockTime, degrees, duration, fixed, NONE, position, vector } from "./format";

/**
 * The debug overlay's pages, and the figures on them.
 *
 * A scene supplies its own first page — where its attitude is coming from — so
 * the replay harness adds the recorded streams (`testing/replay/debugSections.ts`)
 * without anything here knowing it exists.
 */

/**
 * One labelled figure in the debug overlay.
 *
 * `wrap` is for the values that are sentences rather than figures — boot's
 * warnings, mostly. A figure is clipped to its line because a table of them
 * only reads as a table if the rows are one line each; a warning clipped to its
 * line is a warning nobody can act on.
 */
export type DebugRow = { label: string; value: string; wrap?: boolean };

/**
 * One switch on a page: something the overlay can turn off, rather than another
 * figure about it.
 *
 * The panel samples its sections on a timer, so `on` is read the same way as a
 * row's value — the switch shows what the view is actually doing rather than
 * what it was last told to do.
 */
export type DebugSwitch = { label: string; on: boolean; onToggle: () => void };

/**
 * One page of the debug overlay: a tab and what it shows. Sections are what the
 * panel's menu is built from, so a scene adds a page by returning another one.
 *
 * `switches` are drawn above the figures, because a page's controls are what
 * the rest of it is then reporting on.
 */
export type DebugSection = {
  id: string;
  title: string;
  rows: DebugRow[];
  switches?: DebugSwitch[];
};

/**
 * Everything the overlay would show, as of now.
 *
 * A function rather than a value because the panel samples it on its own slow
 * timer: the figures behind it change per animation frame, and re-rendering a
 * screenful of text at that rate would cost more than the view it is reporting
 * on.
 */
export type DebugSource = () => DebugSection[];

export type StatusDebugInput = {
  /** The scene's own readouts, in the order they should be read. */
  rows: DebugRow[];
  /** Whatever boot could not settle, in its own words. */
  warnings: string[];
};

/**
 * Where the view stands: what it is drawing over, from where, and what is
 * missing.
 *
 * This is the panel that used to sit over the sky in the corner. It reads as a
 * readout rather than as part of the picture, which is what these pages are
 * for, and the normal view keeps only the marker count — the one figure there
 * that is about the sky rather than about the machinery behind it.
 */
export function statusSection({ rows, warnings }: StatusDebugInput): DebugSection {
  return {
    id: "status",
    title: "STATUS",
    rows: [
      ...rows,
      ...warnings.map((warning, index) => ({
        label: warnings.length > 1 ? `Warning ${index + 1}` : "Warning",
        value: warning,
        wrap: true
      }))
    ]
  };
}

export type MaskDebugInput = {
  mask: AnchoredSkyMask | null;
  error: string | null;
  stats: SkySegmentationStats;
  /**
   * Whether the mask is being applied to the markers, and how to change that.
   *
   * Switching it off draws every satellite the catalogue puts above the
   * elevation mask, over trees and walls and all — which is how a mask that is
   * hiding the wrong ones is told apart from a sky that is genuinely that
   * empty. The segmenter keeps running either way, so the figures below still
   * say what it would have hidden.
   */
  filtering: { on: boolean; onToggle: () => void };
  /** Where the camera is aimed now, against which the mask's own aim is shown. */
  viewAttitude: CameraAttitude;
  /** How far that may drift before the loop stops waiting and takes a new pass. */
  chaseAtDeg: number;
  /** `performance.now()` when the panel sampled, for the mask's age. */
  nowMs: number;
};

/** What the sky segmentation is doing, and how fresh its answer is. */
export function maskSection({
  mask: anchored,
  error,
  stats,
  filtering,
  viewAttitude,
  chaseAtDeg,
  nowMs
}: MaskDebugInput): DebugSection {
  const mask = anchored?.mask ?? null;
  const rows: DebugRow[] = [
    // What the segmenter is doing, and — when the switch above is off — that
    // nothing is being done with the answer, so a sky full of markers over
    // rooftops reads as the setting it is rather than as a broken mask.
    {
      label: "State",
      value: `${mask ? "Ready" : error ? "Failing" : "Waiting"}${
        filtering.on ? "" : " · not filtering"
      }`
    }
  ];
  if (error) rows.push({ label: "Error", value: error });
  if (mask && anchored) {
    rows.push({ label: "Grid", value: `${mask.columns} x ${mask.rows} cells` });
    rows.push({ label: "Open sky", value: `${Math.round(skyCoverage(mask) * 100)}%` });
    // How far the phone has turned since the frame this mask was cut from.
    // The mask travels with the sky rather than with the screen, so this is not
    // an error — it is how much of the view is sky nothing has looked at yet,
    // and it is the figure to watch when markers stop being drawn during a pan.
    // Shown against the drift that makes the next pass overdue, so the reading
    // says whether the loop is waiting out its gap or chasing the view.
    rows.push({
      label: "Aim offset",
      value: `${maskOffsetDeg(anchored, viewAttitude).toFixed(1)}° of ${chaseAtDeg.toFixed(1)}°`
    });
    // How much of the frame the segmenter found an edge in, and is therefore
    // carrying at sub-cell resolution. A frame of open sky reads zero; one of
    // trees is the count to watch if a pass ever starts costing too much.
    rows.push({
      label: "Edge detail",
      value: mask.detail
        ? `${refinedCellCount(mask)} cells at ${mask.detail.factor}x`
        : "none"
    });
  }
  rows.push({
    label: "Age",
    value: stats.updatedAtMs === null ? NONE : `${((nowMs - stats.updatedAtMs) / 1000).toFixed(1)} s`
  });
  rows.push({
    label: "Last pass",
    value: stats.lastPassMs === null ? NONE : `${Math.round(stats.lastPassMs)} ms`
  });
  rows.push({ label: "Passes", value: `${stats.passes} ok · ${stats.failures} failed` });
  // A range rather than a figure: the gap is what a still camera waits, and the
  // floor is what a camera being turned off the mask's aim gets instead.
  rows.push({
    label: "Gap between",
    value: `${SKY_SEGMENTATION_MINIMUM_INTERVAL_MS}–${SKY_SEGMENTATION_INTERVAL_MS} ms`
  });
  rows.push({ label: "Sky at or above", value: SKY_CONFIDENCE_THRESHOLD.toFixed(2) });

  return {
    id: "mask",
    title: "MASK",
    rows,
    switches: [
      { label: "Hide behind terrain", on: filtering.on, onToggle: filtering.onToggle }
    ]
  };
}

export type SkyDebugInput = {
  tracker: SkyTrackerStats;
  markers: MarkerStats;
  /** How much of the sky the passes so far have between them mapped. */
  memory: SkyMemoryStats;
  /** Time and observer the last drawn frame propagated against. */
  epoch: { time: Date; observer: ObserverLocation };
};

/** Where the catalog is: how much of it is being carried, and how much is drawn. */
export function skySection({ tracker, markers, memory, epoch }: SkyDebugInput): DebugSection {
  return {
    id: "sky",
    title: "SKY",
    rows: [
      { label: "Catalog", value: `${tracker.entries} objects` },
      { label: "Near horizon", value: `${tracker.candidates} tracked` },
      { label: `Above ${MINIMUM_SATELLITE_ELEVATION_DEG}°`, value: `${markers.drawn + markers.occluded}` },
      { label: "Drawn", value: `${markers.drawn}` },
      { label: "Behind terrain", value: `${markers.occluded}` },
      // Not behind anything as far as anyone knows: nothing has been aimed at
      // that sky yet, and an unlooked-at direction is not drawn.
      { label: "Sky not yet seen", value: `${markers.unmapped}` },
      // Drawn on an earlier pass's word because the live mask is aimed
      // elsewhere — the markers a pan would otherwise have had to wait for.
      { label: "From remembered sky", value: `${markers.remembered}` },
      {
        label: "Sky mapped",
        value: `${Math.round(memory.coverage * 100)}% · ${memory.cells} cells`
      },
      {
        label: "Sweep",
        value: `${SATELLITE_TRACKING.sweepPeriodSeconds.toFixed(0)} s · ${Math.round(
          tracker.sweepProgress * 100
        )}%${tracker.primed ? "" : " priming"}`
      },
      { label: "Epoch", value: clockTime(epoch.time) },
      { label: "Observer", value: position(epoch.observer) },
      { label: "Height", value: `${epoch.observer.heightM.toFixed(0)} m` }
    ]
  };
}

export type CatalogDebugInput = {
  /** The cache's own record of the downloaded catalog, or `null` if nothing has landed. */
  cache: CachedCatalog | null;
  /** `Date.now()` when the panel sampled — the cache's timestamps are wall-clock, not frame time. */
  nowMs: number;
};

/**
 * The TLE catalog on disk: when it was pulled, how big it is, and when the app
 * is next due to ask CelesTrak again.
 *
 * A separate page from `skySection`'s "Catalog" row because that one is about
 * what the tracker is doing with the orbits; this one is about the download
 * behind them, which is the thing that gets a client blocked if it is wrong.
 */
export function catalogSection({ cache, nowMs }: CatalogDebugInput): DebugSection {
  if (!cache) {
    return { id: "tle", title: "TLE", rows: [{ label: "State", value: "No cached catalog" }] };
  }

  const age = nowMs - cache.downloadedAtMs;
  const sinceAttempt = nowMs - cache.attemptedAtMs;

  let nextRefresh: string;
  if (age < TLE_REFRESH_INTERVAL_MS) {
    nextRefresh = `in ${duration(TLE_REFRESH_INTERVAL_MS - age)}`;
  } else if (sinceAttempt < TLE_RETRY_INTERVAL_MS) {
    nextRefresh = `retry in ${duration(TLE_RETRY_INTERVAL_MS - sinceAttempt)}`;
  } else {
    nextRefresh = "due now";
  }

  return {
    id: "tle",
    title: "TLE",
    rows: [
      { label: "Satellites", value: cache.tles.length.toLocaleString() },
      { label: "Size", value: bytes(cache.sizeBytes) },
      { label: "Downloaded", value: `${duration(age)} ago` },
      { label: "Last attempt", value: `${duration(sinceAttempt)} ago` },
      { label: "Next refresh", value: nextRefresh },
      { label: "Source", value: cache.url, wrap: true }
    ]
  };
}

export type ViewDebugInput = {
  /** What the picture is, in the frame's own words. */
  source: string;
  /** The fitted box the picture and the markers share, in layout points. */
  box: { width: number; height: number } | null;
  /** The frame the projection is placed in, in pixels. */
  frame: { widthPx: number; heightPx: number };
  fieldOfView: { horizontalDeg: number; verticalDeg: number };
  /** The smoothed attitude the last frame was drawn against. */
  attitude: {
    headingDeg: number;
    pitchDeg: number;
    rollDeg: number;
    rotationRateDegPerSecond: number;
  };
  frameRate: number;
};

/** What the markers were projected against: the frame, the lens and the aim. */
export function viewSection({
  source,
  box,
  frame,
  fieldOfView,
  attitude,
  frameRate
}: ViewDebugInput): DebugSection {
  return {
    id: "view",
    title: "VIEW",
    rows: [
      { label: "Source", value: source },
      { label: "Frame", value: `${frame.widthPx} x ${frame.heightPx} px` },
      {
        label: "Fitted box",
        value: box ? `${Math.round(box.width)} x ${Math.round(box.height)} pt` : NONE
      },
      {
        label: "Field of view",
        value: `${degrees(fieldOfView.horizontalDeg)} x ${degrees(fieldOfView.verticalDeg)}`
      },
      { label: "Heading", value: degrees(attitude.headingDeg) },
      { label: "Pitch", value: degrees(attitude.pitchDeg) },
      { label: "Roll", value: degrees(attitude.rollDeg) },
      { label: "Turning", value: `${fixed(attitude.rotationRateDegPerSecond, 1)} °/s` },
      { label: "Draw rate", value: `${frameRate.toFixed(0)} fps` }
    ]
  };
}

export type DeviceSensorDebugInput = {
  orientation: DeviceOrientation | null;
  observer: ObserverLocation;
  capabilities: DeviceCapabilities;
};

/** The phone's own sensors, as they arrive — before the filter smooths them. */
export function deviceSensorSection({
  orientation,
  observer,
  capabilities
}: DeviceSensorDebugInput): DebugSection {
  return {
    id: "sensors",
    title: "SENSORS",
    rows: [
      { label: "GPS", value: position(observer) },
      { label: "Height", value: `${observer.heightM.toFixed(0)} m` },
      { label: "Yaw", value: orientation ? degrees(orientation.yaw) : NONE },
      { label: "Pitch", value: orientation ? degrees(orientation.pitch) : NONE },
      { label: "Roll", value: orientation ? degrees(orientation.roll) : NONE },
      {
        label: "North offset",
        value:
          orientation?.northOffset === undefined ? NONE : degrees(orientation.northOffset)
      },
      {
        label: "Gyro",
        value: orientation?.gyro ? vector(orientation.gyro, 2, "rad/s") : NONE
      },
      { label: "Motion", value: capabilities.motion ? "present" : "missing" },
      { label: "Magnetometer", value: capabilities.magnetometer ? "present" : "missing" }
    ]
  };
}
