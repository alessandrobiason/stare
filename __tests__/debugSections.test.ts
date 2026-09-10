import {
  aimReadout,
  catalogSection,
  celestialSection,
  deviceSensorSection,
  maskSection,
  skySection,
  statusSection,
  viewSection
} from "../src/debug/sections";
import { MINIMUM_SATELLITE_ELEVATION_DEG } from "../src/constants";
import { CachedCatalog } from "../src/data/tleCache";
import { DeviceOrientation } from "../src/device/deviceOrientation";
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
    expect(section.rows.map((row) => row.label)).toEqual(["Position", "Sky mask", "Language"]);
  });

  test("and says what language it decided to speak, and who told it", () => {
    // An app in the wrong language looks the same however the detection
    // failed. This row is the difference between a bug report and a shrug —
    // see `localeReadout`, and the shipped bug it exists because of.
    const [row] = statusSection({ rows: [], warnings: [] }).rows;

    expect(row.label).toBe("Language");
    // The suite pins English (`jest.setup.ts`); on a phone this is the source
    // that answered and the tags it offered.
    expect(row.value).toBe("en · pinned · en");
  });

  test("boot's warnings land here, spelled out rather than clipped to a line", () => {
    const rows = statusSection({
      rows: [],
      warnings: ["No magnetometer: headings will drift.", "Using the cached catalogue."]
    }).rows;

    // Numbered, because two warnings sharing a label would be one row.
    expect(rows.map((row) => row.label)).toEqual(["Language", "Warning 1", "Warning 2"]);
    expect(rows.every((row) => row.wrap)).toBe(true);
  });

  test("a single warning is not numbered, because there is nothing to count", () => {
    const rows = statusSection({ rows: [], warnings: ["No fix yet."] }).rows;

    expect(rows.filter((row) => row.label !== "Language")).toEqual([
      { label: "Warning", value: "No fix yet.", wrap: true }
    ]);
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
      markers: { drawn: 12, occluded: 30, unmapped: 4, remembered: 5, eclipsed: 5, paths: 2 },
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
  // The two rows that separate a sky with nothing in it to see from a shadow
  // computed against the wrong sun — which would look the same on the frame.
  expect(rows["In sunlight"]).toBe("7");
  expect(rows["In Earth's shadow"]).toBe("5");
  // And the observer's own half of it: at 21:00 UTC in late August, this
  // observer is in the dark and whatever is overhead is not.
  expect(rows["Sun here"]).toContain("dark");
  // The landmarks' arcs are counted apart from the marks: they are drawn
  // whether or not the mask has anything to say about the sky they cross.
  expect(rows["Landmark paths"]).toBe("2");
  expect(rows.Sweep).toBe("2 s · 50%");
  expect(rows.Epoch).toBe("21:00:00.500Z");
});

