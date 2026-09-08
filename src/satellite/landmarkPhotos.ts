import { BriefingId, briefingEntryFor, BriefingSubject } from "./briefing";

/**
 * A photograph of the object under the finger, for the objects worth one.
 *
 * The card already answers what a tapped object is in words (`briefing.ts`).
 * What the words cannot do is settle what it *looks like*: someone who has just
 * pointed a phone at a moving light and read "a laboratory the size of a
 * football pitch" is owed the picture of the thing, and for the two crewed
 * stations, the great observatories and the vehicles visiting them that picture
 * exists and is free to show.
 *
 * **The pictures are not bundled.** Nineteen of them at a size worth looking at
 * is several megabytes of app download, on behalf of a panel most launches never
 * open, and they would then be frozen at the version shipped. So each is fetched
 * the first time someone taps that object and left to the platform's own HTTP
 * cache after that — one small JSON lookup and one image, on a screen that has
 * already downloaded a 2 MB catalogue.
 *
 * **Where they come from.** Wikimedia Commons, one named file per object, each
 * one looked at before it was written down here: mostly NASA's own photographs
 * of the thing in orbit, and the agency's own renderings where nobody has ever
 * photographed it — nothing has taken a picture of NuSTAR since it left the
 * rocket. A named file rather than the article's lead image, which is what the
 * first version of this asked for: two of the twelve observatories led with the
 * mission's *logo*, and an app that answers "what does XMM-Newton look like"
 * with a roundel is worse than one that says nothing. Each was also checked at
 * the size the card draws it — a strip — which is what ruled out a picture of
 * CHEOPS that was perfectly good and, cropped to a strip, an abstract.
 *
 * **The URL is asked for rather than assembled.** Wikimedia serves thumbnails
 * only at a set of sizes it has decided on, and picking a width out of the air —
 * 800, say — is a 400 for most files. So the width is a request, `iiurlwidth`,
 * and the API answers with a rendition it will actually serve at or above it.
 * The credit link is the file's own page, likewise as the API gives it.
 *
 * **Everything here is freely licensed, and says so.** Two thirds of these are
 * NASA's and in the public domain; the rest are CC BY, CC BY-SA or CC0, which
 * ask to be credited. So the caption is the author and the licence, from the
 * file's own metadata, over a link to the page carrying both in full.
 *
 * Nothing here is load-bearing. Every failure — no network, no file, a file
 * whose licence has changed, a picture the platform will not decode — ends with
 * no photograph and a card that reads exactly as it did before, which is why
 * none of it is in the boot sequence.
 */
export type LandmarkPhoto = {
  /** The picture, at about the width the card draws it. */
  imageUrl: string;
  /** Its page on Commons: the author, the licence, and the full-size file. */
  pageUrl: string;
  /** Who to credit and under what licence, in one line. */
  credit: string;
};

/**
 * Which objects get a photograph, and which file on Commons it is.
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
 *
 * The file names are exact, and a wrong one shows no picture rather than the
 * wrong picture — which is the right way round, but does mean this table is
 * worth re-checking when it is edited. `__tests__/landmarkPhotos.test.ts` walks
 * every one of them against Commons when `STARE_LIVE_PHOTOS=1` is set.
 */
