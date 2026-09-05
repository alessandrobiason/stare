import { axesFromAttitude } from "../camera/attitude";
import { FrameLens } from "../camera/projection";
import { SKY_MEMORY } from "../constants";
import { clamp, toDegrees, toRadians, wrapDegrees360 } from "../math/angles";
import { EnuPosition, ObserverLocation } from "../types";
import { AnchoredSkyMask, skyProbe } from "./anchoredMask";

/** What the memory is holding, for the debug overlay. */
export type SkyMemoryStats = {
  /** Cells carrying a reading inside the retention window. */
  cells: number;
  /** Cells in the grid, whether looked at or not. */
  capacity: number;
  /**
   * Share of the sky above the memory's floor that has been looked at, in
   * `[0, 1]`, weighted by solid angle so a row near the zenith counts for what
   * it actually covers rather than for its cell count.
   */
  coverage: number;
};

/** Metres per degree of latitude, near enough for a walk across a square. */
const METRES_PER_DEGREE = 111320;

/**
 * Everything the segmenter has said about the sky, kept where the sky is
 * rather than where the frame was.
 *
 * A mask answers for one frame, and the frame moves. That is handled — the aim
 * travels with the mask, so what it says about a direction survives the phone
 * turning (`AnchoredSkyMask`) — but only until the next pass replaces it, and
 * the replacement covers wherever the camera is pointing *now*. So the app
 * knows about a fiftieth of the sky at a time, and forgets the rest once a
 * second. Panning is then two waits rather than one: new sky waits for a pass
 * to reach it, which is unavoidable, and sky that was mapped a moment ago waits
 * all over again, which is not.
 *
 * This is the second wait removed. Every pass is also written into a grid
 * indexed by azimuth and elevation — fixed to the sky, so nothing the camera
 * does moves it — and a direction the live mask cannot answer for is asked of
 * the grid instead. Turn back towards sky the phone has already seen and the
 * markers are there on the frame the turn brings them into, because the answer
 * was worked out a pass or ten ago and nothing since has invalidated it.
 *
 * The live mask still wins wherever it reaches: it is the same sky looked at
 * more recently, and the memory is only ever the fallback. What the memory is
 * emphatically not is a way around "an unlooked-at direction is not a clear
 * line of sight" — a cell answers only if something actually looked at it, and
 * only for as long as looking at it means anything:
 *
 * - **Age.** A reading expires after `maxAgeSeconds` and the direction goes
 *   back to having no answer. Buildings do not move, but a phone in a hand does,
 *   and this bounds how long the app will speak for one it has not rechecked.
 * - **Parallax.** The grid is a map of *directions*, which is only fixed while
 *   the observer is. Move `observerDriftMetres` from where the memory started
 *   and all of it is dropped, because a roofline three degrees wide at thirty
 *   metres is somewhere else entirely from across the street.
 * - **Coverage.** Readings are interpolated between cell centres, as the mask's
 *   own are, and a direction whose neighbouring cells are mostly empty gets no
 *   answer rather than an extrapolated one.
 */
export class SkyMemory {
  private readonly columns: number;
  private readonly rows: number;
  /** Newest sky confidence per cell, row-major, elevation-major. */
  private readonly confidence: Float32Array;
  /** When each cell was last written, in seconds on the caller's clock. */
  private readonly seenAtSeconds: Float32Array;
  /** East and north components of each column's azimuth, at unit elevation. */
  private readonly columnEast: Float64Array;
  private readonly columnNorth: Float64Array;
  /** Cosine and sine of each row's centre elevation. */
  private readonly rowCos: Float64Array;
  private readonly rowSin: Float64Array;
  /** Solid angle of a row's cells, relative to the whole grid's. */
  private readonly rowWeight: Float64Array;
  private readonly totalWeight: number;
  /**
   * Where the observer was when the current contents started being collected.
   * `null` when there is nothing to invalidate.
   */
  private origin: ObserverLocation | null = null;

  constructor() {
    const cell = SKY_MEMORY.cellDeg;
    this.columns = Math.round(360 / cell);
    this.rows = Math.round((90 - SKY_MEMORY.floorElevationDeg) / cell);
    this.confidence = new Float32Array(this.columns * this.rows);
    this.seenAtSeconds = new Float32Array(this.columns * this.rows).fill(-Infinity);

    // The grid is walked twice a second — once per pass to fill it, once per
    // satellite per frame to read it — so its geometry is tabulated here rather
    // than recomputed. Two trigonometric calls per cell either way, and there
    // are tens of thousands of cells.
    this.columnEast = new Float64Array(this.columns);
    this.columnNorth = new Float64Array(this.columns);
    for (let column = 0; column < this.columns; column += 1) {
      const azimuth = toRadians((column + 0.5) * cell);
      this.columnEast[column] = Math.sin(azimuth);
      this.columnNorth[column] = Math.cos(azimuth);
    }

    this.rowCos = new Float64Array(this.rows);
    this.rowSin = new Float64Array(this.rows);
    this.rowWeight = new Float64Array(this.rows);
    let total = 0;
    for (let row = 0; row < this.rows; row += 1) {
      const elevation = toRadians(this.rowElevationDeg(row));
      this.rowCos[row] = Math.cos(elevation);
      this.rowSin[row] = Math.sin(elevation);
      // A cell of constant angular size covers less sky the higher it sits.
      this.rowWeight[row] = Math.max(this.rowCos[row], 0);
      total += this.rowWeight[row] * this.columns;
    }
    this.totalWeight = total;
  }

