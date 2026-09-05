import { CameraAttitude } from "../src/camera/attitude";
import { DEVICE_LENS, rayThroughFrame } from "../src/camera/projection";
import { SKY_MEMORY } from "../src/constants";
import { EnuPosition, ObserverLocation } from "../src/types";
import { AnchoredSkyMask, skyProbe } from "../src/vision/anchoredMask";
import { SkyMask } from "../src/vision/skyMask";
import { SkyMemory } from "../src/vision/skyMemory";

/**
 * Aimed well up, so the whole frame sits above the memory's elevation floor —
 * a level camera spends its lower half looking at the ground, which is not
 * sky anything remembers.
 */
const AIMED: CameraAttitude = { headingDeg: 0, pitchDeg: 40, rollDeg: 0 };

const OBSERVER: ObserverLocation = { latitudeDeg: 45.46, longitudeDeg: 9.19, heightM: 120 };

/** A mask of one value everywhere, at the grid the segmenter produces. */
const uniform = (value: number): SkyMask => ({
  columns: 52,
  rows: 69,
  confidence: new Array<number>(52 * 69).fill(value)
});

const aimed = (mask: SkyMask, attitude: CameraAttitude = AIMED): AnchoredSkyMask => ({
  mask,
  attitude
});

/** The direction the camera at `attitude` sees at the middle of its frame. */
const ahead = (attitude: CameraAttitude): EnuPosition =>
  rayThroughFrame({ left: 50, top: 50 }, attitude, DEVICE_LENS);

test("sky the phone has turned away from is still answered for", () => {
  const memory = new SkyMemory();
  memory.absorb(aimed(uniform(0.9)), DEVICE_LENS, OBSERVER, 100);

  // The phone turns far enough that the next pass shares no sky with this one,
  // and that pass lands: the mask covering the original view no longer exists.
  const turned: CameraAttitude = { ...AIMED, headingDeg: 90 };
  memory.absorb(aimed(uniform(0.1), turned), DEVICE_LENS, OBSERVER, 101);

  // Turning back is immediate rather than a wait for the segmenter to follow.
  expect(memory.probe(101)(ahead(AIMED))).toBeCloseTo(0.9, 2);
  expect(memory.probe(101)(ahead(turned))).toBeCloseTo(0.1, 2);
});

test("sky nothing has looked at has no answer, remembered or otherwise", () => {
  const memory = new SkyMemory();
  memory.absorb(aimed(uniform(1)), DEVICE_LENS, OBSERVER, 0);
  const probe = memory.probe(0);

  // Behind the phone, and above the frame it was holding.
  expect(probe(ahead({ ...AIMED, headingDeg: 180 }))).toBeNull();
  expect(probe(ahead({ ...AIMED, pitchDeg: 85 }))).toBeNull();
  // And below the floor, which is the horizon prior's business rather than this
  // one's — no marker is placed down there at all.
  expect(probe({ east: 0, north: 1, up: -0.5 })).toBeNull();
});

test("the memory says what the mask it came from said", () => {
  // Sky on the left of the frame, a building on the right.
  const columns = 52;
  const rows = 69;
  const split: SkyMask = {
    columns,
    rows,
    confidence: Array.from({ length: columns * rows }, (_value, index) =>
      index % columns < columns / 2 ? 0.95 : 0.05
    )
  };
  const memory = new SkyMemory();
  memory.absorb(aimed(split), DEVICE_LENS, OBSERVER, 0);

  const live = skyProbe(aimed(split), DEVICE_LENS);
  const remembered = memory.probe(0);
  // Away from the boundary, where a degree of grid either way cannot matter.
  for (const left of [10, 25, 75, 90]) {
    for (const top of [20, 50, 80]) {
      const direction = rayThroughFrame({ left, top }, AIMED, DEVICE_LENS);
      expect(remembered(direction)).toBeCloseTo(live(direction)!, 1);
    }
  }
});

test("a reading expires rather than standing in for a look nobody took", () => {
  const memory = new SkyMemory();
  memory.absorb(aimed(uniform(0.9)), DEVICE_LENS, OBSERVER, 0);
  const direction = ahead(AIMED);

  expect(memory.probe(SKY_MEMORY.maxAgeSeconds - 1)(direction)).toBeCloseTo(0.9, 2);
  expect(memory.probe(SKY_MEMORY.maxAgeSeconds + 1)(direction)).toBeNull();
});

