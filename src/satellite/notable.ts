import { NOTABLE_SATELLITES } from "../constants";
import { SatelliteCategory } from "./categories";

/**
 * Which satellites besides the landmarks get a name on the sky, and why.
 *
 * There are too many marks to name them all, so a few earn it by standing out
 * from the rest: the nearest, the farthest, and one navigation satellite. The
 * landmarks are not chosen here — they are always named (`markerScene.ts`) —
 * and cannot take one of these roles.
 *
 * **Chosen from the whole sky, not from the frame.** What is on the screen
 * changes every time the phone moves, and a name that depended on it would
 * change with it: turn away and back, and a different satellite would be "the
 * nearest". Every object above the elevation mask is considered wherever the
 * camera is pointing, so turning the phone only decides which of the named ones
 * are in view.
 *
 * **Held, not recomputed.** A satellite keeps its role until it sets, is
 * filtered out, or a challenger beats it by a clear margin once the role has
 * been held for a while. See `NOTABLE_SATELLITES`.
 */
export type NotableRole = "closest" | "farthest" | "navigation";

/** The roles, in the order they are filled and their names win a collision. */
export const NOTABLE_ROLES: readonly NotableRole[] = ["closest", "farthest", "navigation"];

/** What the choice is made from: one satellite above the elevation mask. */
export type NotableCandidate = {
  name: string;
  category: SatelliteCategory;
  rangeKm: number;
  elevationDeg: number;
};

type Rule = {
  /** Whether this satellite may hold the role at all. */
  eligible: (candidate: NotableCandidate) => boolean;
  /** Higher is better. */
  score: (candidate: NotableCandidate) => number;
  /** Whether a challenger is better by enough to take the role from its holder. */
  beats: (challenger: NotableCandidate, holder: NotableCandidate) => boolean;
};

const notLandmark = (candidate: NotableCandidate): boolean => candidate.category !== "LANDMARK";

const RULES: Record<NotableRole, Rule> = {
  closest: {
    eligible: notLandmark,
    score: (candidate) => -candidate.rangeKm,
    beats: (challenger, holder) =>
      challenger.rangeKm <= holder.rangeKm * (1 - NOTABLE_SATELLITES.closestMargin)
  },
  farthest: {
    eligible: notLandmark,
    score: (candidate) => candidate.rangeKm,
    beats: (challenger, holder) =>
      challenger.rangeKm >= holder.rangeKm * (1 + NOTABLE_SATELLITES.farthestMargin)
  },
  navigation: {
    eligible: (candidate) => candidate.category === "NAVIGATION",
    score: (candidate) => candidate.elevationDeg,
    beats: (challenger, holder) =>
      challenger.elevationDeg >= holder.elevationDeg + NOTABLE_SATELLITES.navigationMarginDeg
  }
};

type Holder = { name: string; sinceMs: number };

/**
 * The roles and who holds them, carried from one choice to the next.
 *
 * Timed on the sky's clock rather than the display's, so the replay harness
 * makes the same choices whatever speed it is played at.
 */
export class NotableSatellites {
  private readonly holders = new Map<NotableRole, Holder>();
  private readonly roles = new Map<string, NotableRole>();
  private chosenAtMs: number | null = null;

  /** Whether it is time to choose again. Asked first, so a frame that is not pays nothing. */
  due(atMs: number): boolean {
    const last = this.chosenAtMs;
    return (
      last === null || atMs < last || atMs - last >= NOTABLE_SATELLITES.intervalSeconds * 1000
    );
  }

  /** Chooses again, from every satellite above the elevation mask at `atMs`. */
  choose(candidates: readonly NotableCandidate[], atMs: number): void {
    this.chosenAtMs = atMs;
    this.roles.clear();
    const byName = new Map(candidates.map((candidate) => [candidate.name, candidate]));
    const holdMs = NOTABLE_SATELLITES.holdSeconds * 1000;

    for (const role of NOTABLE_ROLES) {
      const rule = RULES[role];
      // One role per satellite, and the earlier role keeps it.
      const open = (candidate: NotableCandidate): boolean =>
        rule.eligible(candidate) && !this.roles.has(candidate.name);

      let best: NotableCandidate | null = null;
      for (const candidate of candidates) {
        if (open(candidate) && (best === null || rule.score(candidate) > rule.score(best))) {
          best = candidate;
        }
      }

      const held = this.holders.get(role);
      const holder = held ? byName.get(held.name) : undefined;
      let chosen: NotableCandidate | null;
      if (held && holder && open(holder)) {
        // Still up and still allowed: kept unless the best is clearly better and
        // the role has been held long enough. A clock that went backwards is a
        // seek, and a hold from the other side of one means nothing.
        const settled = atMs - held.sinceMs >= holdMs || atMs < held.sinceMs;
        chosen = best && best !== holder && settled && rule.beats(best, holder) ? best : holder;
      } else {
        // Set, filtered out, or never held: the best takes it at once.
        chosen = best;
      }

      if (chosen === null) {
        this.holders.delete(role);
        continue;
      }
      if (chosen.name !== held?.name) this.holders.set(role, { name: chosen.name, sinceMs: atMs });
      this.roles.set(chosen.name, role);
    }
  }

  /** The role a satellite holds, if it holds one. */
  roleOf(name: string): NotableRole | undefined {
    return this.roles.get(name);
  }

  /** Forgets every role: the sky has jumped, and who was nearest before it has no bearing. */
  reset(): void {
    this.holders.clear();
    this.roles.clear();
    this.chosenAtMs = null;
  }
}
