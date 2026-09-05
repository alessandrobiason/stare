import { MARKER_VISIBILITY, SKY_SEGMENTATION_INTERVAL_MS } from "../src/constants";
import { MarkerVisibilityFilter } from "../src/vision/markerVisibility";

const FRAME_SECONDS = 1 / 60;
/** Display frames one mask pass is held across, at the segmenter's cadence. */
const FRAMES_PER_PASS = Math.round(SKY_SEGMENTATION_INTERVAL_MS / 1000 / FRAME_SECONDS);

/** A clock that hands out display frames, as the marker loop reads them. */
function clock(startSeconds = 0) {
  let seconds = startSeconds;
  return {
    next: () => (seconds += FRAME_SECONDS),
    at: () => seconds
  };
}

/**
 * Runs `key` through a run of mask passes and returns its opacity at the end of
 * each. One value per pass, held across the display frames it survives for,
 * because that is the shape of the real thing: the segmenter answers once a
 * second and the loop redraws sixty times against the answer.
 */
function play(
  filter: MarkerVisibilityFilter,
  key: string,
  passes: (number | null)[],
  time = clock()
): number[] {
  return passes.map((confidence) => {
    let opacity = 0;
    for (let frame = 0; frame < FRAMES_PER_PASS; frame += 1) {
      filter.beginFrame(time.next());
      opacity = filter.sample(key, confidence);
      filter.endFrame();
    }
    return opacity;
  });
}

/** A marker settled into open sky, fully drawn, and the clock it got there on. */
function settled(key = "SAT") {
  const filter = new MarkerVisibilityFilter();
  const time = clock();
  const opacities = play(filter, key, [0.95, 0.95, 0.95], time);
  expect(opacities[opacities.length - 1]).toBe(1);
  return { filter, time };
}

test("fades a new marker in rather than popping it on", () => {
  const filter = new MarkerVisibilityFilter();

  filter.beginFrame(0);
  expect(filter.sample("SAT", 0.95)).toBe(0);
  filter.endFrame();

  filter.beginFrame(MARKER_VISIBILITY.fadeSeconds / 2);
  expect(filter.sample("SAT", 0.95)).toBeCloseTo(0.5);
  filter.endFrame();

  filter.beginFrame(MARKER_VISIBILITY.fadeSeconds);
  expect(filter.sample("SAT", 0.95)).toBe(1);
  filter.endFrame();
});

test("holds a drawn marker through a mask that flickers around the threshold", () => {
  // The reported fault: the phone barely moves, one cell keeps changing its
  // mind about a roof line, and every marker over it blinks once a second.
  const { filter, time } = settled();
  const flicker = [0.05, 0.9, 0.1, 0.95, 0.05, 0.9, 0.1, 0.95];

  for (const opacity of play(filter, "SAT", flicker, time)) {
    expect(opacity).toBe(1);
  }
});

test("holds through a mask flipping the whole way, pass after pass", () => {
  // The worst case of the same thing, and the one the band is sized against: a
  // cell alternating between certain sky and certain terrain settles the
  // smoothed value at 0.30, which never reaches `hideConfidence`.
  const { filter, time } = settled();
  const alternating = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

  for (const opacity of play(filter, "SAT", alternating, time)) {
    expect(opacity).toBe(1);
  }
});

test("hides a marker two passes agree about", () => {
  const { filter, time } = settled();
  const opacities = play(filter, "SAT", [0.05, 0.05, 0.05, 0.05], time);

  // One pass changes nothing; the second carries the smoothed confidence past
  // the band and the marker starts fading; it is gone well inside the third.
  expect(opacities[0]).toBe(1);
  expect(opacities[1]).toBeLessThan(1);
  expect(opacities[2]).toBe(0);
  expect(opacities[3]).toBe(0);
});

