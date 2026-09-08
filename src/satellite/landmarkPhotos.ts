import { BriefingId, briefingEntryFor, BriefingSubject } from "./briefing";

/**
 * A photograph of the object under the finger, for the objects worth one.
 *
 * The card already answers what a tapped object is in words (`briefing.ts`).
 * What the words cannot do is settle what it *looks like*: someone who has just
 * pointed a phone at a moving light and read "a laboratory the size of a
 * football pitch" is owed the picture of the thing, and for the two crewed
 * stations, the great observatories and the vehicles visiting them, that picture
 * exists and is free to show.
 *
 * **The photographs are not bundled.** Twenty of them at a size worth looking at
 * is several megabytes of app download, on behalf of a panel most launches never
 * open, and they would then be frozen at the version shipped. So each is fetched
 * the first time someone taps that object and left to the platform's own HTTP
 * cache after that — one small JSON lookup and one image, on a screen that has
 * already downloaded a 2 MB catalogue.
 *
 * **Where they come from.** Wikimedia: the summary endpoint of the English
 * Wikipedia gives the article's lead image, and that is the picture a few
 * thousand people have already argued into being the best one of the ISS. The
 * lookup is keyed by article title rather than by a URL to a file, because a
 * file gets superseded — a better photograph of Tiangong will be taken — and a
 * title outlives that, follows redirects, and cannot rot into a 404 the way a
 * hand-copied CDN path does.
 *
 * **Only files hosted on Commons are shown** (`commonsThumb`). That is the
 * licensing check, and it is a strict one: an image on Commons is there because
 * it is freely licensed, whereas a file uploaded to Wikipedia itself is
 * generally the opposite — a non-free logo or press photograph kept under fair
 * use, which is not a thing to redistribute inside an app. The credit link goes
 * to the file's own page on Commons, which carries the author and the licence.
 *
 * Nothing here is load-bearing. Every failure — no network, no article, no
 * picture, a picture the platform will not decode — ends with no photograph and
 * a card that reads exactly as it did before, which is why none of it is in the
 * boot sequence.
 */
export type LandmarkPhoto = {
  /** The picture, scaled to about the width the card draws it at. */
  imageUrl: string;
  /** Its page on Commons: who took it, and under what licence. */
  creditUrl: string;
};

/**
 * Which objects get a photograph, and the article whose lead image it is.
 *
 * Keyed by briefing id rather than by catalogue number, so this table hangs off
 * the tiers `briefing.ts` already resolves: `iss` is one object and one
 * photograph, while `dragon` is every Dragon ever berthed and one photograph of
 * the type. It is deliberately not exhaustive — `Partial` — because a picture is
 * worth showing for the objects someone goes outside to see, and a photograph of
 * Starlink 4321 would be a photograph of a satellite that looks like all the
 * others.
 *
 * The ids are checked against `BriefingId`, so an entry for a fleet that gets
 * renamed or dropped fails to compile rather than quietly never matching.
 */
const PHOTO_TITLES = {
  // The two crewed stations and the great observatories: the landmark tier,
  // one entry per object.
  iss: "International Space Station",
  tiangong: "Tiangong space station",
  hubble: "Hubble Space Telescope",
  chandra: "Chandra X-ray Observatory",
  xmmNewton: "XMM-Newton",
  swift: "Neil Gehrels Swift Observatory",
  nustar: "NuSTAR",
  hxmt: "Hard X-ray Modulation Telescope",
  cheops: "CHEOPS",
  ixpe: "Imaging X-ray Polarimetry Explorer",
  einsteinProbe: "Einstein Probe",
  svom: "Space Variable Objects Monitor",

  // The vehicles visiting them, which share a station's patch of sky and are
  // most of what a tap over that patch turns out to have caught.
  soyuz: "Soyuz (spacecraft)",
  progress: "Progress (spacecraft)",
  dragon: "SpaceX Dragon 2",
  cygnus: "Cygnus (spacecraft)",
  starliner: "Boeing Starliner",
  shenzhou: "Shenzhou (spacecraft)",
  tianzhou: "Tianzhou (spacecraft)"
} as const satisfies Partial<Record<BriefingId, string>>;

/** The endpoint, and how Wikimedia asks a client to identify itself. */
const SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const API_USER_AGENT = "Stare/0.1 (https://github.com/alessandrobiason/stare)";

/**
 * How wide a picture to ask for, in pixels.
 *
 * The card is the width of the screen less its margins — some 360 points — so at
 * a phone's 3x this wants 1,080 to be pixel-exact, and 1,080 is a third of a
 * megabyte for a strip 132 points tall. 800 is the compromise: sharp enough that
 * the resampling is invisible at this size, and a fraction of the download.
 */
const PHOTO_WIDTH_PX = 800;

/** Where every Wikimedia thumbnail of a freely licensed file lives. */
const COMMONS_THUMB_PREFIX = "https://upload.wikimedia.org/wikipedia/commons/thumb/";

/** The shape of the summary response, as far as this module reads it. */
type ArticleSummary = {
  thumbnail?: { source?: string };
  originalimage?: { width?: number };
};