test("the sky page says when the opening pass has not finished", () => {
  const rows = values(
    skySection({
      tracker: { entries: 10, candidates: 0, sweepProgress: 0.25, primed: false },
      markers: { drawn: 0, occluded: 0, unmapped: 0, remembered: 0, eclipsed: 0, paths: 0 },
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
  expect(rows.Compass).toBe("—");
});

describe("what the phone thinks of its own compass", () => {
  const sensors = (orientation: DeviceOrientation) =>
    values(
      deviceSensorSection({
        orientation,
        observer,
        capabilities: { motion: true, magnetometer: true }
      }).rows
    );

  const aimed: DeviceOrientation = { yaw: 20, pitch: 30, roll: 0 };

  test("names the grade and says what the filter does with it", () => {
    // The grade alone is a number nobody can act on; the noise beside it is the
    // whole consequence — the figure that changes when the grade does.
    expect(sensors({ ...aimed, compassAccuracy: 1 }).Compass).toBe("low (1) · ±20.0°");
    expect(sensors({ ...aimed, compassAccuracy: 3 }).Compass).toBe("high (3) · ±3.0°");
  });

  test("a grade off the end of the four is shown as one, not guessed at", () => {
    expect(sensors({ ...aimed, compassAccuracy: 9 }).Compass).toBe("? (9) · ±40.0°");
  });

  test("no declination reads as magnetic north rather than as a zero", () => {
    // Zero is a declination, and a real reading of it is indistinguishable from
    // one that never came — which is a heading a few degrees out in most places
    // and twenty in some, with nothing on the page saying so.
    expect(sensors(aimed).Declination).toBe("— · magnetic north");
    expect(sensors({ ...aimed, declination: 0 }).Declination).toBe("0.0°");
    expect(sensors({ ...aimed, declination: 11.5 }).Declination).toBe("11.5°");
  });
});

describe("the aim readout", () => {
  test("is the heading, which is the yaw plus the bearing to north", () => {
    // It used to print the yaw under the label "Heading". Yaw is counted from
    // the platform's own origin, so two working phones side by side disagree
    // about it by any amount at all — and the offset moves the other way, so
    // the divergence that is real only shows in the sum.
    expect(aimReadout({ yaw: 20, pitch: 30, roll: 0, northOffset: 110, declination: 4 })).toBe(
      "Heading 130.0° · pitch 30.0°"
    );
  });

  test("wraps into a bearing rather than reporting one past the circle", () => {
    expect(aimReadout({ yaw: 300, pitch: 0, roll: 0, northOffset: 100, declination: 0 })).toBe(
      "Heading 40.0° · pitch 0.0°"
    );
  });

  test("says the bearing is magnetic where no declination was ever had", () => {
    expect(aimReadout({ yaw: 20, pitch: 30, roll: 0, northOffset: 110 })).toBe(
      "Heading 130.0° magnetic · pitch 30.0°"
    );
  });

  test("prints no bearing at all without an offset, rather than the bare yaw", () => {
    // A heading that was never referenced to north is a different thing from
    // one that is wrong, and only one of the two is worth chasing.
    expect(aimReadout({ yaw: 20, pitch: 30, roll: 0 })).toBe(
      "Heading not referenced · pitch 30.0°"
    );
  });

  test("says it is still waiting before the first attitude", () => {
    expect(aimReadout(null)).toContain("Waiting");
  });
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


describe("the sky-fix page", () => {
  const sighting = {
    body: "sun" as const,
    northOffsetDeg: -12,
    correctionDeg: -28.4,
    noiseDeg: 0.62,
    at: { left: 41.2, top: 63.8 },
    altitudeDeg: 34.5,
    elevationResidualDeg: 0.3,
    offAxisDeg: 11.4
  };
  const checking = { on: true, onToggle: () => undefined };

  test("says what the compass was out by, which is the figure the page is for", () => {
    const rows = values(
      celestialSection({
        stats: {
          status: "sun: -28.4° at ±0.6°",
          looking: "sun",
          applied: sighting,
          appliedAtSeconds: 100,
          frames: 40,
          sightings: 12,
          fixes: 11
        },
        checking,
        nowSeconds: 102.5
      }).rows
    );

    // The correction, not the bearing: what the sighting *changed* is what says
    // how wrong the magnetometer was, and it is read against the platform's own
    // grade of the same compass on the sensors page.
    expect(rows["Fix applied"]).toBe("sun -28.4° at ±0.62°");
    expect(rows["Age"]).toBe("2.5 s");
    expect(rows["Found at"]).toBe("41%, 64% · 11.4° off axis");
    expect(rows["Elevation"]).toBe("34.5° up · 0.3° residual");
    expect(rows["Frames"]).toBe("40 seen · 12 sighted · 11 used");
  });

  test("a page with nothing to report still says what it is waiting for", () => {
    const section = celestialSection({
      stats: {
        status: "Neither body between 10° and 70° up",
        looking: "nothing up",
        applied: null,
        appliedAtSeconds: null,
        frames: 3,
        sightings: 0,
        fixes: 0
      },
      checking,
      nowSeconds: 10
    });
    const rows = values(section.rows);

    expect(rows["Bodies up"]).toBe("nothing up");
    expect(rows["Fix applied"]).toBe("—");
    // No age for a fix that never landed, rather than a figure counted from
    // nothing.
    expect(rows).not.toHaveProperty("Age");
    expect(rows["Usable band"]).toBe("10–70° up");
  });

  test("the switch that tells a corrected heading from an uncorrected one", () => {
    const section = celestialSection({
      stats: {
        status: "",
        looking: "sun",
        applied: null,
        appliedAtSeconds: null,
        frames: 0,
        sightings: 0,
        fixes: 0
      },
      checking: { on: false, onToggle: () => undefined },
      nowSeconds: 0
    });

    expect(section.switches).toEqual([
      { label: "Check compass against the sky", on: false, onToggle: expect.any(Function) }
    ]);
  });
});
