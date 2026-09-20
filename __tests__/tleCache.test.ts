import {
  TLE_REFRESH_INTERVAL_MS,
  TLE_RETRY_INTERVAL_MS,
  TLE_USABLE_INTERVAL_MS
} from "../src/constants";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import { clearTleCache, loadActiveCatalog } from "../src/data/tleProvider";
import { PersistentStore, setPersistentStoreForTesting } from "../src/data/tleStore";

/** Stands in for the device's file system, and survives a simulated restart. */
function fakeDevice() {
  let contents: string | null = null;
  let writes = 0;
  const store: PersistentStore = {
    read: () => contents,
    write: (next) => {
      contents = next;
      writes += 1;
    },
    remove: () => {
      contents = null;
    }
  };
  return {
    store,
    get writes() {
      return writes;
    },
    /**
     * Everything the app holds in memory is gone, but the device's storage is
     * not. This is the case the cache exists for.
     */
    restart: () => clearMemoryOnly()
  };
}

/**
 * Drops the in-memory copy while leaving the persisted one alone, which is what
 * closing and reopening the app does.
 */
function clearMemoryOnly(): void {
  jest.resetModules();
}

const body = `SAT ONE\n${SAMPLE_TLE.line1}\n${SAMPLE_TLE.line2}\n`;
const otherBody = `SAT TWO\n${SAMPLE_TLE.line1}\n${SAMPLE_TLE.line2}\n`;

let device: ReturnType<typeof fakeDevice>;

beforeEach(() => {
  device = fakeDevice();
  setPersistentStoreForTesting(device.store);
  clearTleCache();
  jest.restoreAllMocks();
});

afterEach(() => {
  setPersistentStoreForTesting(undefined);
});

/**
 * Lets whatever the background refresh started settle.
 *
 * It is deliberately nobody's promise — see `refreshInBackground` — so there
 * is nothing to await, and a test that wants to see its effect has to give the
 * microtask queue a turn. Two, because the fetch resolves into a sliced parse.
 */
