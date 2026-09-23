import type { ObserverLocation } from "../../src/types";

/**
 * The six App Store frames, as inputs to the real app rather than as a drawing
 * of it.
 *
 * Each scene is a place, an instant and a direction to point the phone in. The
 * harness (`ShotScene.tsx`) hands those to the app's own view, the app works out
 * what is overhead from the committed TLE fixture, and `tools/screenshots/capture.mjs`
 * photographs the result. Nothing here describes what the screen should look
 * like: that is the app's business, which is the whole reason this replaced a
 * hand-drawn mirror of it.
 *
 * **The times are not arbitrary and cannot be changed casually.** Three things
 * hold each one in place:
 *
 * - *The catalogue.* `testing/fixtures/active.tle` carries elements from
 *   2026-08-23 (day 235). SGP4 is accurate for days either side of its own
 *   epoch and drifts badly beyond that, so a scene time far from it would place
 *   real objects in the wrong part of the sky.
 * - *The sun.* The app colours the sky by the sun's altitude, so a night
 *   photograph needs a time at which the sun is actually down over that place,
 *   or the panels come up in their daylight palette over a starfield.
 * - *What is being shown.* A satellite is only worth tapping when it is up, and
 *   a pass is only "coming up" shortly before it rises. Both were found by
 *   search rather than guessed — see the note on each scene below.
 *
 * Re-derive them with the scan in `docs/app-store-screenshots.md` if the
 * fixture is ever refreshed.
 */

/** Where the phone is pointing, which decides what lands in the frame. */
export type ShotAim =
  | {
      /**
       * Point at a named object, wherever it is at the scene's instant. Used
       * where the frame is about one satellite: the harness resolves it through
       * the app's own tracker, so the mark lands in the middle of the picture.
       *
       * **The app's name for it, not CelesTrak's.** The catalogue is renamed as
       * it is parsed (`displayName`), so the station is `ISS` here and not
       * `ISS (ZARYA)`, Hubble is `Hubble` and not `HST`. It is also what the
       * catalogue tab is searched for when the scene is staged.
       */
      kind: "target";
      name: string;
    }
  | {
      /** Point at a fixed bearing and height, for the frames about the sky at large. */
      kind: "fixed";
      azimuthDeg: number;
      elevationDeg: number;
    };

/**
 * What the driver does to the running app before it takes the picture.
 *
 * Every one of these is a real interaction — a tap on a control, a row pressed
 * in the catalogue — performed against the running app in the browser, rather
 * than a flag that puts a panel on screen. If a panel cannot be opened this way
 * any more, that is a change to the app worth knowing about, and the capture
 * fails rather than quietly shipping the old picture.
 */
export type ShotStaging =
  /** The plain view, nothing opened. */
  | "sky"
  /** Find the aimed-at object in the catalogue and press it, which opens its card. */
  | "tapped"
  /** The filter panel down from its button in the header. */
  | "filter"
  /** The count in the header opened into the breakdown behind it. */
  | "breakdown"
  /** The upcoming-passes panel open. */
  | "passes";

export type ShotScene = {
  /** Matches the photograph in `tools/screenshots/backgrounds/` and the frame in `docs/app-store/`. */
  id: string;
  /** Where the phone is standing. */
  observer: ObserverLocation;
  /** The instant the sky is drawn for, as an ISO 8601 UTC string. */
  timeIso: string;
  /**
   * `timeIso` as a clock in that place would read it, for the status bar the
   * store frame draws over the capture (`render.mjs`).
   *
   * Written out rather than derived, because deriving it means a timezone
   * database for six strings. Every scene here is in central European summer
   * time, so each is `timeIso` plus two hours. Apple's own marketing uses 9:41
   * on every screenshot; this does not, because a night sky under a morning
   * clock is the kind of detail that makes a listing look assembled.
   */
  clock: string;
  aim: ShotAim;
  staging: ShotStaging;
  /**
   * Bank about the optical axis, in degrees. Zero is a phone held upright, and
   * every scene here is, because the app is portrait-only.
   */
  rollDeg?: number;
};

