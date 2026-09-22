import { TLE_USABLE_INTERVAL_MS } from "../src/constants";
import { staleDaysOf } from "../src/hooks/useLiveCatalog";

const DAY_MS = 24 * 60 * 60 * 1000;
const downloaded = 1_000_000_000;

test("elements inside a day are current, and no notice is drawn for them", () => {
  expect(staleDaysOf(downloaded, downloaded)).toBeNull();
  expect(staleDaysOf(downloaded, downloaded + TLE_USABLE_INTERVAL_MS - 1)).toBeNull();
});

test("past a day they are stale, counted in whole days", () => {
  expect(staleDaysOf(downloaded, downloaded + TLE_USABLE_INTERVAL_MS)).toBe(1);
  expect(staleDaysOf(downloaded, downloaded + 30 * DAY_MS + 5 * 60 * 60 * 1000)).toBe(30);
});

test("elements stamped in the future are not called stale", () => {
  // The clock moved; nothing about their age can be told.
  expect(staleDaysOf(downloaded, downloaded - 5 * DAY_MS)).toBeNull();
});
