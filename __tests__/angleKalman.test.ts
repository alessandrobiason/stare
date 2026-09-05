import { AngleKalmanFilter, AngleRandomWalkFilter } from "../src/fusion/angleKalman";
import { wrapDegrees180 } from "../src/math/angles";

/** A repeatable stand-in for sensor noise. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
}

const RATE = 1 / 60;

test("the first measurement is adopted rather than averaged in from zero", () => {
  const filter = new AngleKalmanFilter();
  filter.correct(140, 0.2);
  expect(filter.angle).toBeCloseTo(140);
  expect(filter.rate).toBeCloseTo(0);
});

/** RMS frame-to-frame change in rate — the part of noise that reads as buzz. */
function shimmer(values: number[]): number {
  let sum = 0;
  for (let i = 2; i < values.length; i += 1) {
    const step = values[i] - 2 * values[i - 1] + values[i - 2];
    sum += step * step;
  }
  return Math.sqrt(sum / (values.length - 2));
}

test("a still angle is smoothed, most of all in the frequencies that buzz", () => {
  const filter = new AngleKalmanFilter();
  const random = noise(7);
  const input: number[] = [];
  const output: number[] = [];

  for (let step = 0; step < 600; step += 1) {
    const measurement = 30 + random() * 2;
    filter.predict(RATE, 10);
    filter.correct(measurement, 0.3);
    // Skip the first second, while the filter is still settling.
    if (step > 60) {
      input.push(measurement);
      output.push(filter.angle);
    }
  }

  const rms = (values: number[]) =>
    Math.sqrt(values.reduce((sum, v) => sum + (v - 30) ** 2, 0) / values.length);

  // The estimate stays centred on the true angle...
  expect(Math.abs(output.reduce((a, b) => a + b, 0) / output.length - 30)).toBeLessThan(0.05);
  // ...is quieter than the signal it is fed...
  expect(rms(output)).toBeLessThan(rms(input) * 0.7);
  // ...and above all stops jumping between frames, which is what is seen.
  expect(shimmer(output)).toBeLessThan(shimmer(input) / 4);
});

test("a steady turn is tracked without the lag a low-pass would leave", () => {
  const filter = new AngleKalmanFilter();
  const turnRate = 60;
  let angle = 0;

  for (let step = 0; step < 300; step += 1) {
    angle += turnRate * RATE;
    filter.predict(RATE, 60);
    filter.correct(angle, 0.3);
  }

  // A low-pass heavy enough to smooth as hard as the test above would sit
  // several degrees behind by now. The rate state removes that.
  expect(Math.abs(wrapDegrees180(filter.angle - angle))).toBeLessThan(0.2);
  expect(filter.rate).toBeCloseTo(turnRate, 0);
});

test("the estimate runs across north without unwinding", () => {
  const filter = new AngleKalmanFilter();
  filter.correct(179, 0.2);

  let angle = 179;
  for (let step = 0; step < 60; step += 1) {
    angle += 0.5;
    filter.predict(RATE, 200);
    filter.correct(angle, 0.2);
  }

  // 209 degrees wrapped is -151, and the estimate must have crossed rather
  // than swung the long way round.
  expect(filter.angle).toBeGreaterThan(-160);
  expect(filter.angle).toBeLessThan(-140);
  expect(filter.rate).toBeGreaterThan(0);
});

test("projecting forward carries the angle on at the estimated rate", () => {
  const filter = new AngleKalmanFilter();
  let angle = 0;
  for (let step = 0; step < 300; step += 1) {
    angle += 30 * RATE;
    filter.predict(RATE, 60);
    filter.correct(angle, 0.2);
  }

  const projected = filter.projectTo(0.1);
  expect(projected - filter.angle).toBeCloseTo(3, 0);
  // Projection must not disturb the estimate itself.
  expect(filter.projectTo(0)).toBeCloseTo(filter.angle);
});

test("a reset filter adopts the next measurement outright", () => {
  const filter = new AngleKalmanFilter();
  filter.correct(10, 0.2);
  expect(filter.isStarted).toBe(true);

  filter.reset();
  expect(filter.isStarted).toBe(false);

  filter.correct(200, 0.2);
  expect(filter.angle).toBeCloseTo(-160);
});

test("the random walk filter averages a noisy constant hard", () => {
  const filter = new AngleRandomWalkFilter();
  const random = noise(11);

  for (let step = 0; step < 600; step += 1) {
    filter.predict(RATE, 0.05);
    filter.correct(35 + random() * 6, 3);
  }

  expect(Math.abs(filter.angle - 35)).toBeLessThan(0.3);
});

test("the random walk filter still follows a slow drift", () => {
  const filter = new AngleRandomWalkFilter();
  filter.correct(0, 3);

  // Ten minutes of the reference creeping round by 20 degrees.
  for (let step = 0; step < 36000; step += 1) {
    filter.predict(RATE, 0.05);
    filter.correct((step / 36000) * 20, 3);
  }

  expect(filter.angle).toBeGreaterThan(18);
  expect(filter.angle).toBeLessThan(20.5);
});
