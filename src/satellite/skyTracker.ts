import { SATELLITE_MARKERS, SATELLITE_TRACKING } from "../constants";
import {
  createObserverFrame,
  eciToEnuInFrame,
  elevationDeg,
  gmstAt
} from "../coordinates/transform";
import { EciPosition, EciState, ObserverLocation, SatelliteFix } from "../types";
import { CatalogEntry, SatelliteCatalog } from "./catalog";
import { propagateStateAt } from "./propagator";

/** What the tracker remembers about one catalog entry between propagations. */
type TrackedEntry = {
  entry: CatalogEntry;
  /** Newest SGP4 state, or `null` while SGP4 cannot place this object. */
  state: EciState | null;
  /** The instant `state` was propagated to, in epoch milliseconds. */
  stateAtMs: number;
  /**
   * Whether this object was near enough to the horizon at its last propagation
   * to be worth carrying forward every frame. See `candidateElevationMarginDeg`.
   */
  candidate: boolean;
};

/** What the tracker is carrying, for the debug overlay's propagation readout. */
export type SkyTrackerStats = {
  /** Catalog entries the tracker is responsible for. */
  entries: number;
  /** Entries near enough to the horizon to be carried forward every frame. */
  candidates: number;
  /** How far the rolling sweep has walked through the catalog, in `[0, 1]`. */
  sweepProgress: number;
  /** Whether the opening full pass has finished. */
  primed: boolean;
};

/**
 * Where the whole catalog is, every frame, without propagating it every frame.
 *
 * A full propagation costs ~100 ms — six display frames — so any fixed tick
 * leaves the main thread propagating whenever it is not drawing, and markers
 * lurching once per tick. Two mechanisms replace it:
 *
 * 1. **A rolling sweep.** Each `sweep` re-propagates a slice sized so a full
 *    pass takes `sweepPeriodSeconds` whatever the frame rate, keeping every
 *    state within a couple of seconds of the present.
 * 2. **Inertial carry-forward.** SGP4 returns velocity with position, so
 *    between sweeps an object sits at `position + velocity * dt` — well under
 *    a thousandth of a degree of error over that window.
 *
 * The per-frame cost is then fixed and small: a slice of SGP4, plus one frame
 * transform per candidate.
 */
export class SkyTracker {
  private readonly tracked: TrackedEntry[];
  /** Elevation at or above which a satellite is drawn. */
  private readonly minimumElevationDeg: number;
  /** How far through the rolling sweep the cursor has walked. */
  private cursor = 0;
  /** Set once the first sweep has covered the whole catalog. */
  private primed = false;
  /** How many entries are currently flagged as candidates, kept as they flip. */
  private candidateCount = 0;
  /** Replay time of the last sweep, in epoch milliseconds. */
  private sweptAtMs = 0;

  constructor(catalog: SatelliteCatalog, minimumElevationDeg: number) {
    this.minimumElevationDeg = minimumElevationDeg;
    this.tracked = catalog.entries.map((entry) => ({
      entry,
      state: null,
      stateAtMs: 0,
      candidate: false
    }));
  }

  /**
   * Advances part of the catalog to `when`, and re-flags which objects are
   * near enough to the horizon to be worth following.
   *
   * `elapsedSeconds` is how long the frame being charged took, so a slow frame
   * covers more ground and a full pass still takes the same time. Two cases
   * sweep everything: the first call, which would otherwise have satellites
   * fading in over the opening pass, and a seek.
   */
  sweep(when: Date, observer: ObserverLocation, elapsedSeconds: number): void {
    const whenMs = when.getTime();
    // A seek outruns any sweep and moves the sky with it, so the last pass's
    // candidate set no longer applies. Redo the lot on the frame the user
    // already expects to be a discontinuity.
    const jumped =
      Math.abs(whenMs - this.sweptAtMs) > SATELLITE_TRACKING.maxExtrapolationSeconds * 1000;
    const count = this.primed && !jumped ? this.sliceSize(elapsedSeconds) : this.tracked.length;
    this.sweptAtMs = whenMs;
    if (count === 0) return;

    const gmst = gmstAt(when);
    const frame = createObserverFrame(observer);
    const threshold = this.minimumElevationDeg - SATELLITE_TRACKING.candidateElevationMarginDeg;

    for (let done = 0; done < count; done += 1) {
      const tracked = this.tracked[this.cursor];
      this.cursor += 1;
      if (this.cursor >= this.tracked.length) {
        this.cursor = 0;
        this.primed = true;
      }

      this.refresh(tracked, whenMs);
      const candidate =
        tracked.state !== null &&
        elevationDeg(eciToEnuInFrame(tracked.state.position, gmst, frame)) > threshold;
      if (candidate !== tracked.candidate) this.candidateCount += candidate ? 1 : -1;
      tracked.candidate = candidate;
    }
  }

