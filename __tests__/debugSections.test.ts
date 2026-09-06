import {
  catalogSection,
  deviceSensorSection,
  maskSection,
  skySection,
  statusSection,
  viewSection
} from "../src/debug/sections";
import { MINIMUM_SATELLITE_ELEVATION_DEG } from "../src/constants";
import { CachedCatalog } from "../src/data/tleCache";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import { replaySensorSection } from "../testing/replay/debugSections";
import { RecordingSnapshot } from "../testing/replay/recordingDataset";
import { AnchoredSkyMask } from "../src/vision/anchoredMask";

/** What a row says, keyed by its label, which is how the panel reads. */
function values(rows: { label: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.label, row.value]));
}

const observer = { latitudeDeg: 60.16986, longitudeDeg: 24.93837, heightM: 21.4 };

const level = { headingDeg: 0, pitchDeg: 0, rollDeg: 0 };

const mask: AnchoredSkyMask = {
  mask: { columns: 2, rows: 2, confidence: [1, 1, 0, 0] },
  attitude: level
};

const noStats = { updatedAtMs: null, lastPassMs: null, passes: 0, failures: 0 };

/** The mask doing its job, which is what every page below assumes. */
const filtering = { on: true, onToggle: () => undefined };

describe("the status page", () => {
  test("carries the readouts the corner panel used to show, in order", () => {
    const section = statusSection({
      rows: [
        { label: "Position", value: "60.1699, 24.9384 · 21 m" },
        { label: "Sky mask", value: "Sky mask 48x32 · 61% sky" }
      ],
      warnings: []
    });

    expect(section.title).toBe("STATUS");
    expect(section.rows.map((row) => row.label)).toEqual(["Position", "Sky mask"]);
  });

  test("boot's warnings land here, spelled out rather than clipped to a line", () => {
    const rows = statusSection({
      rows: [],
      warnings: ["No magnetometer: headings will drift.", "Using the cached catalogue."]
    }).rows;

    // Numbered, because two warnings sharing a label would be one row.
    expect(rows.map((row) => row.label)).toEqual(["Warning 1", "Warning 2"]);
    expect(rows.every((row) => row.wrap)).toBe(true);
  });

  test("a single warning is not numbered, because there is nothing to count", () => {
    const rows = statusSection({ rows: [], warnings: ["No fix yet."] }).rows;

    expect(rows).toEqual([{ label: "Warning", value: "No fix yet.", wrap: true }]);
  });
});

describe("the mask page", () => {
  test("says the mask is still coming rather than showing a stale one", () => {
    const rows = values(
      maskSection({
        mask: null,
        error: null,
        stats: noStats,
        filtering,
        viewAttitude: level,
        chaseAtDeg: 6.7,
        nowMs: 1000
      })
        .rows
    );

    expect(rows.State).toBe("Waiting");
    expect(rows.Age).toBe("—");
    expect(rows.Grid).toBeUndefined();
  });

  test("reports the grid, the coverage and how old the answer is", () => {
    const rows = values(
      maskSection({
        mask,
        error: null,
        stats: { updatedAtMs: 4000, lastPassMs: 920, passes: 7, failures: 1 },
        filtering,
        viewAttitude: { ...level, headingDeg: 12 },
        chaseAtDeg: 6.7,
        nowMs: 5500
      }).rows
    );

    expect(rows.State).toBe("Ready");
    expect(rows.Grid).toBe("2 x 2 cells");
    expect(rows["Open sky"]).toBe("50%");
    expect(rows.Age).toBe("1.5 s");
    expect(rows["Last pass"]).toBe("920 ms");
    expect(rows.Passes).toBe("7 ok · 1 failed");
    // How far the phone has turned since the frame the mask was cut from: the
    // part of the view the mask cannot answer for yet.
    // Against the drift that makes the next pass overdue: this one is past it,
    // so the loop is chasing the view rather than waiting out its gap.
    expect(rows["Aim offset"]).toBe("12.0° of 6.7°");
  });

  test("a failing segmenter names the failure", () => {
    const rows = values(
      maskSection({
        mask: null,
        error: "no backend",
        stats: noStats,
        filtering,
        viewAttitude: level,
        chaseAtDeg: 6.7,
        nowMs: 0
      })
        .rows
    );

    expect(rows.State).toBe("Failing");
    expect(rows.Error).toBe("no backend");
  });

  test("carries the switch that stops the mask hiding anything", () => {
    const onToggle = jest.fn();
    const section = maskSection({
      mask,
      error: null,
      stats: noStats,
      filtering: { on: true, onToggle },
      viewAttitude: level,
      chaseAtDeg: 6.7,
      nowMs: 0
    });

    expect(section.switches).toHaveLength(1);
    expect(section.switches?.[0].on).toBe(true);
    section.switches?.[0].onToggle();
    expect(onToggle).toHaveBeenCalled();
  });

  test("says so when nothing is being hidden, so a crowded sky reads as a setting", () => {
    const section = maskSection({
      mask,
      error: null,
      stats: noStats,
      filtering: { on: false, onToggle: () => undefined },
      viewAttitude: level,
      chaseAtDeg: 6.7,
      nowMs: 0
    });

    // The segmenter is still running — the page goes on reporting on it — and
    // the state row is where that difference is spelled out.
    expect(values(section.rows).State).toBe("Ready · not filtering");
    expect(values(section.rows)["Open sky"]).toBe("50%");
    expect(section.switches?.[0].on).toBe(false);
  });
});

