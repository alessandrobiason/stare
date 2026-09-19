import * as fs from "fs";
import * as path from "path";
import { LANDMARK_PATHS, PASS_ALERTS } from "../src/constants";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { setLocaleForTesting } from "../src/i18n";
import { scheduledAlertsFor } from "../src/notifications/alertQueue";
import { SatelliteCatalog } from "../src/satellite/catalog";
import { NakedEyeVerdict } from "../src/satellite/nakedEye";
import { passesOf, SkyPass } from "../src/satellite/orbitPath";
import {
  alertsWorthSending,
  isQuietHour,
  PassAlert,
  planPassAlerts,
  withinHorizon
} from "../src/satellite/passAlerts";
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
/**
 * Every pass the landmark tier makes in a window, as a plan of real sky to
 * check the alert plan against: the station, the ferries docked to it and the
 * observatories, whose passes are known well enough to reason about.
 */
function landmarkPasses(
  catalog: SatelliteCatalog,
  fromMs: number,
  observer: ObserverLocation,
  slices: ReturnType<typeof startSlicing>,
  windowHours: number = LANDMARK_PATHS.windowHours
): Promise<SkyPass[]> {
  const landmarks = catalog.entries.filter((entry) => entry.category === "LANDMARK");
  return passesOf(landmarks, fromMs, observer, slices, [
    { fromMs, untilMs: fromMs + windowHours * 60 * MS_PER_MINUTE }
  ]);
}

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
  test("the ones that can be seen with the naked eye, and only those", () => {
    // The whole promise. A verdict is worked out at the pass's own high point
    // from the sun here, the sunlight up there and the object's brightness
    // (`nakedEye.ts`), and everything short of a sighting is a phone buzzing
    // for an empty sky — binoculars included, since nobody can be assumed to
    // own a pair.
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

    expect(sent).toEqual(["visible"]);
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

  test("and never more in a day than a phone can be buzzed without regretting it", () => {
    const alerts = alertsWorthSending(everyHour(11), MORNING);

    expect(alerts).toHaveLength(PASS_ALERTS.maximumPerDay);
    // The ones kept are the soonest, not the first that happened to be found.
    expect(alerts.map((alert) => alert.name)).toEqual(["SAT 0", "SAT 1"]);
  });

  test("a rate rather than a total, so a busy first night does not starve the week", () => {
    // Three alertable evening passes a night for five nights. A cap on the whole
    // queue would be spent by the second evening, and the people this is for —
    // the ones who do not open the app in between — would hear nothing after.
    const nights = Array.from({ length: 5 }, (_, night) =>
      [0, 40, 80].map((minutes, index) => {
        const startsAtMs =
          new Date(2026, 7, 29 + night, 20, 0, 0).getTime() + minutes * MS_PER_MINUTE;
        return pass({
          noradId: 41000 + night * 10 + index,
          startsAtMs,
          peakAtMs: startsAtMs + 3 * MS_PER_MINUTE,
          endsAtMs: startsAtMs + 6 * MS_PER_MINUTE
        });
      })
    ).flat();

    const alerts = alertsWorthSending(nights, new Date(2026, 7, 29, 12, 0, 0).getTime());
    const perDay = new Map<number, number>();
    for (const alert of alerts) {
      const day = new Date(alert.deliverAtMs).getDate();
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }

    expect([...perDay.values()]).toEqual(Array(5).fill(PASS_ALERTS.maximumPerDay));
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

  test("any object that can be seen, not only a landmark", () => {
    // A fresh launch coming over is as much a sighting as the station is.
    const [alert] = scheduledAlertsFor(
      alertsWorthSending(
        [pass({ name: "STARLINK-99999", noradId: 99999, category: "INTERNET", apparentMagnitude: 3.1 })],
        EVENING
      )
    );

    expect(alert.title).toContain("STARLINK-99999");
    expect(alert.body).toContain("visible to the eye");
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
 * The same rules against a real sky: the committed catalogue, a week of it, and
 * whatever it turns out to hold.
 *
 * Nairobi rather than the northern places the other suites use, and for a
 * reason that is about this test rather than about the app: near the equator a
 * day carries alertable passes at both ends of it, so the quiet-hours rule —
 * which is read on the clock of whichever machine runs this — cannot take all
 * of them whatever timezone that machine is set to.
 *
 * Planned from the day after the fixture's elements were cut (2026-08-23), so
 * that nearly the whole horizon is one the elements can be trusted over.
 */
describe("against a real sky", () => {
  const observer: ObserverLocation = { latitudeDeg: -1.29, longitudeDeg: 36.82, heightM: 1795 };
  const FROM = Date.UTC(2026, 7, 24, 0, 0, 0);
  const HORIZON_MS = PASS_ALERTS.horizonDays * 24 * 60 * MS_PER_MINUTE;

  const catalog = new SatelliteCatalog(
    parseTleCatalog(
      fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
    )
  );

  /** Every landmark's element epoch, in epoch milliseconds. */
  const epochOf = (noradId: number): number => {
    const entry = catalog.entries.find((one) => one.noradId === noradId);
    if (!entry) throw new Error(`no ${noradId} in the fixture`);
    return (entry.satrec.jdsatepoch - 2440587.5) * 24 * 60 * MS_PER_MINUTE;
  };

  // Planned once and read by every test below: a week of the tier is a couple
  // of seconds, and each of these is a different question about the same plan.
  let week: SkyPass[] = [];
  let alerts: PassAlert[] = [];
  beforeAll(async () => {
    week = await landmarkPasses(
      catalog,
      FROM,
      observer,
      startSlicing(),
      PASS_ALERTS.horizonDays * 24
    );
    alerts = await planPassAlerts(catalog, FROM, observer, startSlicing());
  }, 60_000);

  test("a week of sky produces alerts, and every one of them is a sighting", () => {
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.nakedEye).toBe("visible");
      expect(alert.peakElevationDeg).toBeGreaterThanOrEqual(PASS_ALERTS.minimumPeakElevationDeg);
      expect(alert.deliverAtMs).toBeGreaterThan(FROM);
      expect(alert.deliverAtMs).toBeLessThan(alert.startsAtMs);
      expect(isQuietHour(new Date(alert.deliverAtMs).getHours())).toBe(false);
    }
    expect(new Set(alerts.map((alert) => alert.id)).size).toBe(alerts.length);
  });

  test("spread across the days rather than spent on the first of them", () => {
    const days = new Map<string, number>();
    for (const alert of alerts) {
      const when = new Date(alert.deliverAtMs);
      const day = `${when.getMonth()}-${when.getDate()}`;
      days.set(day, (days.get(day) ?? 0) + 1);
    }

    expect(days.size).toBeGreaterThan(1);
    for (const count of days.values()) expect(count).toBeLessThanOrEqual(PASS_ALERTS.maximumPerDay);
  });

  test("and never further from its own elements than they can be trusted", () => {
    // Five minutes of along-track error is the budget, and a week of SGP4 is
    // what stays inside it for the station. See `PASS_ALERTS.horizonDays`.
    for (const alert of alerts) {
      expect(alert.peakAtMs - epochOf(alert.noradId)).toBeLessThanOrEqual(HORIZON_MS);
    }
    // And the cut is real: the week planned from the day after the epoch runs
    // past it, and what runs past it is left out.
    const trusted = withinHorizon(week, catalog);
    expect(trusted.length).toBeGreaterThan(0);
    expect(trusted.length).toBeLessThan(week.length);
  });

  test("elements too old to trust alert on nothing at all", async () => {
    // A catalogue read from the cache after a fortnight offline. Every pass it
    // would find is one whose minute has drifted by more than the notice an
    // alert gives, so none of them is worth a notification.
    const late = await planPassAlerts(
      catalog,
      FROM + 2 * HORIZON_MS,
      observer,
      startSlicing()
    );

    expect(late).toEqual([]);
  }, 60_000);

  test("and it is a week of it, because the app will not be opened before then", async () => {
    // The drawn arcs reach three hours, which is the sky somebody standing
    // outside is under. Nothing of ours runs while the app is shut, so an alert
    // planned for the same three hours would only ever reach somebody who
    // already had the app open — which is the one person who does not need it.
    const drawn = await landmarkPasses(catalog, FROM, observer, startSlicing());

    expect(week.length).toBeGreaterThan(drawn.length);
    // And the week's plan is the same sky: everything the three hours found is
    // still in it, at the same minute.
    const heads = new Set(week.map((one) => `${one.noradId}@${Math.round(one.peakAtMs / 1000)}`));
    for (const one of drawn) {
      expect(heads).toContain(`${one.noradId}@${Math.round(one.peakAtMs / 1000)}`);
    }
  });

  test("most of what the sky is doing is not worth a notification", () => {
    // The honest proportion, and the reason this feature is not a firehose: at
    // any hour most passes are in daylight, in the Earth's shadow, or too faint
    // — and the app is drawing all of them quite happily.
    expect(upcomingPasses(week, catalog, observer).length).toBeGreaterThan(alerts.length);
  });
});