const PHOTO_FILES = {
  // The two crewed stations and the great observatories: the landmark tier,
  // one entry per object.
  iss: "ISS-56 International Space Station fly-around (07).jpg",
  tiangong: "Chinese Tiangong Space Station.jpg",
  hubble: "Hubble 2009 close-up 2.jpg",
  chandra: "Chandra artist illustration.jpg",
  xmmNewton: "XMM-Newton spacecraft animations (SVS20399 - XMM Beauty Still).jpg",
  swift: "Swift Observatory spacecraft model.png",
  nustar: "NuSTAR spacecraft model.png",
  hxmt: "HXMT rendering.jpg",
  cheops: "Unibe space 01963 201801 1200.jpg",
  ixpe: "IXPE-artist-rendition.jpg",
  einsteinProbe: "Einstein Probe illustration.png",
  svom: "SVOM from 'Target of Opportunity' video.jpg",

  // The vehicles visiting them, which share a station's patch of sky and are
  // most of what a tap over that patch turns out to have caught.
  soyuz: "Soyuz MS.jpg",
  progress: "Progress spacecraft.jpg",
  dragon: "Iss071e052057.jpg",
  cygnus: "Cygnus Enhanced spacecraft.jpg",
  starliner:
    "Boeing's Starliner crew ship approaches the space station (iss067e066735) (cropped).jpg",
  shenzhou: "Shenzhou spacecraft ground test.png",
  tianzhou: "Tianzhou Rendering no background.png"
} as const satisfies Partial<Record<BriefingId, string>>;

/** The endpoint, and how Wikimedia asks a client to identify itself. */
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const API_USER_AGENT = "Stare/0.1 (https://github.com/alessandrobiason/stare)";

/**
 * How wide a picture to ask for, in pixels.
 *
 * The card is the width of the screen less its margins — some 360 points — so at
 * a phone's 3x this wants 1,080 to be pixel-exact, and 1,080 is a third of a
 * megabyte for a strip 150 points tall. 800 is the compromise: sharp enough that
 * the resampling is invisible at this size, and a fraction of the download. It
 * is a floor rather than an exact size — Wikimedia answers with the nearest
 * rendition it will serve, which is usually a little larger.
 */
const PHOTO_WIDTH_PX = 800;

/** What the phone is asked to decode. Anything else is not a photograph. */
const SHOWABLE_TYPES = ["image/jpeg", "image/png"];

/** Where Wikimedia serves files from: `thumb.` today, `upload.` for years. */
const IMAGE_HOSTS = ["https://thumb.wikimedia.org/", "https://upload.wikimedia.org/"];

/** The response, as far as this module reads it. */
type ImageInfoResponse = {
  query?: {
    pages?: {
      missing?: boolean;
      imageinfo?: {
        /** The rendition at or above the width asked for. */
        thumburl?: string;
        /** The file itself, for one already narrower than that. */
        url?: string;
        descriptionurl?: string;
        mime?: string;
        extmetadata?: Record<string, { value?: string }>;
      }[];
    }[];
  };
};

function apiUrl(file: string): string {
  const query = [
    "action=query",
    "format=json",
    "formatversion=2",
    "prop=imageinfo",
    "iiprop=url%7Cmime%7Cextmetadata",
    "iiextmetadatafilter=Artist%7CLicenseShortName",
    `iiurlwidth=${PHOTO_WIDTH_PX}`,
    // Anonymous cross-origin requests to the MediaWiki API need this, which is
    // the web replay harness rather than the phone — but it costs nothing on a
    // phone and a request that works in only one of the two is a trap.
    "origin=*",
    `titles=${encodeURIComponent(`File:${file}`)}`
  ];
  return `${COMMONS_API}?${query.join("&")}`;
}

/**
 * The metadata's idea of an author, as a line to print.
 *
 * It arrives as HTML — the author is usually a link to their user page, and
 * occasionally a paragraph about a photographic archive — because it is the same
 * field the file page renders. Stripped to its text and cut short: this goes in
 * a caption bar one line tall, over a link to the page where it is written out
 * in full.
 */
function plainText(html: string | undefined, limit: number): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** How much of an author's name fits the caption before the licence. */
const CREDIT_LIMIT = 48;

/**
 * The picture in one response, if it is one this app may show.
 *
 * The checks are the licensing and decoding ones, in that order: the file has to
 * exist on Commons — which is what says it is freely licensed — it has to be a
 * photograph rather than a diagram or a video, and it has to be served from
 * Wikimedia's own hosts rather than from wherever a redirect might point.
 */
