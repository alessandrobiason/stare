import * as fs from "fs";
import * as path from "path";
import { PASS_ALERTS } from "../src/constants";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { setLocaleForTesting } from "../src/i18n";
import { scheduledAlertsFor } from "../src/notifications/alertQueue";
import { SatelliteCatalog } from "../src/satellite/catalog";
import { NakedEyeVerdict } from "../src/satellite/nakedEye";
import { landmarkPasses } from "../src/satellite/orbitPath";
import { alertsWorthSending, isQuietHour, planPassAlerts } from "../src/satellite/passAlerts";
import { UpcomingPass, upcomingPasses } from "../src/satellite/upcomingPasses";
import { startSlicing } from "../src/timeSlice";
import { ObserverLocation } from "../src/types";

/**
 * The one thing this app says to somebody who is not looking at it.
 *
 * Everything else it does is answerable by looking: a marker in the wrong place
 * is a marker somebody can see is wrong. A notification is read on a lock
 * screen, minutes before the sky it is about, by somebody deciding whether to
 * put their shoes on — and the only thing that keeps that welcome is that it is
 * never sent for a sky with nothing in it. So most of what is checked here is
 * what is *not* sent.
 */

const MS_PER_MINUTE = 60_000;

/** Nine in the evening, on the clock of whatever machine is running this. */
const EVENING = new Date(2026, 7, 29, 21, 0, 0).getTime();

/**
 * One described pass, as `upcomingPasses` hands it over.
 *
 * Built by hand rather than propagated, because what is under test here is the
 * decision rather than the astronomy: the arithmetic behind `nakedEye` has its
 * own suite, and a fixture that has to be a real orbit cannot be moved one
 * degree at a time across the threshold it is testing.
 */
function pass(overrides: Partial<UpcomingPass> = {}): UpcomingPass {
  const startsAtMs = EVENING + 30 * MS_PER_MINUTE;
  return {
    name: "ISS",
    noradId: 25544,
    category: "LANDMARK",
    startsAtMs,
    endsAtMs: startsAtMs + 6 * MS_PER_MINUTE,
    peakAtMs: startsAtMs + 3 * MS_PER_MINUTE,
    peakElevationDeg: 62,
    riseAzimuthDeg: 225,
    setAzimuthDeg: 45,
    started: false,
    nakedEye: "visible",
    apparentMagnitude: -2.4,
    magnitudeMeasured: true,
    ...overrides
  };
}

describe("which passes are worth a notification", () => {
  test("the ones that can be seen, and only those", () => {
    // The whole promise. A verdict is worked out at the pass's own high point
    // from the sun here, the sunlight up there and the object's brightness
    // (`nakedEye.ts`), and everything short of a sighting is a phone buzzing
    // for an empty sky.
    const verdicts: NakedEyeVerdict[] = [
      "visible",
      "binoculars",
      "tooFaint",
      "eclipsed",
      "daylight",
      "unknown"
    ];
    const sent = verdicts.filter(
      (nakedEye) => alertsWorthSending([pass({ nakedEye })], EVENING).length > 0
    );

    expect(sent).toEqual(["visible", "binoculars"]);
  });

  test("a brightness nobody recorded is not a promise, however high the pass", () => {
    // The card says "in sunlight, though how brightly it shines is not
    // recorded" and the arc is drawn like any other, because neither of those
    // costs anything if it turns out to be too faint. This does.
    const alerts = alertsWorthSending(
      [pass({ nakedEye: "unknown", apparentMagnitude: null, peakElevationDeg: 89 })],
      EVENING
    );

    expect(alerts).toEqual([]);
  });

  test("high enough to be above the houses", () => {
    const floor = PASS_ALERTS.minimumPeakElevationDeg;
    const under = alertsWorthSending([pass({ peakElevationDeg: floor - 1 })], EVENING);
    const over = alertsWorthSending([pass({ peakElevationDeg: floor })], EVENING);

    expect(under).toEqual([]);
    expect(over).toHaveLength(1);
  });

  test("a pass already under way is the app's business, not a notification's", () => {
    // Its object is on the frame with an arc through it. A notification about
    // it is one somebody reads on the way out to a sky it has left.
    expect(alertsWorthSending([pass({ started: true })], EVENING)).toEqual([]);
  });
});