/*
 * **Why the bearings are what they are.** The first set of these was aimed by
 * eye and the frames came back nearly empty — one scene drew a single mark.
 * The sky is not evenly populated: from these latitudes the geostationary belt
 * runs as an arc across the south at about 30 degrees up, and a frame pointed
 * into it holds two hundred objects where one pointed north-west holds eighty.
 *
 * So each bearing below was **measured, not modelled**. Two attempts to work it
 * out on paper were both wrong by an order of magnitude, because three things
 * bear on the answer at once and the third is not computable at all: where the
 * catalogue is at that instant, how much of the camera frame survives the
 * screen crop (a 699-point-wide frame covering a 430-point-wide screen loses a
 * third of its width, and only what is left is counted), and what the
 * segmentation model makes of that particular photograph.
 *
 * `tools/screenshots/probe-aims.mjs` turns the running app through a grid of
 * bearings and reads the count off the header. The figures noted on each scene
 * below came from it, and re-running it is the way to move one.
 *
 * They are deliberately not all the same bearing. Three frames pointed at the
 * identical arc would look copied, so each is offset from the best one it could
 * have had, which costs some tens of marks and buys a set that looks like six
 * different evenings.
 */
export const SHOT_SCENES: readonly ShotScene[] = [
  {
    // Alpe di Siusi, fully dark. Pointed into the south-east where the belt is:
    // about 110 marks on screen.
    id: "01-sky",
    observer: { latitudeDeg: 46.5405, longitudeDeg: 11.62, heightM: 1800 },
    timeIso: "2026-08-23T20:20:00Z",
    clock: "22:20",
    aim: { kind: "fixed", azimuthDeg: 168, elevationDeg: 12 },
    staging: "sky"
  },
  {
    // Seceda in the small hours, with the station 42 degrees up and due south.
    // The aim is the station itself, so its mark is the one in the middle of the
    // frame when the card opens — which means the bearing cannot be chosen for a
    // full sky, only the instant can. Due south is the half of the sky that has
    // anything in it: pointed west, where the station also passes, the same
    // scene drew two marks.
    id: "02-tap",
    observer: { latitudeDeg: 46.606, longitudeDeg: 11.672, heightM: 2500 },
    timeIso: "2026-08-23T02:12:00Z",
    clock: "04:12",
    aim: { kind: "target", name: "ISS" },
    staging: "tapped"
  },
  {
    // Milan, deep night, pointed steeply up — because the photograph is taken
    // straight up a gap between two buildings, and the app has to be looking
    // where the camera was. That is also what makes the frame: the sky is a
    // channel down the middle, the buildings are either side of it, and the
    // mask is what decides which marks survive. About 130 objects in frame.
    id: "03-occlusion",
    observer: { latitudeDeg: 45.4642, longitudeDeg: 9.19, heightM: 120 },
    timeIso: "2026-08-23T02:15:00Z",
    clock: "04:15",
    aim: { kind: "fixed", azimuthDeg: 160, elevationDeg: 62 },
    staging: "sky"
  },
  {
    // Rome, mid-morning, the sun 35 degrees up: the frame's point is that the
    // legend and the marks read the same by day. About 100 marks on screen.
    id: "04-legend",
    observer: { latitudeDeg: 41.8925, longitudeDeg: 12.4853, heightM: 30 },
    timeIso: "2026-08-23T07:40:00Z",
    clock: "09:40",
    aim: { kind: "fixed", azimuthDeg: 142, elevationDeg: 12 },
    staging: "filter"
  },
  {
    // Bologna at dusk, the sun six degrees down — the light the photograph was
    // taken in, and a city rather than another mountain, because five frames of
    // Dolomites is one listing of the same evening. The number in the header is
    // what this frame exists to break down, so it is pointed at the fullest sky
    // the probe found: about 125 marks.
    id: "05-inview",
    observer: { latitudeDeg: 44.4949, longitudeDeg: 11.3426, heightM: 54 },
    timeIso: "2026-08-23T18:40:00Z",
    clock: "20:40",
    aim: { kind: "fixed", azimuthDeg: 130, elevationDeg: 16 },
    staging: "breakdown"
  },
  {
    // Tre Cime at dawn's blue hour — the sun 4 degrees down, which is the light
    // the photograph was taken in and the light a pass is watched in. The panel
    // is the point of this frame: what is coming up, and when. About 215
    // marks clear of the peaks behind it.
    id: "06-pass",
    observer: { latitudeDeg: 46.6183, longitudeDeg: 12.305, heightM: 2320 },
    timeIso: "2026-08-25T04:00:00Z",
    clock: "06:00",
    aim: { kind: "fixed", azimuthDeg: 130, elevationDeg: 12 },
    staging: "passes"
  }
];

/** The scene with this id, or `null` where nothing matches. */
export function shotSceneById(id: string | null): ShotScene | null {
  if (!id) return null;
  return SHOT_SCENES.find((scene) => scene.id === id) ?? null;
}
