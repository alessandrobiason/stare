import { NOTABLE_SATELLITES } from "../constants";
import { SATELLITE_CATEGORIES, SatelliteCategory } from "./categories";

/**
 * Which satellites besides the landmarks get a name on the sky, and why.
 *
 * There are too many marks to name them all, so one per category earns it —
 * the landmarks are not chosen here, they are always named (`markerScene.ts`)
 * and cannot take a category's slot.
 *
 * **Chosen from the frame, not the whole sky.** Turning the phone is what
 * decides which satellites are worth naming: there is no "the nearest
 * satellite" independent of where the camera is pointed, only the nearest of
 * whatever it currently sees. So every choice here is made from the
 * satellites actually on the frame this moment, category by category, nearest
 * first within each.
 *
 * **Held, not recomputed from scratch.** A phone is never perfectly still,
 * and picking the literal nearest afresh every frame would swap a category's
 * name every time the framing nudged by a few pixels — the "ballare" a small
 * tilt up and down must not cause. A satellite keeps its category's name
 * until it leaves the frame or a clearly better one has been available for a
 * while. See `NOTABLE_SATELLITES`.
 */
export type NotableCandidate = {
  name: string;
  category: SatelliteCategory;
  rangeKm: number;
};

/** Every category besides the landmarks, which are named on their own. */
const REPRESENTATIVE_CATEGORIES = SATELLITE_CATEGORIES.filter(
  (category) => category !== "LANDMARK"
);

/** Whether a challenger is close enough to be worth taking a name from its holder. */
function beats(challenger: NotableCandidate, holder: NotableCandidate): boolean {
  return challenger.rangeKm <= holder.rangeKm * (1 - NOTABLE_SATELLITES.closestMargin);
}

type Holder = { name: string; sinceMs: number };

/**
 * The categories and who is carrying each one's name, carried from one choice
 * to the next.
 *
 * Timed on the sky's clock rather than the display's, so the replay harness
 * makes the same choices whatever speed it is played at.
 */
export class NotableSatellites {
  private readonly holders = new Map<SatelliteCategory, Holder>();
  private readonly representatives = new Set<string>();

  /** Chooses again, from whatever is on the frame at `atMs`. */
  choose(candidates: readonly NotableCandidate[], atMs: number): void {
    this.representatives.clear();

    const inFrame = new Map<SatelliteCategory, NotableCandidate[]>();
    for (const candidate of candidates) {
      if (candidate.category === "LANDMARK") continue;
      const list = inFrame.get(candidate.category);
      if (list) list.push(candidate);
      else inFrame.set(candidate.category, [candidate]);
    }

    for (const category of REPRESENTATIVE_CATEGORIES) {
      const onFrame = inFrame.get(category);

      let best: NotableCandidate | null = null;
      if (onFrame) {
        for (const candidate of onFrame) {
          if (best === null || candidate.rangeKm < best.rangeKm) best = candidate;
        }
      }

      const held = this.holders.get(category);
      const holder = held && onFrame ? onFrame.find((candidate) => candidate.name === held.name) : undefined;

      let chosen: NotableCandidate | null;
      if (held && holder) {
        // Still on the frame: kept unless the best is clearly better and the
        // name has been held long enough to be worth contesting. A clock that
        // went backwards is a seek, and a hold from the other side of one
        // means nothing.
        const settled = atMs - held.sinceMs >= NOTABLE_SATELLITES.holdSeconds * 1000 || atMs < held.sinceMs;
        chosen = best && best !== holder && settled && beats(best, holder) ? best : holder;
      } else {
        // Left the frame, or never held: the best takes it at once, so a
        // category with anything on screen is never left unnamed.
        chosen = best;
      }

      if (chosen === null) {
        this.holders.delete(category);
        continue;
      }
      if (chosen.name !== held?.name) this.holders.set(category, { name: chosen.name, sinceMs: atMs });
      this.representatives.add(chosen.name);
    }
  }

  /** Whether this satellite is carrying its category's name right now. */
  isRepresentative(name: string): boolean {
    return this.representatives.has(name);
  }

  /** Forgets every hold: the sky has jumped, and who was on frame before it has no bearing. */
  reset(): void {
    this.holders.clear();
    this.representatives.clear();
  }
}