describe("when the notification lands", () => {
  test("a set lead before the object comes up, not before it is highest", () => {
    // The rise is when there is something in the sky to catch, and the lead is
    // the time it takes to get out from under a roof.
    const [alert] = alertsWorthSending([pass()], EVENING);

    expect(alert.startsAtMs - alert.deliverAtMs).toBe(PASS_ALERTS.leadMinutes * MS_PER_MINUTE);
  });

  test("and never so close that nobody could act on it", () => {
    const lead = PASS_ALERTS.leadMinutes + PASS_ALERTS.minimumLeadMinutes;
    // A pass whose alert would land a minute inside the floor, and one a minute
    // outside it. The sky view is the better answer for the first.
    const tooSoon = pass({ startsAtMs: EVENING + (lead - 1) * MS_PER_MINUTE });
    const inTime = pass({ startsAtMs: EVENING + (lead + 1) * MS_PER_MINUTE });

    expect(alertsWorthSending([tooSoon], EVENING)).toEqual([]);
    expect(alertsWorthSending([inTime], EVENING)).toHaveLength(1);
  });

  test("nothing at all in the hours somebody is asleep", () => {
    // Built on the local clock rather than in UTC, because that is the clock
    // the rule is written against — the small hours of wherever the phone is.
    const night = new Date(2026, 7, 29, 3, 0, 0).getTime();
    const deep = pass({ startsAtMs: night + PASS_ALERTS.leadMinutes * MS_PER_MINUTE });

    expect(alertsWorthSending([deep], night - 60 * MS_PER_MINUTE)).toEqual([]);
  });

  test("the quiet window is the hours between its bounds, whichever way round", () => {
    // It wraps midnight as written, and the reading of it has to survive being
    // set to a pair that does not.
    expect(isQuietHour(PASS_ALERTS.quietFromHour)).toBe(true);
    expect(isQuietHour(PASS_ALERTS.quietUntilHour)).toBe(false);
    expect(isQuietHour(21)).toBe(false);
  });
});

describe("how many, and in what order", () => {
  /**
   * A run of passes an hour apart, each as alertable as the last, starting in
   * the morning — so that a series long enough to overflow the queue is still
   * one the quiet hours do not reach into.
   */
  const MORNING = new Date(2026, 7, 29, 8, 0, 0).getTime();

  function everyHour(count: number): UpcomingPass[] {
    return Array.from({ length: count }, (_, index) => {
      const startsAtMs = MORNING + (index + 1) * 60 * MS_PER_MINUTE;
      return pass({
        noradId: 40000 + index,
        name: `SAT ${index}`,
        startsAtMs,
        peakAtMs: startsAtMs + 3 * MS_PER_MINUTE,
        endsAtMs: startsAtMs + 6 * MS_PER_MINUTE
      });
    });
  }

  test("soonest first, whatever order they arrive in", () => {
    const alerts = alertsWorthSending([...everyHour(4)].reverse(), MORNING);
    const times = alerts.map((alert) => alert.deliverAtMs);

    expect(times).toEqual([...times].sort((one, other) => one - other));
  });

  test("and never more than a phone can be buzzed without regretting it", () => {
    const alerts = alertsWorthSending(everyHour(PASS_ALERTS.maximumScheduled + 5), MORNING);

    expect(alerts).toHaveLength(PASS_ALERTS.maximumScheduled);
    // The ones kept are the soonest, not the first that happened to be found.
    expect(alerts[0].name).toBe("SAT 0");
  });

  test("one pass is one alert, however often the plan is made again", () => {
    // The plan is remade every half hour and the same pass comes out of it
    // every time, a second or two differently placed (`passSearch` bisects from
    // whatever grid it started on). The identifier is what stops that being a
    // second notification for the same sky.
    const again = alertsWorthSending([pass({ peakAtMs: pass().peakAtMs + 1500 })], EVENING);

    expect(again[0].id).toBe(alertsWorthSending([pass()], EVENING)[0].id);
    // And two objects over the same minute are still two alerts.
    expect(alertsWorthSending([pass({ noradId: 48274 })], EVENING)[0].id).not.toBe(again[0].id);
  });
});

