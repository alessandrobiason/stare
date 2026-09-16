import { frameAgreement } from "../src/vision/frameAgreement";

const SIZE = { width: 48, height: 64 };

/** A scene with a layout: a bright block top left, a gradient, a dark stripe low right. */
function scene(transform: (x: number, y: number) => [number, number] = (x, y) => [x, y]) {
  const pixels = new Uint8Array(SIZE.width * SIZE.height * 4);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      const [px, py] = transform(x, y);
      let value = 60 + ((px + py) * 2) % 30;
      if (px < 16 && py < 20) value = 250;
      if (px > 30 && py > 48) value = 5;
      const at = (y * SIZE.width + x) * 4;
      pixels[at] = value;
      pixels[at + 1] = value;
      pixels[at + 2] = value;
      pixels[at + 3] = 255;
    }
  }
  return { pixels, channels: 4 as const };
}

const W = SIZE.width - 1;
const H = SIZE.height - 1;

test("the same picture the same way up matches", () => {
  const result = frameAgreement(scene(), scene(), SIZE);
  expect(result.verdict).toBe("matches");
  expect(result.upright).toBeGreaterThan(0.95);
});

test("a picture turned half round is caught as turned", () => {
  expect(frameAgreement(scene((x, y) => [W - x, H - y]), scene(), SIZE).verdict).toBe("turned");
});

test("mirrored and flipped pictures are told apart from turned ones", () => {
  expect(frameAgreement(scene((x, y) => [W - x, y]), scene(), SIZE).verdict).toBe("mirrored");
  expect(frameAgreement(scene((x, y) => [x, H - y]), scene(), SIZE).verdict).toBe("flipped");
});

test("a picture with nothing in it is inconclusive rather than a guess", () => {
  const flat = { pixels: new Uint8Array(SIZE.width * SIZE.height * 4).fill(128), channels: 4 as const };
  const result = frameAgreement(flat, flat, SIZE);
  expect(result.verdict).toBe("inconclusive");
  expect(result.upright).toBe(0);
});

test("unrelated pictures are inconclusive", () => {
  const noise = (seed: number) => {
    const pixels = new Uint8Array(SIZE.width * SIZE.height * 4);
    let state = seed;
    for (let i = 0; i < pixels.length; i += 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      pixels[i] = state % 256;
    }
    return { pixels, channels: 4 as const };
  };
  expect(frameAgreement(noise(1), noise(2), SIZE).verdict).toBe("inconclusive");
});
