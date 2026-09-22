import {
  TLE_CONNECT_TIMEOUT_MS,
  TLE_REFRESH_INTERVAL_MS,
  TLE_RETRY_INTERVAL_MS,
  TLE_USABLE_INTERVAL_MS
} from "../src/constants";
import { forgetBundledCatalogForTesting } from "../src/data/bundledCatalog";
import { SAMPLE_TLE } from "../src/data/sampleTle";
import {
  clearTleCache,
  loadActiveCatalog,
  refreshStaleCatalog
} from "../src/data/tleProvider";
import { PersistentStore, setPersistentStoreForTesting } from "../src/data/tleStore";

/**
 * What the app ships with, in place of the real two-and-a-half megabytes.
 *
 * Dated before every clock these tests set, so that it only wins where there is
 * no cache at all — unless a test moves it. Through getters, so the module the
 * factory builds after a simulated restart (`jest.resetModules`) still reads
 * whatever the test in hand set.
 */
let mockBundled: { downloadedAtMs: number; catalog: string } | null = null;
jest.mock("../src/data/bundledCatalog.json", () => ({
  get downloadedAtMs() {
    if (!mockBundled) throw new Error("no bundled catalogue");
    return mockBundled.downloadedAtMs;
  },
  get catalog() {
    if (!mockBundled) throw new Error("no bundled catalogue");
    return mockBundled.catalog;
  }
}));

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
const bundledBody = `SHIPPED SAT\n${SAMPLE_TLE.line1}\n${SAMPLE_TLE.line2}\n`;

let device: ReturnType<typeof fakeDevice>;

beforeEach(() => {
  mockBundled = { downloadedAtMs: 500_000, catalog: bundledBody };
  forgetBundledCatalogForTesting();
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

test("opens on the catalogue the app shipped with when there is nothing cached at all", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);

  const opened = await loadActiveCatalog();
  expect(opened.source).toBe("bundled");
  expect(opened.tles.map((tle) => tle.name)).toEqual(["SHIPPED SAT"]);
  // Dated by when it was downloaded for the build, not by when it was opened:
  // that is what the view measures its age from.
  expect(opened.downloadedAtMs).toBe(500_000);
  // And nothing of it is written to the device, which already has the file.
  expect(device.store.read()).toBeNull();
});

test("the shipped catalogue wins over an older cache", async () => {
  respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  // An app update that carries elements newer than the ones this device last
  // managed to download.
  mockBundled = { downloadedAtMs: 2_000_000, catalog: bundledBody };
  forgetBundledCatalogForTesting();
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_USABLE_INTERVAL_MS * 3);
  const opened = await loadActiveCatalog();

  expect(opened.source).toBe("bundled");
  expect(opened.downloadedAtMs).toBe(2_000_000);
});

test("a failure is retried on the throttle even with nothing cached", async () => {
  // The shipped catalogue is held in memory, and the attempt with it, so a view
  // asking again and again does not become a request each time.
  const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  await loadActiveCatalog();
  await expect(refreshStaleCatalog()).resolves.toBeNull();
  expect(failing).toHaveBeenCalledTimes(1);

  jest.spyOn(Date, "now").mockReturnValue(1_000_000 + TLE_RETRY_INTERVAL_MS + 1);
  await expect(refreshStaleCatalog()).resolves.toBeNull();
  expect(failing).toHaveBeenCalledTimes(2);
});

test("a stale view gets fresh elements once CelesTrak answers again", async () => {
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();

  const later = 1_000_000 + TLE_RETRY_INTERVAL_MS + 1;
  jest.spyOn(Date, "now").mockReturnValue(later);
  respondWith(body);
  const fresh = await refreshStaleCatalog();
  expect(fresh).toMatchObject({ source: "network", downloadedAtMs: later });
  expect(fresh?.tles[0].name).toBe("SAT ONE");
  // Stored like any download, for the next launch.
  expect(device.store.read()).toContain("SAT ONE");
});

test("a stale view is handed elements a background refresh already fetched", async () => {
  const fetchMock = respondWith(body);
  jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await loadActiveCatalog();
  fetchMock.mockClear();

  await expect(refreshStaleCatalog()).resolves.toMatchObject({
    source: "cache",
    downloadedAtMs: 1_000_000
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("with nothing cached and nothing shipped there is no catalogue", async () => {
  mockBundled = null;
  forgetBundledCatalogForTesting();
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);

  await expect(loadActiveCatalog()).resolves.toEqual({
    tles: [],
    source: "none",
    downloadedAtMs: 0
  });
});

test("a server that never answers is given up on", async () => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  try {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );

    const opened = loadActiveCatalog();
    await jest.advanceTimersByTimeAsync(TLE_CONNECT_TIMEOUT_MS);
    await expect(opened).resolves.toMatchObject({ source: "bundled" });
  } finally {
    jest.useRealTimers();
  }
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