  /**
   * The satellites above the elevation mask at `when`, in the observer's local
   * frame.
   *
   * Only swept candidates are considered, so this costs a frame transform per
   * nearby satellite rather than a propagation per entry — but the elevation
   * test uses the position at `when`, so a marker appears on the frame it
   * really crosses the mask. Not a pure read: a state too stale to carry
   * forward is re-propagated here, which is how a seek is answered immediately.
   */
  fixesAt(when: Date, observer: ObserverLocation): SatelliteFix[] {
    const gmst = gmstAt(when);
    const frame = createObserverFrame(observer);
    const whenMs = when.getTime();
    // The trail's far end, resolved at its own sidereal time rather than this
    // one. Reusing `gmst` would leave the Earth still underneath the orbit,
    // and a geostationary satellite is motionless precisely because the two
    // cancel — held still, it would grow the longest trail on the frame.
    const aheadGmst = gmstAt(new Date(whenMs + SATELLITE_MARKERS.trailSeconds * 1000));
    const fixes: SatelliteFix[] = [];

    for (const tracked of this.tracked) {
      if (!tracked.candidate) continue;
      const position = this.positionAt(tracked, whenMs);
      if (!position) continue;

      const enu = eciToEnuInFrame(position, gmst, frame);
      // Written as a positive test so a non-finite elevation excludes the
      // satellite instead of admitting it.
      if (!(elevationDeg(enu) > this.minimumElevationDeg)) continue;

      fixes.push({
        name: tracked.entry.name,
        category: tracked.entry.category,
        parked: tracked.entry.parked,
        position: enu,
        nextPosition: eciToEnuInFrame(this.aheadOf(tracked, position), aheadGmst, frame)
      });
    }

    return fixes;
  }

  /** A summary of the tracker's state. Cheap: nothing here is recounted. */
  stats(): SkyTrackerStats {
    return {
      entries: this.tracked.length,
      candidates: this.candidateCount,
      sweepProgress: this.tracked.length === 0 ? 1 : this.cursor / this.tracked.length,
      primed: this.primed
    };
  }

  /**
   * Where a tracked object will be at `aheadMs`, on its current velocity.
   *
   * Deliberately not a propagation: this feeds the length of a trail a few
   * pixels long, and the whole point of the carry-forward is that the linear
   * term is good to a fraction of a pixel over this kind of interval. Falls
   * back to standing still, which draws no trail — the honest answer when
   * there is no velocity to go on.
   */
  private aheadOf(tracked: TrackedEntry, position: EciPosition): EciPosition {
    const velocity = tracked.state?.velocity;
    if (!velocity) return position;
    const dtSeconds = SATELLITE_MARKERS.trailSeconds;
    return {
      x: position.x + velocity.x * dtSeconds,
      y: position.y + velocity.y * dtSeconds,
      z: position.z + velocity.z * dtSeconds
    };
  }

  /**
   * The share of the catalog this frame must cover for a full pass to take
   * `sweepPeriodSeconds`.
   *
   * Capped, since `elapsedSeconds` is however long the last frame took: a
   * backgrounded tab would otherwise hand one frame the whole catalog.
   * Whatever the cap defers, `positionAt` re-propagates on demand.
   */
  private sliceSize(elapsedSeconds: number): number {
    const share = Math.max(elapsedSeconds, 0) / SATELLITE_TRACKING.sweepPeriodSeconds;
    const capped = Math.min(share, SATELLITE_TRACKING.maxSweepFraction);
    return Math.min(this.tracked.length, Math.ceil(capped * this.tracked.length));
  }

  /** Where a tracked object is at `whenMs`, carrying its state forward. */
  private positionAt(tracked: TrackedEntry, whenMs: number): EciPosition | null {
    const dtSeconds = (whenMs - tracked.stateAtMs) / 1000;
    // Past the window the linear term no longer stands in for the orbit, and a
    // seek can strand the state arbitrarily far away in either direction.
    if (Math.abs(dtSeconds) > SATELLITE_TRACKING.maxExtrapolationSeconds) {
      this.refresh(tracked, whenMs);
      return tracked.state?.position ?? null;
    }

    const state = tracked.state;
    if (!state) return null;
    return {
      x: state.position.x + state.velocity.x * dtSeconds,
      y: state.position.y + state.velocity.y * dtSeconds,
      z: state.position.z + state.velocity.z * dtSeconds
    };
  }

  private refresh(tracked: TrackedEntry, whenMs: number): void {
    tracked.state = propagateStateAt(tracked.entry.satrec, new Date(whenMs));
    tracked.stateAtMs = whenMs;
  }
}
