import {
  cachedLandmarkPhoto,
  clearLandmarkPhotosForTesting,
  LANDMARK_PHOTO_FILES,
  landmarkPhotoFile,
  loadLandmarkPhoto
} from "../src/satellite/landmarkPhotos";
import { BriefingSubject } from "../src/satellite/briefing";

/** A tapped object, as the card knows it. */
function subject(overrides: Partial<BriefingSubject> = {}): BriefingSubject {
  return { name: "ISS", noradId: 25544, category: "LANDMARK", parked: false, ...overrides };
}

const THUMB =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/ISS-56.jpg/960px-ISS-56.jpg?utm_source=commons.wikimedia.org";
const PAGE = "https://commons.wikimedia.org/wiki/File:ISS-56.jpg";

/** What Commons answers with, cut down to the fields this module reads. */
function imageInfo(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    query: {
      pages: [
        {
          title: "File:ISS-56.jpg",
          imageinfo: [
            {
              thumburl: THUMB,
              thumbwidth: 800,
              url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/ISS-56.jpg",
              descriptionurl: PAGE,
              mime: "image/jpeg",
              extmetadata: {
                Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">NASA/Roscosmos</a>' },
                LicenseShortName: { value: "Public domain" }
              },
              ...overrides
            }
          ]
        }
      ]
    }
  });
}

function respondWith(body: string, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(body, { status, headers: { "Content-Type": "application/json" } })
    );
}

beforeEach(() => clearLandmarkPhotosForTesting());
afterEach(() => jest.restoreAllMocks());

describe("which objects get a photograph", () => {
  test("the landmarks do, one file each", () => {
    expect(landmarkPhotoFile(subject())).toContain("International Space Station");
    expect(landmarkPhotoFile(subject({ name: "Hubble", noradId: 20580 }))).toContain("Hubble");
  });

  test("so do the vehicles visiting them, one picture for the type", () => {
    // Matched by name rather than catalogue number, because a crew ferry is
    // renumbered every few months — the same tier `briefing.ts` resolves.
    expect(landmarkPhotoFile(subject({ name: "SOYUZ-MS 27", noradId: 63219 }))).toBe(
      "Soyuz MS.jpg"
    );
    expect(landmarkPhotoFile(subject({ name: "CREW DRAGON 11", noradId: 65123 }))).toBe(
      "Iss071e052057.jpg"
    );
  });

  test("the rest of the catalogue does not", () => {
    // A photograph of Starlink 4321 would be a photograph of a satellite that
    // looks like all eight thousand of the others.
    expect(
      landmarkPhotoFile(subject({ name: "STARLINK-1234", noradId: 44713, category: "COMMS" }))
    ).toBeNull();
    expect(
      landmarkPhotoFile(subject({ name: "GJZ 01", noradId: 57489, category: "EARTH" }))
    ).toBeNull();
  });

  test("every file is named once, and named as Commons spells it", () => {
    expect(new Set(LANDMARK_PHOTO_FILES).size).toBe(LANDMARK_PHOTO_FILES.length);
    for (const file of LANDMARK_PHOTO_FILES) {
      // A file name, not a page title: no namespace, and an extension the phone
      // can decode. An SVG here would be a logo rather than a photograph.
      expect(file).not.toMatch(/^File:/);
      expect(file).toMatch(/\.(jpg|jpeg|png)$/i);
      expect(file.trim()).toBe(file);
    }
  });
});

describe("asking Commons for the picture", () => {
  test("asks for the file by name, at the width the card draws it", async () => {
    const fetchMock = respondWith(imageInfo());

    await loadLandmarkPhoto("Soyuz MS.jpg");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("commons.wikimedia.org/w/api.php");
    expect(url).toContain(`titles=${encodeURIComponent("File:Soyuz MS.jpg")}`);
    // A request rather than an exact size: Wikimedia serves thumbnails only at
    // sizes it has decided on, and picking one out of the air is a 400.
    expect(url).toContain("iiurlwidth=800");
    // The browser half of the app cannot read the API without it.
    expect(url).toContain("origin=*");
    // Wikimedia asks a client to say what it is, and a browser cannot set a
    // User-Agent, which is the header they provide instead.
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Api-User-Agent"]).toContain("Stare");
  });

  test("takes the URL the API gives rather than building one", async () => {
    respondWith(imageInfo());

    const photo = await loadLandmarkPhoto("ISS-56.jpg");

    expect(photo?.imageUrl).toBe(THUMB);
    expect(photo?.pageUrl).toBe(PAGE);
  });

  test("falls back to the file itself when it is already narrower than asked", async () => {
    // Wikimedia does not upscale: for a small file the API answers with the
    // original instead of a rendition.
    respondWith(imageInfo({ thumburl: undefined }));

    expect((await loadLandmarkPhoto("ISS-56.jpg"))?.imageUrl).toContain(
      "upload.wikimedia.org/wikipedia/commons/8/8f/ISS-56.jpg"
    );
  });

  test("credits the author and the licence, which is what the licences ask for", async () => {
    respondWith(imageInfo());

    // The author arrives as the HTML the file page renders — usually a link.
    expect((await loadLandmarkPhoto("ISS-56.jpg"))?.credit).toBe("NASA/Roscosmos · Public domain");
  });

  test("still says something when the metadata says nothing", async () => {
    respondWith(imageInfo({ extmetadata: {} }));

    // The caption is also the control that opens the file's page, and a control
    // with nothing written on it is not a control.
    expect((await loadLandmarkPhoto("ISS-56.jpg"))?.credit).toBe("Wikimedia Commons");
  });
});