async function flush(): Promise<void> {
  // Real turns of the event loop rather than microtasks: the download resolves
  // into a sliced parse, which hands the thread back between slices.
  for (let turn = 0; turn < 8; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function respondWith(text: string) {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(text, { status: 200 }));
}

test("downloads the catalog when nothing is cached", async () => {
  const fetchMock = respondWith(body);
  const { tles, source } = await loadActiveCatalog();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(source).toBe("network");
  expect(tles).toHaveLength(1);
  expect(tles[0].name).toBe("SAT ONE");
});

test("a second call inside the refresh window makes no request at all", async () => {
  const fetchMock = respondWith(body);
  await loadActiveCatalog();
  await loadActiveCatalog();
  await loadActiveCatalog();

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("concurrent callers share one download", async () => {
  const fetchMock = respondWith(body);
  const [first, second] = await Promise.all([loadActiveCatalog(), loadActiveCatalog()]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
});

test("the download time is written to storage, not just held in memory", () => {
  const fetchMock = respondWith(body);
  return loadActiveCatalog().then(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(device.store.read() ?? "{}");
    expect(typeof stored.downloadedAtMs).toBe("number");
    expect(stored.catalog).toContain("SAT ONE");
  });
});

test("past the refresh window it opens on the cache and refreshes behind it", async () => {
  // The launch everybody actually notices. Two hours is CelesTrak's rule about
  // traffic rather than a statement about where a satellite is, and blocking
  // the app on a couple of megabytes for elements that would move a marker by
  // a fraction of a pixel is the wrong trade. See `TLE_USABLE_INTERVAL_MS`.
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  fetchMock.mockResolvedValue(new Response(otherBody, { status: 200 }));

  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_REFRESH_INTERVAL_MS + 1);
  const opened = await loadActiveCatalog();

  // What the app opens on is what was already here — no wait at all.
  expect(opened.source).toBe("cache");
  expect(opened.tles[0].name).toBe("SAT ONE");
  // And the newer elements are fetched anyway, for the next launch.
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("and the elements it fetched behind it are what the next launch opens on", async () => {
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  fetchMock.mockResolvedValue(new Response(otherBody, { status: 200 }));

  const stale = 1_000_000 + TLE_REFRESH_INTERVAL_MS + 1;
  jest.spyOn(Date, "now").mockReturnValue(stale);
  await loadActiveCatalog();
  await flush();

  // Inside the refresh window of the *background* download, so this asks
  // nothing of the network and still gets the new elements.
  const next = await loadActiveCatalog();
  expect(next.tles[0].name).toBe("SAT TWO");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("but elements old enough to have drifted are waited for", async () => {
  // Past a day, SGP4's own accuracy rather than the download is the thing in
  // question, and waiting becomes the honest choice.
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  fetchMock.mockResolvedValue(new Response(otherBody, { status: 200 }));

  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_USABLE_INTERVAL_MS + 1);
  const refreshed = await loadActiveCatalog();

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(refreshed.source).toBe("network");
  expect(refreshed.tles[0].name).toBe("SAT TWO");
});

test("a background refresh that fails leaves the app on the cache it opened with", async () => {
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  fetchMock.mockRejectedValue(new Error("offline"));
  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_REFRESH_INTERVAL_MS + 1);
  const opened = await loadActiveCatalog();
  await flush();

  // Nobody was waiting on it, so nothing is a failure: the app is running on
  // elements that were already good enough to open it.
  expect(opened.source).toBe("cache");
  expect(opened.tles[0].name).toBe("SAT ONE");
});

test("serves the cached catalog when a refresh fails", async () => {
  respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  const first = await loadActiveCatalog();

  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_REFRESH_INTERVAL_MS + 1);
  const second = await loadActiveCatalog();

  expect(second.source).toBe("cache");
  expect(second.tles).toEqual(first.tles);
});

test("a retry the user asked for gets past the failure throttle", async () => {
  respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  failing.mockClear();
  const stale = 1_000_000 + TLE_REFRESH_INTERVAL_MS + 1;
  jest.spyOn(Date, "now").mockReturnValue(stale);
  await loadActiveCatalog();
  await loadActiveCatalog();
  expect(failing).toHaveBeenCalledTimes(1);

  // The throttle would block this; the button on the boot screen must not be
  // dead for fifteen minutes.
  await loadActiveCatalog({ force: true });
  expect(failing).toHaveBeenCalledTimes(2);
});

test("a forced retry still serves a cache inside the refresh window", async () => {
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  await loadActiveCatalog({ force: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a failed refresh is not retried on every call", async () => {
  respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  // `spyOn` hands back the spy that is already installed, carrying the calls
  // from the successful download with it.
  const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  failing.mockClear();
  const stale = 1_000_000 + TLE_REFRESH_INTERVAL_MS + 1;
  jest.spyOn(Date, "now").mockReturnValue(stale);
  await loadActiveCatalog();
  await loadActiveCatalog();

  // The first stale call tries; the second is inside the retry window.
  expect(failing).toHaveBeenCalledTimes(1);

  jest.spyOn(Date, "now").mockReturnValue(stale + TLE_RETRY_INTERVAL_MS + 1);
  await loadActiveCatalog();
  expect(failing).toHaveBeenCalledTimes(2);
});

test("reports the bundled fallback when there is nothing cached at all", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
  // Boot treats this as a failure worth showing rather than a working app.
  await expect(loadActiveCatalog()).resolves.toEqual({ tles: [SAMPLE_TLE], source: "bundled" });
});

test("a rejected download does not overwrite a good cache", async () => {
  respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  const writesAfterSuccess = device.writes;

  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_REFRESH_INTERVAL_MS + 1);
  await loadActiveCatalog();

  const stored = JSON.parse(device.store.read() ?? "{}");
  expect(stored.catalog).toContain("SAT ONE");
  expect(stored.downloadedAtMs).toBe(1_000_000);
  // The attempt was recorded, so the retry window starts running.
  expect(stored.attemptedAtMs).toBe(1_000_000 + TLE_REFRESH_INTERVAL_MS + 1);
  expect(device.writes).toBeGreaterThan(writesAfterSuccess);
});

test("unreadable storage is a cache miss, not a crash", async () => {
  setPersistentStoreForTesting({
    read: () => {
      throw new Error("storage unavailable");
    },
    write: () => {
      throw new Error("storage unavailable");
    },
    remove: () => undefined
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);

  const fetchMock = respondWith(body);
  await expect(loadActiveCatalog()).resolves.toMatchObject({ source: "network" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a half-written cache entry is ignored", async () => {
  device.store.write("{not json");
  jest.spyOn(console, "warn").mockImplementation(() => undefined);

  const fetchMock = respondWith(body);
  await expect(loadActiveCatalog()).resolves.toMatchObject({ source: "network" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
