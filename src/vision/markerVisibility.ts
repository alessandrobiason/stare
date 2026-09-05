import { MARKER_VISIBILITY, SKY_CONFIDENCE_THRESHOLD } from "../constants";
import { clamp } from "../math/angles";

/** What the filter remembers about one marker between frames. */
type Track = {
  /** Low-passed sky confidence where this marker sits. */
  confidence: number;
  /** Which side of the band it last came down on. */
  visible: boolean;
  /** What is actually drawn, walking towards `visible` at the fade rate. */
  opacity: number;
  /** The frame this track was last sampled on, so stale ones can be dropped. */
  frame: number;
};

/**
 * Holds each marker's occlusion decision steady across mask passes.
 *
 * The sky mask is a fresh guess once a second from a single frame, and near an
 * edge — a roof line, a branch, a wall the exposure keeps rethinking — its
 * confidence sits close to the threshold and crosses it from pass to pass with
 * the phone barely moving. Tested directly, every marker over that cell flips
 * with it, so what the user sees is whole groups appearing and disappearing in
 * a still frame.
 *
 * So the mask's answer is not the marker's answer. Each marker low-passes the
 * confidence along its own path across the frame and switches only when the
 * smoothed value clears the far side of a band, which costs the mask two
 * agreeing passes to move it; the switch is then crossfaded rather than cut,
 * because a marker that disappears between two frames reads as a fault even
 * when it is correct. `MARKER_VISIBILITY` carries the arithmetic.
 *
 * Per marker rather than per cell deliberately: a satellite crossing a cell
 * boundary is not new information about the sky, and smoothing the mask itself
 * would blur the buildings' edges instead of steadying the decision at them.
 * `SkyMaskTemporalFilter` already does what can safely be done to the mask.
 *
 * A frame is `beginFrame`, a `sample` per marker, then `endFrame`. Anything not
 * sampled has left the frame — set, elevation mask, or a category switched off
 * — and is forgotten, so the map stays the size of what is on screen.
 */
export class MarkerVisibilityFilter {
  private readonly tracks = new Map<string, Track>();
  private frame = 0;
  /** Timestamp of the previous frame, in seconds. `null` before the first. */
  private lastSeconds: number | null = null;
  /** Share of the way to the newest confidence this frame moves a track. */
  private confidenceGain = 0;
  /** Opacity this frame may add or remove. */
  private fadeStep = 0;

  /** Opens a frame at `nowSeconds`, on the same clock every call shares. */
  beginFrame(nowSeconds: number): void {
    const previous = this.lastSeconds;
    this.lastSeconds = nowSeconds;
    this.frame += 1;

    const elapsed =
      previous === null
        ? 0
        : clamp(nowSeconds - previous, 0, MARKER_VISIBILITY.maxStepSeconds);
    // Exponential in time rather than per frame: the display rate is whatever
    // the phone can manage, and a filter tuned in frames would smooth twice as
    // hard at 60 Hz as at 30.
    this.confidenceGain =
      1 - Math.exp(-elapsed / MARKER_VISIBILITY.confidenceTimeConstantSeconds);
    this.fadeStep = elapsed / MARKER_VISIBILITY.fadeSeconds;
  }

  /**
   * How opaque the marker `key` should be drawn, given the sky confidence at
   * the point it has been projected to. Zero means it is behind terrain, or has
   * not faded in yet.
   */
  sample(key: string, confidence: number): number {
    const track = this.tracks.get(key);
    if (!track) {
      // Nothing to smooth yet, so the mask is taken at its word — but at zero
      // opacity, so a marker rising into the frame fades in like any other.
      this.tracks.set(key, {
        confidence,
        visible: confidence >= SKY_CONFIDENCE_THRESHOLD,
        opacity: 0,
        frame: this.frame
      });
      return 0;
    }

    track.frame = this.frame;
    track.confidence += (confidence - track.confidence) * this.confidenceGain;
    if (
      track.visible
        ? track.confidence < MARKER_VISIBILITY.hideConfidence
        : track.confidence >= MARKER_VISIBILITY.showConfidence
    ) {
      track.visible = !track.visible;
    }

    const target = track.visible ? 1 : 0;
    track.opacity = clamp(
      track.opacity + clamp(target - track.opacity, -this.fadeStep, this.fadeStep),
      0,
      1
    );
    return track.opacity;
  }

  /** Closes the frame, forgetting every marker it did not mention. */
  endFrame(): void {
    for (const [key, track] of this.tracks) {
      if (track.frame !== this.frame) this.tracks.delete(key);
    }
  }

  /**
   * Forgets everything. For when the next frame cannot be compared with this
   * one — the mask going stale, or a seek in the replay harness.
   */
  reset(): void {
    this.tracks.clear();
    this.lastSeconds = null;
  }

  /** How many markers are being tracked, for tests and the debug overlay. */
  size(): number {
    return this.tracks.size;
  }
}
