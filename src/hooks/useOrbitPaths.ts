import { MutableRefObject, useEffect, useRef, useState } from "react";
import { LANDMARK_PATHS } from "../constants";
import { toRadians } from "../math/angles";
import { SatelliteCatalog } from "../satellite/catalog";
import { planSkyPaths, SkyPass } from "../satellite/orbitPath";
import { UpcomingPass, upcomingPasses } from "../satellite/upcomingPasses";
import { startSlicing } from "../timeSlice";
import { ObserverLocation, OrbitEpoch } from "../types";

type Options = {
  catalog: SatelliteCatalog;
  /** Time and observer as of the newest frame, which is what a plan is made at. */
  epochRef: MutableRefObject<OrbitEpoch>;
  /**
   * Whether the landmark tier is being drawn at all.
   *
   * Filtered out, nothing draws a path, and planning one is a few thousand
   * propagations spent on a line nobody asked for. Turning the tier back on
   * plans again within `CHECK_INTERVAL_MS` rather than immediately, which is
   * the same delay every other change to the plan has.
   */
  enabled: boolean;
};

/** A plan, in the two forms the app reads it in. */
export type OrbitPaths = {
  /**
   * The arcs themselves, for the frame loop to project.
   *
   * A ref rather than state, for the reason everything on that path is a ref:
   * the only thing that reads them is the loop, which is already running at
   * display rate and does not need React to tell it that a new plan has
   * landed. Publishing them would re-render the whole scene once a minute to
   * hand a value to something that reads it sixty times a second anyway.
   */
  pathsRef: MutableRefObject<SkyPass[]>;
  /**
   * The same passes as a list, for the panel that says what is coming.
   *
   * State, because this one is read by a view rather than by the loop, and a
   * ref nothing re-renders for would leave the panel showing the plan it
   * mounted with. The cost is the render this hook's owner does when a plan
   * lands, which is once a minute against the sixty a second the loop is
   * already doing — and the loop itself is untouched by it, since everything it
   * reads is a ref. Identity is stable between plans, so a render that changes
   * nothing else does not reach the panel either. See `upcomingPasses`.
   */
  upcoming: UpcomingPass[];
};

/**
 * The landmarks' upcoming passes, replanned in the background as the hours go
 * by.
 *
 * Nothing here is on a deadline. The plan in hand goes on being drawn — trimmed
 * to the present on every frame (`pathFrom`) — until its replacement is
 * finished, so the work can take as many slices as it needs and an arrival a
 * second late is invisible.
 */
export function useOrbitPaths({ catalog, epochRef, enabled }: Options): OrbitPaths {
  const pathsRef = useRef<SkyPass[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingPass[]>(NO_PASSES);

  useEffect(() => {
    if (!enabled) {
      pathsRef.current = [];
      // The tier is filtered off, so there are no lines to point anyone at and
      // the panel goes with them: a list of passes with nothing drawn for them
      // is a list of rows that open a card about an object the sky is not
      // showing. `NO_PASSES` rather than a fresh array, so switching the filter
      // twice does not render the panel's owner for an unchanged empty list.
      setUpcoming(NO_PASSES);
      return;
    }

    let dropped = false;
    let planning = false;
    let plannedAtMs: number | null = null;
    let plannedFrom: ObserverLocation | null = null;

    const plan = () => {
      if (planning) return;
      const { time, observer } = epochRef.current;
      const atMs = time.getTime();
      if (!stale(plannedAtMs, plannedFrom, atMs, observer)) return;

      planning = true;
      // Not awaited: this is a background job on a timer, and its result is
      // published by writing the ref rather than returned to anyone. Nothing
      // catches, either — the arithmetic below is the same SGP4 the frame loop
      // runs sixty times a second, so a failure here is a bug rather than a
      // condition, and one swallowed on a timer is a bug that never surfaces.
      planSkyPaths(catalog, atMs, observer, startSlicing())
        .then((passes) => {
          if (dropped) return;
          pathsRef.current = passes;
          // Described here rather than in the panel, because what it costs is a
          // propagation and a sun position per pass and this is the one place
          // that already knows a plan is new. Off the frame thread, on the same
          // background job, against the observer the plan was made for.
          setUpcoming(passes.length === 0 ? NO_PASSES : upcomingPasses(passes, catalog, observer));
          plannedAtMs = atMs;
          plannedFrom = observer;
        })
        .finally(() => {
          planning = false;
        });
    };

    plan();
    const timer = setInterval(plan, CHECK_INTERVAL_MS);
    return () => {
      dropped = true;
      clearInterval(timer);
    };
  }, [catalog, enabled, epochRef]);

  return { pathsRef, upcoming };
}

/**
 * The empty list, shared.
 *
 * A plan with nothing in it happens twice — the landmark tier switched off, and
 * a sky where nothing rises for three hours, which at high latitudes is most of
 * the tier most of the time. Handing back the same array both times is what
 * lets React bail out of the render instead of taking a new empty array as a
 * change.
 */
const NO_PASSES: UpcomingPass[] = [];

/**
 * Whether the plan in hand still describes the sky.
 *
 * Three ways it stops doing so, and the third is the reason this is a
 * comparison rather than a countdown: time passing, the observer walking away
 * from where the plan was made, and the clock *jumping* — which is a seek under
 * the replay harness, and which an elapsed-time test would read as no time
 * having passed at all when the video is scrubbed backwards.
 */
function stale(
  plannedAtMs: number | null,
  plannedFrom: ObserverLocation | null,
  atMs: number,
  observer: ObserverLocation
): boolean {
  if (plannedAtMs === null || plannedFrom === null) return true;
  if (Math.abs(atMs - plannedAtMs) >= LANDMARK_PATHS.refreshSeconds * 1000) return true;
  return movedFrom(plannedFrom, observer) > LANDMARK_PATHS.observerDriftMetres;
}

/**
 * How far the observer is from where the plan was made, in metres. Flat-Earth
 * arithmetic, as in `SkyMemory`: exact enough over the few hundred metres this
 * is comparing against.
 */
function movedFrom(origin: ObserverLocation, observer: ObserverLocation): number {
  const north = (observer.latitudeDeg - origin.latitudeDeg) * METRES_PER_DEGREE;
  const east =
    (observer.longitudeDeg - origin.longitudeDeg) *
    METRES_PER_DEGREE *
    Math.cos(toRadians(origin.latitudeDeg));
  return Math.hypot(north, east);
}

const METRES_PER_DEGREE = 111320;

/**
 * How often the plan is checked against the clock, in milliseconds.
 *
 * Not how often it is made: that is `LANDMARK_PATHS.refreshSeconds`, and this
 * is only the grain the check is taken at. Five seconds is fine enough that a
 * seek is answered while the person is still looking at where they seeked to,
 * and coarse enough that a check costs nothing between them — it is two
 * subtractions and a distance.
 */
const CHECK_INTERVAL_MS = 5000;