describe("what the notification says", () => {
  afterEach(() => setLocaleForTesting("en"));

  test("the object and the countdown, then where to stand and what will be seen", () => {
    const [alert] = scheduledAlertsFor(alertsWorthSending([pass()], EVENING));

    expect(alert.title).toBe(`ISS passes over in ${PASS_ALERTS.leadMinutes} min`);
    // The compass point it comes up at, how high it gets, and the verdict the
    // whole alert rests on — the same words the panel uses for the same pass.
    expect(alert.body).toBe("SW · 62° up · visible to the eye");
  });

  test("binoculars are said to be binoculars", () => {
    // Nobody goes out expecting the naked eye and finds they needed a pair.
    const [alert] = scheduledAlertsFor(
      alertsWorthSending([pass({ nakedEye: "binoculars", apparentMagnitude: 5.2 })], EVENING)
    );

    expect(alert.body).toContain("binoculars");
  });

  test("in the language the app is in when the alert is queued", () => {
    setLocaleForTesting("it");
    const [alert] = scheduledAlertsFor(alertsWorthSending([pass()], EVENING));

    expect(alert.title).toContain("passa tra");
    expect(alert.body).toContain("visibile");
  });

  test("and carries the pass's own moment, so the queue cannot double up", () => {
    const [alert] = scheduledAlertsFor(alertsWorthSending([pass()], EVENING));
    const [same] = alertsWorthSending([pass()], EVENING);

    expect(alert.id).toBe(same.id);
    expect(alert.deliverAtMs).toBe(same.deliverAtMs);
  });
});

/**
 * The same rules against a real sky: the committed catalogue, a day of it, and
 * whatever it turns out to hold.
 *
 * Nairobi rather than the northern places the other suites use, and for a
 * reason that is about this test rather than about the app: near the equator a
 * day carries alertable passes at both ends of it, so the quiet-hours rule —
 * which is read on the clock of whichever machine runs this — cannot take all
 * of them whatever timezone that machine is set to.
 */
describe("against a real sky", () => {
  const observer: ObserverLocation = { latitudeDeg: -1.29, longitudeDeg: 36.82, heightM: 1795 };
  const MIDNIGHT = Date.UTC(2026, 7, 29, 0, 0, 0);

  const catalog = new SatelliteCatalog(
    parseTleCatalog(
      fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
    )
  );

  test("a day of sky produces alerts, and every one of them is a sighting", async () => {
    const alerts = await planPassAlerts(catalog, MIDNIGHT, observer, startSlicing());

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.length).toBeLessThanOrEqual(PASS_ALERTS.maximumScheduled);
    for (const alert of alerts) {
      expect(["visible", "binoculars"]).toContain(alert.nakedEye);
      expect(alert.peakElevationDeg).toBeGreaterThanOrEqual(PASS_ALERTS.minimumPeakElevationDeg);
      expect(alert.deliverAtMs).toBeGreaterThan(MIDNIGHT);
      expect(alert.deliverAtMs).toBeLessThan(alert.startsAtMs);
      expect(isQuietHour(new Date(alert.deliverAtMs).getHours())).toBe(false);
    }
    expect(new Set(alerts.map((alert) => alert.id)).size).toBe(alerts.length);
  }, 60_000);

  test("and it is a day of it, because the app will not be opened before then", async () => {
    // The drawn arcs reach three hours, which is the sky somebody standing
    // outside is under. Nothing of ours runs while the app is shut, so an alert
    // planned for the same three hours would only ever reach somebody who
    // already had the app open — which is the one person who does not need it.
    const slices = startSlicing();
    const drawn = await landmarkPasses(catalog, MIDNIGHT, observer, slices);
    const alerted = await landmarkPasses(
      catalog,
      MIDNIGHT,
      observer,
      slices,
      PASS_ALERTS.windowHours
    );

    expect(alerted.length).toBeGreaterThan(drawn.length);
    // And the day's plan is the same sky: everything the three hours found is
    // still in it, at the same minute.
    const heads = new Set(alerted.map((one) => `${one.noradId}@${Math.round(one.peakAtMs / 1000)}`));
    for (const one of drawn) {
      expect(heads).toContain(`${one.noradId}@${Math.round(one.peakAtMs / 1000)}`);
    }
  }, 60_000);

  test("most of what the sky is doing is not worth a notification", async () => {
    // The honest proportion, and the reason this feature is not a firehose: at
    // any hour most passes are in daylight, in the Earth's shadow, or too faint
    // — and the app is drawing all of them quite happily.
    const passes = await landmarkPasses(
      catalog,
      MIDNIGHT,
      observer,
      startSlicing(),
      PASS_ALERTS.windowHours
    );
    const described = upcomingPasses(passes, catalog, observer);
    const alerts = alertsWorthSending(described, MIDNIGHT);

    expect(described.length).toBeGreaterThan(alerts.length);
  }, 60_000);
});