function photoOf(response: ImageInfoResponse): LandmarkPhoto | null {
  const page = response.query?.pages?.[0];
  if (!page || page.missing) return null;

  const info = page.imageinfo?.[0];
  if (!info?.descriptionurl) return null;
  if (!info.mime || !SHOWABLE_TYPES.includes(info.mime)) return null;

  const imageUrl = info.thumburl ?? info.url;
  if (!imageUrl || !IMAGE_HOSTS.some((host) => imageUrl.startsWith(host))) return null;

  const artist = plainText(info.extmetadata?.Artist?.value, CREDIT_LIMIT);
  const licence = plainText(info.extmetadata?.LicenseShortName?.value, CREDIT_LIMIT);
  const credit = [artist, licence].filter(Boolean).join(" · ");

  return {
    imageUrl,
    pageUrl: info.descriptionurl,
    // Never blank: the caption is also the control that opens the file's page,
    // and a control with nothing written on it is not a control.
    credit: credit || "Wikimedia Commons"
  };
}

/**
 * What is known about each file, once: the photograph, or `null` for one this
 * app will not show.
 *
 * Successes and definite refusals are both kept, because both are answers about
 * a picture that does not change while the app is open. A *failed* lookup is not
 * kept — see `loadLandmarkPhoto`.
 */
const resolved = new Map<string, LandmarkPhoto | null>();

/** Lookups in flight, so a card reopened mid-request makes one request. */
const inFlight = new Map<string, Promise<LandmarkPhoto | null>>();

async function lookUp(file: string): Promise<LandmarkPhoto | null> {
  const response = await fetch(apiUrl(file), {
    headers: {
      Accept: "application/json",
      // Wikimedia asks a client to say what it is, and a browser will not let
      // one set a User-Agent, which is the header they provide instead. Not a
      // courtesy: requests that identify nothing get throttled.
      "Api-User-Agent": API_USER_AGENT
    }
  });
  if (!response.ok) throw new Error(`photo lookup failed (${response.status})`);

  return photoOf((await response.json()) as ImageInfoResponse);
}

/**
 * The file that stands for this object, or `null` for the overwhelming majority
 * of the catalogue, which gets no picture.
 */
export function landmarkPhotoFile(subject: BriefingSubject): string | null {
  const id = briefingEntryFor(subject).id;
  return PHOTO_FILES[id as keyof typeof PHOTO_FILES] ?? null;
}

/**
 * The photograph already in hand for a file, without asking for one.
 *
 * `undefined` where nothing has been looked up yet, which is what lets the card
 * draw a photograph it already has on the first frame instead of flashing an
 * empty strip on every reopen.
 */
export function cachedLandmarkPhoto(file: string): LandmarkPhoto | null | undefined {
  return resolved.get(file);
}

/**
 * The photograph for a file, fetching it if this is the first ask.
 *
 * Never rejects: a card over a camera view is not the place for an unhandled
 * rejection, and there is nothing for the reader to do about it either way.
 *
 * A failure is deliberately not remembered. The one thing that plausibly goes
 * wrong here is that the phone had no network for a moment — it is a phone —
 * and the cost of trying again is one small request the next time somebody taps
 * that object, against a photograph missing for the rest of the session.
 */
export function loadLandmarkPhoto(file: string): Promise<LandmarkPhoto | null> {
  const known = resolved.get(file);
  if (known !== undefined) return Promise.resolve(known);

  const existing = inFlight.get(file);
  if (existing) return existing;

  const attempt = lookUp(file)
    .then((photo) => {
      resolved.set(file, photo);
      return photo;
    })
    .catch((error) => {
      console.warn(`No photograph of ${file} this time`, error);
      return null;
    })
    .finally(() => inFlight.delete(file));

  inFlight.set(file, attempt);
  return attempt;
}

/** Every file this module will ask for. For the suite. */
export const LANDMARK_PHOTO_FILES: readonly string[] = Object.values(PHOTO_FILES);

/** Forgets what has been looked up, so one test cannot answer another's. */
export function clearLandmarkPhotosForTesting(): void {
  resolved.clear();
  inFlight.clear();
}
