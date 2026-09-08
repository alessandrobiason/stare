import {
  cachedLandmarkPhoto,
  clearLandmarkPhotosForTesting,
  LANDMARK_PHOTO_TITLES,
  landmarkPhotoTitle,
  loadLandmarkPhoto
} from "../src/satellite/landmarkPhotos";
import { BriefingSubject } from "../src/satellite/briefing";

/** A tapped object, as the card knows it. */
function subject(overrides: Partial<BriefingSubject> = {}): BriefingSubject {
  return { name: "ISS", noradId: 25544, category: "LANDMARK", parked: false, ...overrides };
}

/**
 * A summary response of the shape Wikimedia sends, cut down to the two fields
 * this module reads.
 */
function summary(thumbnail: string, originalWidth = 4000): string {
  return JSON.stringify({
    title: "International Space Station",
    thumbnail: { source: thumbnail, width: 320, height: 213 },
    originalimage: { source: thumbnail, width: originalWidth, height: 2000 }
  });
}

const COMMONS_THUMB =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ISS-56.jpg/320px-ISS-56.jpg";

function respondWith(body: string, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => clearLandmarkPhotosForTesting());
afterEach(() => jest.restoreAllMocks());

describe("which objects get a photograph", () => {
  test("the landmarks do, one article each", () => {
    expect(landmarkPhotoTitle(subject())).toBe("International Space Station");
    expect(landmarkPhotoTitle(subject({ name: "Hubble", noradId: 20580 }))).toBe(
      "Hubble Space Telescope"
    );
  });

  test("so do the vehicles visiting them, one article for the type", () => {
    // Matched by name rather than catalogue number, because a crew ferry is
    // renumbered every few months — the same tier `briefing.ts` resolves.
    expect(landmarkPhotoTitle(subject({ name: "SOYUZ-MS 27", noradId: 63219 }))).toBe(
      "Soyuz (spacecraft)"
    );
    expect(landmarkPhotoTitle(subject({ name: "CREW DRAGON 11", noradId: 65123 }))).toBe(
      "SpaceX Dragon 2"
    );
  });

  test("the rest of the catalogue does not", () => {
    // A photograph of Starlink 4321 would be a photograph of a satellite that
    // looks like all eight thousand of the others.
    expect(
      landmarkPhotoTitle(subject({ name: "STARLINK-1234", noradId: 44713, category: "COMMS" }))
    ).toBeNull();
    expect(
      landmarkPhotoTitle(subject({ name: "GJZ 01", noradId: 57489, category: "EARTH" }))
    ).toBeNull();
  });

  test("no article is named twice, and every one is named", () => {
    expect(new Set(LANDMARK_PHOTO_TITLES).size).toBe(LANDMARK_PHOTO_TITLES.length);
    for (const title of LANDMARK_PHOTO_TITLES) expect(title.trim()).toBe(title);
  });
});

describe("resolving the picture", () => {
  test("asks the article by title, underscored the way Wikimedia titles are", async () => {
    const fetchMock = respondWith(summary(COMMONS_THUMB));

    await loadLandmarkPhoto("International Space Station");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/International_Space_Station"
    );
    // Wikimedia asks a client to say what it is, and a browser cannot set a
    // User-Agent, which is the header they provide instead.
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Api-User-Agent"]).toContain("Stare");
  });

  test("asks for the picture at the width the card draws it, not the full file", async () => {
    respondWith(summary(COMMONS_THUMB));

    const photo = await loadLandmarkPhoto("International Space Station");

    // The same file, with the width in the rendition rewritten: a 320-pixel
    // thumbnail is what the summary offers and is visibly soft at this size.
    expect(photo?.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ISS-56.jpg/800px-ISS-56.jpg"
    );
  });

  test("never asks for more than the file has: Wikimedia does not upscale", async () => {
    respondWith(summary(COMMONS_THUMB, 500));

    const photo = await loadLandmarkPhoto("International Space Station");

    // Asking for 800 pixels of a 500-pixel file is a 404, not a soft picture.
    expect(photo?.imageUrl).toContain("/500px-ISS-56.jpg");
  });

  test("credits the file's own page, which carries the author and the licence", async () => {
    respondWith(summary(COMMONS_THUMB));

    const photo = await loadLandmarkPhoto("International Space Station");

    expect(photo?.creditUrl).toBe("https://commons.wikimedia.org/wiki/File:ISS-56.jpg");
  });

  test("copes with the renditions that are not simply a width", async () => {
    // A scan is served through a renderer that prefixes its own name.
    respondWith(
      summary(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Plan.tif/lossy-page1-320px-Plan.tif.jpg"
      )
    );

    const photo = await loadLandmarkPhoto("Some article");

    expect(photo?.imageUrl).toContain("lossy-page1-800px-Plan.tif.jpg");
    expect(photo?.creditUrl).toBe("https://commons.wikimedia.org/wiki/File:Plan.tif");
  });
});

describe("what is not shown", () => {
  test("a file that is not on Commons, because that is the licence check", async () => {
    // A file uploaded to Wikipedia itself rather than to Commons is generally
    // there *because* it is not freely licensed — a logo or a press photograph
    // kept under fair use, which is not ours to put in an app.
    respondWith(
      summary("https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/Mission_patch.png/320px-Mission_patch.png")
    );

    expect(await loadLandmarkPhoto("Some article")).toBeNull();
  });

  test("an article with no lead image at all", async () => {
    respondWith(JSON.stringify({ title: "Some article" }));

    expect(await loadLandmarkPhoto("Some article")).toBeNull();
  });

  test("an article that is not there", async () => {
    respondWith(JSON.stringify({ title: "Not found" }), 404);

    expect(await loadLandmarkPhoto("Nothing here")).toBeNull();
  });

  test("nothing, when the phone has no network — and it never rejects", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(loadLandmarkPhoto("International Space Station")).resolves.toBeNull();
  });
});

describe("asking twice", () => {
  test("one request per article, however many times the card is opened", async () => {
    const fetchMock = respondWith(summary(COMMONS_THUMB));

    const first = await loadLandmarkPhoto("International Space Station");
    const second = await loadLandmarkPhoto("International Space Station");

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("two taps in the same instant are one request", async () => {
    const fetchMock = respondWith(summary(COMMONS_THUMB));

    await Promise.all([
      loadLandmarkPhoto("International Space Station"),
      loadLandmarkPhoto("International Space Station")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("an article with no picture is not asked about again either", async () => {
    const fetchMock = respondWith(JSON.stringify({ title: "Some article" }));

    await loadLandmarkPhoto("Some article");
    await loadLandmarkPhoto("Some article");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a failure is asked about again, because the phone was probably in a tunnel", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    expect(await loadLandmarkPhoto("International Space Station")).toBeNull();

    failing.mockResolvedValue(new Response(summary(COMMONS_THUMB), { status: 200 }));

    expect(await loadLandmarkPhoto("International Space Station")).not.toBeNull();
  });

  test("what is already known is readable without asking, so a reopened card draws at once", async () => {
    respondWith(summary(COMMONS_THUMB));

    expect(cachedLandmarkPhoto("International Space Station")).toBeUndefined();
    const photo = await loadLandmarkPhoto("International Space Station");

    expect(cachedLandmarkPhoto("International Space Station")).toEqual(photo);
  });
});