describe("what is not shown", () => {
  test("a file that is not on Commons, because that is the licence check", async () => {
    // Existing on Commons is what says a picture is freely licensed. A file that
    // has been renamed or deleted out from under this table shows nothing.
    respondWith(JSON.stringify({ query: { pages: [{ title: "File:Gone.jpg", missing: true }] } }));

    expect(await loadLandmarkPhoto("Gone.jpg")).toBeNull();
  });

  test("anything that is not a photograph the phone can decode", async () => {
    // A logo is an SVG, and a mission's "picture" is sometimes a video.
    respondWith(imageInfo({ mime: "image/svg+xml" }));
    expect(await loadLandmarkPhoto("Logo.svg")).toBeNull();

    clearLandmarkPhotosForTesting();
    respondWith(imageInfo({ mime: "video/webm" }));
    expect(await loadLandmarkPhoto("Flyby.webm")).toBeNull();
  });

  test("a picture served from anywhere but Wikimedia", async () => {
    respondWith(imageInfo({ thumburl: "https://example.com/hotlink.jpg" }));

    expect(await loadLandmarkPhoto("ISS-56.jpg")).toBeNull();
  });

  test("nothing, when the phone has no network — and it never rejects", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(loadLandmarkPhoto("ISS-56.jpg")).resolves.toBeNull();
  });
});

describe("asking twice", () => {
  test("one request per file, however many times the card is opened", async () => {
    const fetchMock = respondWith(imageInfo());

    const first = await loadLandmarkPhoto("ISS-56.jpg");
    const second = await loadLandmarkPhoto("ISS-56.jpg");

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("two taps in the same instant are one request", async () => {
    const fetchMock = respondWith(imageInfo());

    await Promise.all([loadLandmarkPhoto("ISS-56.jpg"), loadLandmarkPhoto("ISS-56.jpg")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a file this app will not show is not asked about again either", async () => {
    const fetchMock = respondWith(imageInfo({ mime: "image/svg+xml" }));

    await loadLandmarkPhoto("Logo.svg");
    await loadLandmarkPhoto("Logo.svg");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a failure is asked about again, because the phone was probably in a tunnel", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    expect(await loadLandmarkPhoto("ISS-56.jpg")).toBeNull();

    failing.mockResolvedValue(new Response(imageInfo(), { status: 200 }));

    expect(await loadLandmarkPhoto("ISS-56.jpg")).not.toBeNull();
  });

  test("what is already known is readable without asking, so a reopened card draws at once", async () => {
    respondWith(imageInfo());

    expect(cachedLandmarkPhoto("ISS-56.jpg")).toBeUndefined();
    const photo = await loadLandmarkPhoto("ISS-56.jpg");

    expect(cachedLandmarkPhoto("ISS-56.jpg")).toEqual(photo);
  });
});

/**
 * The table against the real thing.
 *
 * Off by default: the suite must run on a laptop with no network and must not
 * put nineteen requests on Wikimedia every time somebody saves a file. It is
 * how the table was checked when it was written, and how to check it after
 * editing it — `STARE_LIVE_PHOTOS=1 npx jest landmarkPhotos`.
 */
const live = process.env.STARE_LIVE_PHOTOS === "1" ? describe : describe.skip;

live("against Commons itself", () => {
  jest.setTimeout(180000);

  test("every file named here is there, is a photograph, and is free to show", async () => {
    clearLandmarkPhotosForTesting();
    const missing: string[] = [];

    for (const file of LANDMARK_PHOTO_FILES) {
      const photo = await loadLandmarkPhoto(file);
      if (!photo) {
        missing.push(file);
        continue;
      }
      const picture = await fetch(photo.imageUrl, { method: "HEAD" });
      if (!picture.ok) missing.push(`${file} (${picture.status})`);
    }

    expect(missing).toEqual([]);
  });
});