  /**
   * Writes what `anchored` says into the grid, and drops everything if the
   * observer has moved far enough for the directions to have changed.
   *
   * Driven by cells of the grid rather than by cells of the mask, which is what
   * keeps the two resolutions independent: each grid cell in view is projected
   * into the mask's frame and read there through the same interpolation the
   * markers are read through, so nothing is aliased on the way in and the
   * memory cannot disagree with the mask it came from.
   */
  absorb(
    anchored: AnchoredSkyMask,
    lens: FrameLens,
    observer: ObserverLocation,
    nowSeconds: number
  ): void {
    if (this.origin && this.hasMovedFrom(observer)) this.reset();
    if (!this.origin) this.origin = observer;

    const probe = skyProbe(anchored, lens);
    const forward = axesFromAttitude(anchored.attitude).forward;
    const centreElevationDeg = toDegrees(Math.asin(clamp(forward.up, -1, 1)));
    const centreAzimuthDeg = wrapDegrees360(toDegrees(Math.atan2(forward.east, forward.north)));
    // Half the frame's diagonal, plus a cell so that the band cannot end just
    // inside the frame's corner. `probe` rejects whatever this over-reaches by.
    const radiusDeg =
      toDegrees(Math.atan(Math.hypot(lens.horizontalScale, lens.verticalScale))) +
      SKY_MEMORY.cellDeg;

    const firstRow = Math.max(0, this.rowAt(centreElevationDeg - radiusDeg));
    const lastRow = Math.min(this.rows - 1, this.rowAt(centreElevationDeg + radiusDeg));
    const cosRadius = Math.cos(toRadians(radiusDeg));
    const centreCos = Math.cos(toRadians(centreElevationDeg));
    const centreSin = Math.sin(toRadians(centreElevationDeg));
    // One direction, rewritten per cell. `probe` reads it and keeps nothing, and
    // this loop runs tens of thousands of times a pass: an object each would be
    // most of what the pass costs, and all of it garbage.
    const direction: EnuPosition = { east: 0, north: 0, up: 0 };

    for (let row = firstRow; row <= lastRow; row += 1) {
      const cos = this.rowCos[row];
      const sin = this.rowSin[row];
      // How far round the row the frame's own cap reaches — the exact
      // half-width rather than a bound on it, because azimuth converges towards
      // the zenith and a loose one scans two or three times the sky the camera
      // can see, at a projection a cell.
      const halfWidthDeg = this.capHalfWidthDeg(cosRadius, centreSin, centreCos, sin, cos);
      if (halfWidthDeg <= 0) continue;

      const span = Math.min(this.columns, Math.ceil((2 * halfWidthDeg) / SKY_MEMORY.cellDeg) + 1);
      const start = Math.floor((centreAzimuthDeg - halfWidthDeg) / SKY_MEMORY.cellDeg);
      direction.up = sin;

      for (let step = 0; step < span; step += 1) {
        const column = this.wrapColumn(start + step);
        direction.east = this.columnEast[column] * cos;
        direction.north = this.columnNorth[column] * cos;
        const value = probe(direction);
        if (value === null) continue;

        const index = row * this.columns + column;
        this.confidence[index] = value;
        this.seenAtSeconds[index] = nowSeconds;
      }
    }
  }