test("the sky page separates what is drawn from what the mask is hiding", () => {
  const rows = values(
    skySection({
      tracker: { entries: 16000, candidates: 240, sweepProgress: 0.5, primed: true },
      markers: { drawn: 12, occluded: 30, unmapped: 4, remembered: 5 },
      memory: { cells: 4500, capacity: 32400, coverage: 0.125 },
      epoch: { time: new Date("2026-08-30T21:00:00.500Z"), observer }
    }).rows
  );

  expect(rows.Catalog).toBe("16000 objects");
  expect(rows["Near horizon"]).toBe("240 tracked");
  expect(rows["Sky not yet seen"]).toBe("4");
  // Markers the live mask cannot answer for and an earlier pass can: without
  // the memory these are the ones a pan leaves off the frame for a second or
  // two, and they are counted apart from the ones it draws outright.
  expect(rows["From remembered sky"]).toBe("5");
  expect(rows["Sky mapped"]).toBe("13% · 4500 cells");
  expect(rows[`Above ${MINIMUM_SATELLITE_ELEVATION_DEG}°`]).toBe("42");
  expect(rows.Drawn).toBe("12");
  expect(rows["Behind terrain"]).toBe("30");
  expect(rows.Sweep).toBe("2 s · 50%");
  expect(rows.Epoch).toBe("21:00:00.500Z");
});

test("the sky page says when the opening pass has not finished", () => {
  const rows = values(
    skySection({
      tracker: { entries: 10, candidates: 0, sweepProgress: 0.25, primed: false },
      markers: { drawn: 0, occluded: 0, unmapped: 0, remembered: 0 },
      memory: { cells: 0, capacity: 32400, coverage: 0 },
      epoch: { time: new Date("2026-08-30T21:00:00Z"), observer }
    }).rows
  );

  expect(rows.Sweep).toContain("priming");
});

describe("the TLE page", () => {
  const cache: CachedCatalog = {
    tles: [SAMPLE_TLE, { ...SAMPLE_TLE, name: "SAT TWO" }],
    downloadedAtMs: 1_000_000,
    attemptedAtMs: 1_000_000,
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    sizeBytes: 2_400_000
  };

  test("says nothing is cached rather than showing stale figures", () => {
    const rows = values(catalogSection({ cache: null, nowMs: 1_000_000 }).rows);

    expect(rows.State).toBe("No cached catalog");
  });

  test("reports the count, the size and how old the download is", () => {
    const rows = values(
      catalogSection({ cache, nowMs: 1_000_000 + 90 * 60 * 1000 }).rows
    );

    expect(rows.Satellites).toBe("2");
    expect(rows.Size).toBe("2.29 MB");
    expect(rows.Downloaded).toBe("1h 30m ago");
    expect(rows["Last attempt"]).toBe("1h 30m ago");
    expect(rows.Source).toContain("celestrak.org");
  });

  test("counts down to the next refresh while the cache is fresh", () => {
    const rows = values(
      catalogSection({ cache, nowMs: 1_000_000 + 60 * 60 * 1000 }).rows
    );

    expect(rows["Next refresh"]).toBe("in 1h 0m");
  });

  test("falls back to the retry window once the cache is stale", () => {
    const staleCache = { ...cache, attemptedAtMs: 1_000_000 + 3 * 60 * 60 * 1000 };
    const rows = values(
      catalogSection({ cache: staleCache, nowMs: 1_000_000 + 3 * 60 * 60 * 1000 + 5 * 60 * 1000 }).rows
    );

    expect(rows["Next refresh"]).toBe("retry in 10m 0s");
  });

  test("says a refresh is due once both windows have passed", () => {
    const staleCache = { ...cache, attemptedAtMs: 1_000_000 + 3 * 60 * 60 * 1000 };
    const rows = values(
      catalogSection({ cache: staleCache, nowMs: 1_000_000 + 4 * 60 * 60 * 1000 }).rows
    );

    expect(rows["Next refresh"]).toBe("due now");
  });
});