/**
 * A Commons thumbnail URL, taken apart.
 *
 * They are laid out `…/commons/thumb/<a>/<ab>/<File>/<N>px-<File>`: two
 * directories from the file's hash, the original file name, and a rendition
 * whose leading number is its width. That layout is what makes both of the
 * things below possible from one URL — asking for a different width, and naming
 * the file the picture came from — and it is stable enough to parse: it is the
 * layout every image on every Wikipedia page is served through.
 */
type CommonsThumb = {
  /** The original file name, which is what its page on Commons is called. */
  file: string;
  /** The same picture at another width. */
  atWidth(widthPx: number): string;
};

function commonsThumb(url: string): CommonsThumb | null {
  if (!url.startsWith(COMMONS_THUMB_PREFIX)) return null;

  const path = url.slice(COMMONS_THUMB_PREFIX.length).split("/");
  if (path.length < 4) return null;

  const file = path[2];
  // Lazy, so the digits found are the width and not a number inside a prefix
  // the renderer added: `lossy-page1-800px-Scan.tif.jpg` is a real rendition.
  const rendition = /^(.*?)(\d+)px-(.+)$/.exec(path[path.length - 1]);
  if (!file || !rendition) return null;

  const [, prefix, , suffix] = rendition;
  return {
    file,
    atWidth: (widthPx) => {
      const scaled = [...path];
      scaled[scaled.length - 1] = `${prefix}${widthPx}px-${suffix}`;
      return COMMONS_THUMB_PREFIX + scaled.join("/");
    }
  };
}

/**
 * The photograph in a summary response, if it has one this app may show.
 *
 * Never widens past the original: Wikimedia does not upscale, and asking for
 * 800 pixels of a 500-pixel picture is a 404 rather than a blurry picture.
 */
function photoOf(summary: ArticleSummary): LandmarkPhoto | null {
  const thumbnail = summary.thumbnail?.source;
  if (!thumbnail) return null;

  const commons = commonsThumb(thumbnail);
  if (!commons) return null;

  const width = Math.min(PHOTO_WIDTH_PX, summary.originalimage?.width ?? PHOTO_WIDTH_PX);
  return {
    imageUrl: commons.atWidth(width),
    creditUrl: `https://commons.wikimedia.org/wiki/File:${commons.file}`
  };
}

/**
 * What is known about each article, once: the photograph, or `null` for an
 * article that has none to show.
 *
 * Successes and definite absences are both kept, because both are answers about
 * a picture that does not change while the app is open. A *failed* lookup is not
 * kept — see `loadLandmarkPhoto`.
 */
const resolved = new Map<string, LandmarkPhoto | null>();

/** Lookups in flight, so a card reopened mid-request makes one request. */
const inFlight = new Map<string, Promise<LandmarkPhoto | null>>();

async function lookUp(title: string): Promise<LandmarkPhoto | null> {
  const response = await fetch(`${SUMMARY_ENDPOINT}${encodeURIComponent(title.replace(/ /g, "_"))}`, {
    headers: { Accept: "application/json", "Api-User-Agent": API_USER_AGENT }
  });

  // No such article: an answer, and one that will not be different in a minute.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`photo lookup failed (${response.status})`);

  return photoOf((await response.json()) as ArticleSummary);
}

/**
 * The article whose lead image stands for this object, or `null` for the
 * overwhelming majority of the catalogue, which gets none.
 */
export function landmarkPhotoTitle(subject: BriefingSubject): string | null {
  const id = briefingEntryFor(subject).id;
  return PHOTO_TITLES[id as keyof typeof PHOTO_TITLES] ?? null;
}

/**
 * The photograph already in hand for an article, without asking for one.
 *
 * `undefined` where nothing has been looked up yet, which is what lets the card
 * draw a photograph it already has on the first frame instead of flashing an
 * empty strip on every reopen.
 */
export function cachedLandmarkPhoto(title: string): LandmarkPhoto | null | undefined {
  return resolved.get(title);
}

/**
 * The photograph for an article, fetching it if this is the first ask.
 *
 * Never rejects: a card over a camera view is not the place for an unhandled
 * rejection, and there is nothing for the reader to do about it either way.
 *
 * A failure is deliberately not remembered. The one thing that plausibly goes
 * wrong here is that the phone had no network for a moment — it is a phone —
 * and the cost of trying again is one small request the next time somebody taps
 * that object, against a photograph missing for the rest of the session.
 */
export function loadLandmarkPhoto(title: string): Promise<LandmarkPhoto | null> {
  const known = resolved.get(title);
  if (known !== undefined) return Promise.resolve(known);

  const existing = inFlight.get(title);
  if (existing) return existing;

  const attempt = lookUp(title)
    .then((photo) => {
      resolved.set(title, photo);
      return photo;
    })
    .catch((error) => {
      console.warn(`No photograph of ${title} this time`, error);
      return null;
    })
    .finally(() => inFlight.delete(title));

  inFlight.set(title, attempt);
  return attempt;
}

/** Every article this module will ask about. For the suite. */
export const LANDMARK_PHOTO_TITLES: readonly string[] = Object.values(PHOTO_TITLES);

/** Forgets what has been looked up, so one test cannot answer another's. */
export function clearLandmarkPhotosForTesting(): void {
  resolved.clear();
  inFlight.clear();
}