  /**
   * Reads the memory in world directions, the way `skyProbe` reads a mask.
   *
   * Returns a function from an ENU direction to the sky confidence remembered
   * there, or `null` where nothing looked recently enough to say. The cutoff is
   * resolved once for the whole frame rather than per direction, which is what
   * makes this affordable for every tracked satellite on every frame.
   */
  probe(nowSeconds: number): (position: EnuPosition) => number | null {
    const cutoff = nowSeconds - SKY_MEMORY.maxAgeSeconds;

    return (position: EnuPosition): number | null => {
      const length = Math.hypot(position.east, position.north, position.up);
      if (!(length > 0)) return null;

      const elevationDeg = toDegrees(Math.asin(clamp(position.up / length, -1, 1)));
      if (elevationDeg < SKY_MEMORY.floorElevationDeg) return null;
      const azimuthDeg = wrapDegrees360(toDegrees(Math.atan2(position.east, position.north)));

      // Cell coordinates measure from cell centres, so a direction sits between
      // four of them — interpolated rather than snapped, for the same reason
      // `sampleMask` interpolates: a satellite tracking across a cell boundary
      // must not step as it crosses.
      const y = clamp(
        (elevationDeg - SKY_MEMORY.floorElevationDeg) / SKY_MEMORY.cellDeg - 0.5,
        0,
        this.rows - 1
      );
      const x = azimuthDeg / SKY_MEMORY.cellDeg - 0.5;
      const top = Math.floor(y);
      const bottom = Math.min(top + 1, this.rows - 1);
      const left = Math.floor(x);
      const yWeight = y - top;
      const xWeight = x - left;

      let sum = 0;
      let weight = 0;
      const add = (row: number, column: number, share: number): void => {
        const index = row * this.columns + this.wrapColumn(column);
        if (this.seenAtSeconds[index] < cutoff) return;
        sum += this.confidence[index] * share;
        weight += share;
      };

      add(top, left, (1 - xWeight) * (1 - yWeight));
      add(top, left + 1, xWeight * (1 - yWeight));
      add(bottom, left, (1 - xWeight) * yWeight);
      add(bottom, left + 1, xWeight * yWeight);

      // Mostly outside what has been looked at: the honest answer is the same
      // one an unaimed mask gives, which is no answer at all.
      if (weight < SKY_MEMORY.minimumCoverage) return null;
      return sum / weight;
    };
  }

  /** A summary of what is held. Walks the grid, so not for the frame loop. */
  stats(nowSeconds: number): SkyMemoryStats {
    const cutoff = nowSeconds - SKY_MEMORY.maxAgeSeconds;
    let cells = 0;
    let covered = 0;

    for (let row = 0; row < this.rows; row += 1) {
      const base = row * this.columns;
      for (let column = 0; column < this.columns; column += 1) {
        if (this.seenAtSeconds[base + column] < cutoff) continue;
        cells += 1;
        covered += this.rowWeight[row];
      }
    }

    return {
      cells,
      capacity: this.columns * this.rows,
      coverage: this.totalWeight === 0 ? 0 : covered / this.totalWeight
    };
  }

  /**
   * Forgets everything.
   *
   * For when what was looked at no longer describes what is there: the observer
   * moving, or a seek in the replay harness, which lands somewhere else in a
   * recording that was walked while it was made.
   */
  reset(): void {
    this.seenAtSeconds.fill(-Infinity);
    this.origin = null;
  }

  /**
   * Half the azimuth a cap of angular radius `acos(cosRadius)` about an
   * elevation spans at another elevation, in degrees — zero where the cap does
   * not reach that row at all, 180 where it swallows the whole circle.
   *
   * The spherical law of cosines, rearranged: two directions an angle apart in
   * elevation have the rest of their separation in azimuth.
   */
  private capHalfWidthDeg(
    cosRadius: number,
    centreSin: number,
    centreCos: number,
    rowSin: number,
    rowCos: number
  ): number {
    const denominator = centreCos * rowCos;
    // One of the two is at the pole, where azimuth means nothing: the row is
    // either inside the cap entirely or outside it entirely.
    if (denominator < 1e-9) {
      return centreSin * rowSin >= cosRadius ? 180 : 0;
    }

    const cosOffset = (cosRadius - centreSin * rowSin) / denominator;
    if (cosOffset >= 1) return 0;
    if (cosOffset <= -1) return 180;
    return toDegrees(Math.acos(cosOffset));
  }

  /** Centre elevation of a row, in degrees. */
  private rowElevationDeg(row: number): number {
    return SKY_MEMORY.floorElevationDeg + (row + 0.5) * SKY_MEMORY.cellDeg;
  }

  /** The row whose band contains `elevationDeg`, unclamped. */
  private rowAt(elevationDeg: number): number {
    return Math.floor((elevationDeg - SKY_MEMORY.floorElevationDeg) / SKY_MEMORY.cellDeg);
  }

  /** Azimuth is a circle: column -1 is the one west of north, not out of bounds. */
  private wrapColumn(column: number): number {
    return ((column % this.columns) + this.columns) % this.columns;
  }

  /**
   * Whether the observer has left the neighbourhood the memory was collected
   * from. Flat-Earth arithmetic, which is exact enough over the tens of metres
   * this is comparing against.
   */
  private hasMovedFrom(observer: ObserverLocation): boolean {
    const origin = this.origin;
    if (!origin) return false;

    const north = (observer.latitudeDeg - origin.latitudeDeg) * METRES_PER_DEGREE;
    const east =
      (observer.longitudeDeg - origin.longitudeDeg) *
      METRES_PER_DEGREE *
      Math.cos(toRadians(origin.latitudeDeg));
    return Math.hypot(north, east) > SKY_MEMORY.observerDriftMetres;
  }
}