test("walking away from where the mask was taken drops all of it", () => {
  const memory = new SkyMemory();
  memory.absorb(aimed(uniform(0.9)), DEVICE_LENS, OBSERVER, 0);

  // A few metres is the same street corner, and the same rooflines.
  const shifted = { ...OBSERVER, latitudeDeg: OBSERVER.latitudeDeg + 0.00005 };
  memory.absorb(aimed(uniform(0.9), { ...AIMED, headingDeg: 90 }), DEVICE_LENS, shifted, 1);
  expect(memory.probe(1)(ahead(AIMED))).toBeCloseTo(0.9, 2);

  // A hundred metres is not: the buildings are in different directions now, so
  // what was mapped from the old spot says nothing about this one.
  const away = { ...OBSERVER, latitudeDeg: OBSERVER.latitudeDeg + 0.001 };
  memory.absorb(aimed(uniform(0.9), { ...AIMED, headingDeg: 90 }), DEVICE_LENS, away, 2);
  expect(memory.probe(2)(ahead(AIMED))).toBeNull();
  // Except the view the move's own pass looked at, which was taken from here.
  expect(memory.probe(2)(ahead({ ...AIMED, headingDeg: 90 }))).toBeCloseTo(0.9, 2);
});

test("drift is measured from where the memory started, not from the last fix", () => {
  const step = 5 / 111320;
  const walking = new SkyMemory();
  const standing = new SkyMemory();

  // Twenty steps of five metres, panning as it goes: a hundred metres in all,
  // and not one of them a jump.
  for (let pass = 0; pass <= 20; pass += 1) {
    const view = aimed(uniform(0.9), { ...AIMED, headingDeg: pass * 40 });
    walking.absorb(view, DEVICE_LENS, { ...OBSERVER, latitudeDeg: OBSERVER.latitudeDeg + pass * step }, pass);
    standing.absorb(view, DEVICE_LENS, OBSERVER, pass);
  }

  // Standing still, the same passes map most of the sky and keep it. Walking,
  // what is left is the few passes since the drift last tripped the threshold:
  // an accumulating walk has to be caught, not absorbed a metre at a time.
  expect(standing.stats(20).coverage).toBeGreaterThan(0.6);
  expect(walking.stats(20).coverage).toBeLessThan(standing.stats(20).coverage / 2);
});

test("coverage grows as more of the sky is looked at", () => {
  const memory = new SkyMemory();
  expect(memory.stats(0).cells).toBe(0);

  memory.absorb(aimed(uniform(1)), DEVICE_LENS, OBSERVER, 0);
  const first = memory.stats(0);
  expect(first.cells).toBeGreaterThan(1000);

  memory.absorb(aimed(uniform(1), { ...AIMED, headingDeg: 60 }), DEVICE_LENS, OBSERVER, 1);
  const second = memory.stats(1);
  expect(second.cells).toBeGreaterThan(first.cells);
  expect(second.coverage).toBeGreaterThan(first.coverage);
  expect(second.coverage).toBeLessThan(0.5);

  memory.reset();
  expect(memory.stats(1).cells).toBe(0);
});

test("a direction on the edge of what was seen is left unanswered", () => {
  const memory = new SkyMemory();
  memory.absorb(aimed(uniform(0.9)), DEVICE_LENS, OBSERVER, 0);
  const probe = memory.probe(0);

  // Walking out of the mapped region: inside is answered, and past its edge the
  // answer stops rather than being extrapolated from a cell or two of neighbour.
  const answered: boolean[] = [];
  for (let heading = 0; heading <= 60; heading += 1) {
    answered.push(probe(ahead({ ...AIMED, headingDeg: heading })) !== null);
  }
  expect(answered[0]).toBe(true);
  expect(answered[answered.length - 1]).toBe(false);
  // One edge, not a fringe of answers coming and going.
  const flips = answered.filter((value, index) => index > 0 && value !== answered[index - 1]);
  expect(flips).toHaveLength(1);
});