test("the view page reports the frame the markers were placed in", () => {
  const rows = values(
    viewSection({
      source: "Phone camera",
      box: { width: 393.4, height: 524.6 },
      frame: { widthPx: 1080, heightPx: 1440 },
      fieldOfView: { horizontalDeg: 53.5, verticalDeg: 68.1 },
      attitude: {
        headingDeg: 132.44,
        pitchDeg: 45.06,
        rollDeg: -1.98,
        rotationRateDegPerSecond: 4.27
      },
      frameRate: 59.4
    }).rows
  );

  expect(rows.Source).toBe("Phone camera");
  expect(rows.Frame).toBe("1080 x 1440 px");
  expect(rows["Fitted box"]).toBe("393 x 525 pt");
  expect(rows["Field of view"]).toBe("53.5° x 68.1°");
  expect(rows.Heading).toBe("132.4°");
  expect(rows.Turning).toBe("4.3 °/s");
  expect(rows["Draw rate"]).toBe("59 fps");
});

test("the device sensors page shows what is missing rather than a plausible zero", () => {
  const rows = values(
    deviceSensorSection({
      orientation: null,
      observer,
      capabilities: { motion: true, magnetometer: false }
    }).rows
  );

  expect(rows.Yaw).toBe("—");
  expect(rows.Gyro).toBe("—");
  expect(rows.Magnetometer).toBe("missing");
  expect(rows.GPS).toBe("60.16986, 24.93837");
});

const snapshot: RecordingSnapshot = {
  elapsedSeconds: 12.5,
  frameNumber: 375,
  observer,
  orientation: { heading: 130, pitch: 44, roll: -2, yaw: 20, northOffset: 110 },
  arkit: { x: 0.1, y: -0.2, z: 1.3, qw: 1, qx: 0, qy: 0, qz: 0 },
  accelerometer: { x: 0.01, y: -0.02, z: -9.81 },
  gyro: { x: 0.001, y: 0.002, z: -0.003 },
  magnetometer: { x: 12.34, y: -45.6, z: 7.8 },
  barometer: { pressureKpa: 101.325, relativeAltitudeM: 1.234 }
};

describe("the replay sensors page", () => {
  test("resolves every recorded stream to the current video time", () => {
    const rows = values(
      replaySensorSection({
        label: "Staged recording",
        snapshot,
        replayStart: new Date("2026-08-30T21:00:00Z")
      }).rows
    );

    expect(rows.Recording).toBe("Staged recording");
    expect(rows.Time).toBe("12.500 s");
    expect(rows.Frame).toBe("375");
    expect(rows["Orbit time"]).toBe("21:00:12.500Z");
    expect(rows.Heading).toBe("130.0°");
    expect(rows["North offset"]).toBe("110.0°");
    expect(rows.Gyro).toBe("0.00, 0.00, 0.00 rad/s");
    expect(rows.Baro).toBe("101.325 kPa · Δ1.23 m");
  });

  test("says it is still waiting before the first snapshot", () => {
    const rows = values(
      replaySensorSection({
        label: "Staged recording",
        snapshot: null,
        replayStart: new Date("2026-08-30T21:00:00Z")
      }).rows
    );

    expect(rows.State).toContain("Waiting");
    expect(rows.Time).toBeUndefined();
  });
});

test("both modes name their sensors page the same, so the menu does not move", () => {
  expect(
    deviceSensorSection({
      orientation: null,
      observer,
      capabilities: { motion: true, magnetometer: true }
    }).id
  ).toBe(
    replaySensorSection({
      label: "Staged recording",
      snapshot,
      replayStart: new Date()
    }).id
  );
});