test("drops a marker the mask has no reading for without spending the band on it", () => {
  // The phone has turned onto sky no pass has covered yet.
  const missing = settled("MISSING");
  const gone = play(missing.filter, "MISSING", [null], missing.time);

  // A genuine "not sky" is an answer, and answers are arbitrated: one pass of
  // it moves nothing, because a mask flickering at an edge must not blink a
  // marker. No answer at all is not in that argument — nothing is drawn on it,
  // now, rather than after the better part of two seconds over a building
  // nobody has looked at.
  const blocked = settled("BLOCKED");
  const held = play(blocked.filter, "BLOCKED", [0.05], blocked.time);

  expect(gone[0]).toBe(0);
  expect(held[0]).toBe(1);
});

test("a marker out of the mask's reach comes back as it was, not from scratch", () => {
  const { filter, time } = settled();
  play(filter, "SAT", [null, null], time);

  // The pass that covers it again finds it where the last pass that could see
  // it left it — open sky, already decided — so it fades straight back in
  // rather than spending the band again to earn it.
  const returning = play(filter, "SAT", [0.95], time);
  expect(returning[0]).toBe(1);
});

test("no reading neither hides a marker for good nor spends the band", () => {
  const { filter, time } = settled();
  // A marker sitting in sky the mask cannot answer for is not evidence that it
  // is behind anything: a run of them must not decide it is.
  play(filter, "SAT", [null, null, null, null], time);

  const covered = play(filter, "SAT", [0.6], time);
  expect(covered[0]).toBe(1);
});

test("brings a hidden marker back when the sky reopens", () => {
  const { filter, time } = settled();
  const hidden = play(filter, "SAT", [0.05, 0.05, 0.05], time);
  expect(hidden[hidden.length - 1]).toBe(0);

  const returning = play(filter, "SAT", [0.95, 0.95, 0.95], time);
  expect(returning[0]).toBe(0);
  expect(returning[returning.length - 1]).toBe(1);
});

test("keeps each marker's answer to itself", () => {
  const filter = new MarkerVisibilityFilter();
  const time = clock();
  const clear = play(filter, "CLEAR", [0.95, 0.95], time);

  // The same frames, a marker projected onto a wall rather than the sky.
  const behind = play(filter, "BEHIND", [0.02, 0.02], clock());
  expect(clear[clear.length - 1]).toBe(1);
  expect(behind[behind.length - 1]).toBe(0);
});

test("holds its answer while the smoothed confidence sits inside the band", () => {
  // A cell the segmenter is genuinely unsure about, steady at just over the
  // threshold. It leaves a hidden marker hidden and a drawn one drawn — the
  // point of a band, where a plain threshold would draw both.
  const marginal = [0.55, 0.55, 0.55, 0.55, 0.55, 0.55];

  const rising = play(new MarkerVisibilityFilter(), "SAT", [0.02, 0.02, ...marginal]);
  expect(rising[rising.length - 1]).toBe(0);

  const falling = play(new MarkerVisibilityFilter(), "SAT", [0.98, 0.98, ...marginal]);
  expect(falling[falling.length - 1]).toBe(1);
});

test("forgets markers that leave the frame", () => {
  const { filter, time } = settled("SAT");
  expect(filter.size()).toBe(1);

  // A frame without it: below the elevation mask, off the frame, or its
  // category switched off.
  filter.beginFrame(time.next());
  filter.endFrame();
  expect(filter.size()).toBe(0);

  // And it comes back as a stranger, fading in from nothing.
  filter.beginFrame(time.next());
  expect(filter.sample("SAT", 0.95)).toBe(0);
  filter.endFrame();
});

test("a reset drops every marker", () => {
  const { filter, time } = settled();
  filter.reset();
  expect(filter.size()).toBe(0);

  // The clock restarts with it, so the first frame after a stale mask cannot
  // charge a fade for however long the gap was.
  filter.beginFrame(time.at() + 60);
  expect(filter.sample("SAT", 0.95)).toBe(0);
  filter.endFrame();
});

test("integrates a stalled frame as one step, not as the whole gap", () => {
  const { filter, time } = settled();

  // A minute in the background, then a mask saying the sky is closed. Taken at
  // face value that single frame would carry the smoothed confidence the whole
  // way and cut the marker; capped, it is one step of a filter that still wants
  // a second reading before it believes this one.
  filter.beginFrame(time.at() + 60);
  expect(filter.sample("SAT", 0)).toBe(1);
  filter.endFrame();
});
