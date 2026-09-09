/*
 * The five frames, as data.
 *
 * One entry per App Store screenshot: the caption it carries, the sky behind
 * it, the markers on that sky and which of the app's panels are open. Nothing
 * here draws anything — `page/sky.js` and `page/markers.js` do that, from these
 * numbers — so this file is the one to edit when the story changes rather than
 * the picture.
 *
 * Positions are percentages of the camera frame, which is what the projection
 * hands the overlay (`FramePoint`), and ranges are kilometres, which is what
 * decides how large a mark is drawn. `travelPct` is how much of the frame's
 * width the object covers in the twelve seconds a trail is long — the tail is
 * drawn backwards along `headingDeg`, as the app draws it.
 */

/** A row of geostationary satellites: parked, small, and all at one declination. */
function geostationaryBelt({ top, from, to, count, seed = 0 }) {
  const belt = [];
  for (let index = 0; index < count; index += 1) {
    const along = count === 1 ? 0.5 : index / (count - 1);
    const left = from + (to - from) * along;
    // The belt is an arc across the frame rather than a line: it is a circle
    // over the equator seen from the side of the planet.
    const sag = Math.sin(along * Math.PI) * 3.4;
    const category = index === 2 ? "EARTH" : index === 5 ? "OTHER" : "COMMS";
    belt.push({
      left,
      top: top - sag,
      rangeKm: 36500 + ((index * 977 + seed * 131) % 3200),
      category,
      parked: true
    });
  }
  return belt;
}

/** A launch's worth of Starlink, still in the train it was released in. */
function starlinkTrain({ from, to, count, rangeKm = 820, headingDeg = 28, travelPct = 5.4 }) {
  const train = [];
  for (let index = 0; index < count; index += 1) {
    const along = index / (count - 1);
    train.push({
      left: from.left + (to.left - from.left) * along,
      top: from.top + (to.top - from.top) * along,
      rangeKm: rangeKm + index * 26,
      category: "COMMS",
      headingDeg,
      travelPct
    });
  }
  return train;
}

/**
 * The camera's own shape, which is what turns a heading into a direction on the
 * frame: a step of one percent across is not a step of one percent down.
 */
const CAMERA_ASPECT = 1080 / 1440;

/**
 * The arc a landmark is on, as the app draws it (`src/satellite/orbitPath.ts`).
 *
 * Taken from the object rather than typed beside it, so a path cannot end up
 * pointing somewhere its own marker is not going: the line runs along the
 * marker's heading, from the marker itself, for `runPct` of the frame's width —
 * and the marks along it are one minute apart, which is five of the twelve
 * seconds its tail already stands for.
 *
 * Only ahead of the object, because that is all the app draws: the ground it
 * has already covered is the tail's business. A pass that has not begun has no
 * marker at all, so it is given a `from` of its own — the point it will come up
 * at — and the clock time to write under it.
 */
function pathAhead(object, { runPct, lead = 0, rise, from, tickOffsetPct }) {
  const radians = (object.headingDeg ?? 90) * (Math.PI / 180);
  const start = from ?? { left: object.left, top: object.top };
  return {
    name: object.name,
    category: object.category ?? "LANDMARK",
    from: start,
    to: {
      left: start.left + Math.cos(radians) * runPct,
      top: start.top - Math.sin(radians) * runPct * CAMERA_ASPECT
    },
    tickPct: (object.travelPct ?? 0) * 5,
    tickOffsetPct,
    lead,
    rise
  };
}

const NIGHT_CITY = {
  mode: "night",
  seed: 11,
  skyline: [
    { type: "block", x: -0.02, w: 0.2, top: 0.87 },
    { type: "block", x: 0.16, w: 0.13, top: 0.82, antenna: 0.05, antennaAt: 0.35 },
    { type: "tree", x: 0.36, w: 0.19, top: 0.79 },
    { type: "block", x: 0.5, w: 0.16, top: 0.85 },
    { type: "block", x: 0.64, w: 0.22, top: 0.8 },
    { type: "block", x: 0.84, w: 0.2, top: 0.88 }
  ]
};

/*
 * The landmarks, one per frame, named so that each one's path can be taken from
 * the marker itself rather than typed twice (`pathAhead`).
 */

const ISS_TONIGHT = {
  left: 63,
  top: 27,
  rangeKm: 470,
  category: "LANDMARK",
  name: "ISS",
  labelled: true,
  headingDeg: 22,
  travelPct: 13
};

const ISS_TAPPED = {
  left: 57,
  top: 26,
  rangeKm: 612,
  category: "LANDMARK",
  name: "ISS",
  labelled: true,
  headingDeg: 41,
  travelPct: 11.5
};

/**
 * Hubble on the occlusion frame, climbing away from the tower rather than over
 * it.
 *
 * The app would draw its path across the building if that were where the pass
 * went — a path is where to point rather than a claim that something can be
 * seen, and it is deliberately not the mask's business — but this frame is
 * about the marks stopping at the roof line, and a line carrying on over it is
 * a second thing to explain in a picture that has one thing to say.
 */
const HUBBLE_CLEAR_OF_THE_TOWER = {
  // Far enough in from the frame's left edge for its name to be read: the
  // picture covers the screen, so the sides of the frame are cropped and a
  // label out there is cut in half. See `frameBoxFor`.
  left: 28,
  top: 43,
  rangeKm: 520,
  category: "LANDMARK",
  name: "Hubble",
  labelled: true,
  headingDeg: 70,
  travelPct: 12
};

const TIANGONG_BY_DAY = {
  left: 30,
  top: 22,
  rangeKm: 505,
  category: "LANDMARK",
  name: "Tiangong",
  labelled: true,
  headingDeg: 335,
  travelPct: 12.5
};

const ISS_IN_VIEW = {
  left: 46,
  top: 47,
  rangeKm: 690,
  category: "LANDMARK",
  name: "ISS",
  labelled: true,
  headingDeg: 200,
  travelPct: 11
};

/**
 * The two on the forecast frame: one landmark crossing now, and one that has
 * not come up yet.
 *
 * CHEOPS is at 700 km and covers a quarter of a degree a second, so its minute
 * marks fall about fifteen degrees apart — the closest the app will place them
 * (`tickSeparationDeg`). The station is three times quicker and gets one mark
 * where CHEOPS gets two, which is the cadence choosing itself rather than being
 * chosen.
 */
const CHEOPS_OVERHEAD = {
  left: 30,
  top: 24,
  rangeKm: 700,
  category: "LANDMARK",
  name: "CHEOPS",
  labelled: true,
  headingDeg: 10,
  travelPct: 5.6
};

/** No marker: it is still under the horizon, and the arc is the whole of it. */
const ISS_NEXT_PASS = {
  left: 30,
  top: 71,
  category: "LANDMARK",
  name: "ISS",
  headingDeg: 32,
  travelPct: 11
};

const scenes = [
  {
    id: "01-sky",
    caption: {
      title: "Point it at the sky",
      body: "The satellites passing over you, drawn on the picture where they actually are."
    },
    sky: NIGHT_CITY,
    palette: "night",
    panels: { filter: "closed", status: "closed" },
    // The station's own arc, running on ahead of it: the same line the marker
    // is travelling along, with the next minute marked on it.
    // A minute of the station is most of the frame's width, so where the next
    // one falls decides whether a mark is on the screen at all: this pass rose
    // on the turn of one, and the mark is a quarter of a minute along.
    paths: [pathAhead(ISS_TONIGHT, { runPct: 48, tickOffsetPct: 14 })],
    markers: [
      ...geostationaryBelt({ top: 58, from: 6, to: 94, count: 8, seed: 3 }),
      ...starlinkTrain({ from: { left: 20, top: 33 }, to: { left: 47, top: 17 }, count: 5 }),
      ISS_TONIGHT,
      { left: 16, top: 51, rangeKm: 20200, category: "NAVIGATION", headingDeg: 300, travelPct: 1.4 },
      { left: 81, top: 43, rangeKm: 21500, category: "NAVIGATION", headingDeg: 118, travelPct: 1.4 },
      { left: 35, top: 64, rangeKm: 23100, category: "NAVIGATION", headingDeg: 260, travelPct: 1.3 },
      { left: 52, top: 45, rangeKm: 780, category: "EARTH", headingDeg: 248, travelPct: 6.2 },
      { left: 27, top: 11, rangeKm: 910, category: "EARTH", headingDeg: 68, travelPct: 5.6 },
      { left: 73, top: 62, rangeKm: 1400, category: "EARTH", headingDeg: 196, travelPct: 4.2 },
      { left: 10, top: 29, rangeKm: 1500, category: "OTHER", headingDeg: 44, travelPct: 4 },
      { left: 44, top: 7, rangeKm: 2100, category: "OTHER", headingDeg: 138, travelPct: 3.4 },
      { left: 58, top: 53, rangeKm: 3400, category: "OTHER", headingDeg: 292, travelPct: 2.6 },
      { left: 88, top: 21, rangeKm: 1800, category: "OTHER", headingDeg: 78, travelPct: 3.7 },
      { left: 23, top: 71, rangeKm: 1150, category: "OTHER", headingDeg: 214, travelPct: 4.6 },
      { left: 66, top: 73, rangeKm: 2600, category: "OTHER", headingDeg: 160, travelPct: 3 },
      { left: 40, top: 38, rangeKm: 5200, category: "OTHER", headingDeg: 320, travelPct: 2.2 },
      { left: 91, top: 69, rangeKm: 4200, category: "OTHER", headingDeg: 250, travelPct: 2.4 },
      { left: 18, top: 41, rangeKm: 1100, category: "COMMS", headingDeg: 38, travelPct: 5 },
      { left: 55, top: 19, rangeKm: 1250, category: "COMMS", headingDeg: 122, travelPct: 4.7 },
      { left: 77, top: 8, rangeKm: 1020, category: "COMMS", headingDeg: 96, travelPct: 5.2 }
    ]
  },

  {
    id: "02-tap",
    caption: {
      title: "Tap a light, learn what it is",
      body: "What it is, who flies it, how far away — and the figures keep moving while you read."
    },
    sky: { ...NIGHT_CITY, seed: 23 },
    palette: "night",
    panels: { filter: "closed", status: "closed" },
    selected: "ISS",
    card: {
      names: ["ISS", "CREW DRAGON 9", "PROGRESS-MS 28"],
      selected: "ISS",
      category: "LANDMARK",
      purpose: "LANDMARKS",
      briefing:
        "The International Space Station: a laboratory the size of a football pitch, 400 km up, " +
        "crewed without a break since November 2000 by NASA, Roscosmos, ESA, JAXA and CSA. It is " +
        "also the brightest thing in this sky — bright enough to follow with the naked eye.",
      site: "nasa.gov",
      facts: [
        ["Distance", "612 km"],
        ["Altitude", "421 km"],
        ["Speed", "7.7 km/s"],
        ["Look", "NE 41° · 38° up"],
        ["Orbit", "93 min"]
      ]
    },
    // The same arc as the card is describing: the tapped object is on it, and
    // the figures on the card are figures about a point along it.
    paths: [pathAhead(ISS_TAPPED, { runPct: 45 })],
    markers: [
      ...geostationaryBelt({ top: 61, from: 4, to: 96, count: 8, seed: 9 }),
      ISS_TAPPED,
      // Docked, so they share the station's patch of sky — which is why the
      // card carries a strip of names rather than one.
      { left: 60.6, top: 22.9, rangeKm: 613, category: "OTHER", name: "CREW DRAGON 9", headingDeg: 41, travelPct: 11.5 },
      { left: 53.2, top: 29.1, rangeKm: 613, category: "OTHER", name: "PROGRESS-MS 28", headingDeg: 41, travelPct: 11.5 },
      ...starlinkTrain({ from: { left: 14, top: 44 }, to: { left: 38, top: 30 }, count: 4 }),
      { left: 24, top: 15, rangeKm: 20800, category: "NAVIGATION", headingDeg: 292, travelPct: 1.4 },
      { left: 84, top: 38, rangeKm: 21900, category: "NAVIGATION", headingDeg: 112, travelPct: 1.4 },
      { left: 41, top: 8, rangeKm: 850, category: "EARTH", headingDeg: 62, travelPct: 5.8 },
      { left: 78, top: 17, rangeKm: 1320, category: "EARTH", headingDeg: 188, travelPct: 4.3 },
      { left: 12, top: 24, rangeKm: 1700, category: "OTHER", headingDeg: 40, travelPct: 3.8 },
      { left: 68, top: 47, rangeKm: 3100, category: "OTHER", headingDeg: 300, travelPct: 2.7 },
      { left: 33, top: 52, rangeKm: 2400, category: "OTHER", headingDeg: 154, travelPct: 3.1 },
      { left: 90, top: 55, rangeKm: 4600, category: "OTHER", headingDeg: 246, travelPct: 2.3 },
      { left: 47, top: 43, rangeKm: 1180, category: "COMMS", headingDeg: 34, travelPct: 4.9 }
    ]
  },

  {
    id: "03-occlusion",
    caption: {
      title: "It knows what is in the way",
      body: "Anything behind a building or a tree is left out, rather than drawn over it."
    },
    sky: {
      mode: "night",
      seed: 41,
      skyline: [
        { type: "block", x: -0.02, w: 0.28, top: 0.63 },
        { type: "tree", x: 0.35, w: 0.22, top: 0.66 },
        // The tower the frame is about: it climbs a third of the way up the
        // picture, and the markers stop where it starts.
        { type: "block", x: 0.53, w: 0.34, top: 0.31, antenna: 0.09, antennaAt: 0.28 },
        { type: "block", x: 0.86, w: 0.18, top: 0.72 }
      ]
    },
    palette: "night",
    panels: { filter: "closed", status: "closed" },
    // Steeply up and out of the top of the frame, well clear of the tower: the
    // one thing this frame is for is the marks stopping at the roof line.
    paths: [pathAhead(HUBBLE_CLEAR_OF_THE_TOWER, { runPct: 70 })],
    markers: [
      // The train runs down towards the tower, and stops on its edge: the last
      // mark is mid-fade at the corner of the roof, and the two that would be
      // behind the building are simply not drawn. The line it was following is
      // what says they are missing.
      ...starlinkTrain({ from: { left: 10, top: 9 }, to: { left: 45, top: 26 }, count: 5, headingDeg: -26 }),
      { left: 53.5, top: 30.5, rangeKm: 950, category: "COMMS", headingDeg: -26, travelPct: 5.4, opacity: 0.3 },
      HUBBLE_CLEAR_OF_THE_TOWER,
      ...geostationaryBelt({ top: 24, from: 6, to: 44, count: 4, seed: 5 }),
      { left: 71, top: 14, rangeKm: 20600, category: "NAVIGATION", headingDeg: 286, travelPct: 1.4 },
      { left: 90, top: 33, rangeKm: 22400, category: "NAVIGATION", headingDeg: 108, travelPct: 1.3 },
      { left: 64, top: 8, rangeKm: 880, category: "EARTH", headingDeg: 72, travelPct: 5.7 },
      { left: 33, top: 34, rangeKm: 1450, category: "EARTH", headingDeg: 210, travelPct: 4.1 },
      { left: 8, top: 52, rangeKm: 1900, category: "OTHER", headingDeg: 48, travelPct: 3.6 },
      { left: 41, top: 55, rangeKm: 2800, category: "OTHER", headingDeg: 320, travelPct: 2.9 },
      { left: 27, top: 5, rangeKm: 1250, category: "COMMS", headingDeg: 128, travelPct: 4.7 },
      // Clear sky on the far side of the tower, and a hand's width above two
      // roof lines: the marks go right up to what is in the way and stop.
      { left: 93, top: 47, rangeKm: 3600, category: "OTHER", headingDeg: 238, travelPct: 2.5 },
      { left: 91, top: 66, rangeKm: 1350, category: "EARTH", headingDeg: 208, travelPct: 4.3 },
      { left: 11, top: 58, rangeKm: 2200, category: "OTHER", headingDeg: 52, travelPct: 3.3 },
      { left: 31, top: 61, rangeKm: 1600, category: "COMMS", headingDeg: 142, travelPct: 3.9 }
    ]
  },

  {
    id: "04-legend",
    caption: {
      title: "Colour is what it is for",
      body: "Size is how far away. A ring holds station over the equator. Day or night, the sky decides the ink."
    },
    sky: {
      mode: "day",
      seed: 61,
      skyline: [
        { type: "block", x: -0.02, w: 0.22, top: 0.88 },
        { type: "tree", x: 0.28, w: 0.2, top: 0.82 },
        { type: "block", x: 0.46, w: 0.19, top: 0.86 },
        { type: "block", x: 0.68, w: 0.16, top: 0.83, antenna: 0.04, antennaAt: 0.6 },
        { type: "block", x: 0.85, w: 0.19, top: 0.89 }
      ]
    },
    palette: "daylight",
    panels: { filter: "open", status: "closed" },
    // The daylight ink runs the other way round, and the path runs with it: on
    // a bright sky the landmark tier is near-black, line and all.
    paths: [pathAhead(TIANGONG_BY_DAY, { runPct: 80 })],
    markers: [
      ...geostationaryBelt({ top: 62, from: 5, to: 60, count: 5, seed: 13 }),
      TIANGONG_BY_DAY,
      ...starlinkTrain({ from: { left: 8, top: 40 }, to: { left: 33, top: 50 }, count: 4, headingDeg: -22 }),
      { left: 14, top: 9, rangeKm: 20400, category: "NAVIGATION", headingDeg: 296, travelPct: 1.4 },
      { left: 44, top: 12, rangeKm: 22100, category: "NAVIGATION", headingDeg: 104, travelPct: 1.3 },
      { left: 22, top: 66, rangeKm: 940, category: "EARTH", headingDeg: 58, travelPct: 5.5 },
      { left: 52, top: 33, rangeKm: 1280, category: "EARTH", headingDeg: 202, travelPct: 4.4 },
      { left: 6, top: 25, rangeKm: 2000, category: "OTHER", headingDeg: 44, travelPct: 3.5 },
      { left: 38, top: 72, rangeKm: 2900, category: "OTHER", headingDeg: 316, travelPct: 2.8 },
      { left: 60, top: 74, rangeKm: 1600, category: "OTHER", headingDeg: 152, travelPct: 3.9 },
      { left: 17, top: 78, rangeKm: 4800, category: "OTHER", headingDeg: 262, travelPct: 2.2 }
    ]
  },

  {
    id: "05-inview",
    caption: {
      title: "What is overhead, right now",
      body: "The live public catalogue — some 16,000 tracked objects — sorted into what the sky in front of you actually holds."
    },
    sky: { ...NIGHT_CITY, seed: 77 },
    palette: "night",
    panels: { filter: "closed", status: "open" },
    // The named fleets only. What is left over is worked out by the generator
    // from the marks actually on the screen, so the rows and the count above
    // them always add up — see `statusPanel`.
    breakdown: {
      rows: [
        ["Starlink", 6],
        ["SES", 3],
        ["Galileo", 2],
        ["GPS", 2],
        ["ISS", 1]
      ]
    },
    paths: [pathAhead(ISS_IN_VIEW, { runPct: 55 })],
    markers: [
      ...geostationaryBelt({ top: 57, from: 8, to: 96, count: 7, seed: 17 }),
      ...starlinkTrain({ from: { left: 26, top: 36 }, to: { left: 62, top: 16 }, count: 6 }),
      ISS_IN_VIEW,
      { left: 13, top: 18, rangeKm: 20500, category: "NAVIGATION", headingDeg: 298, travelPct: 1.4 },
      { left: 34, top: 8, rangeKm: 21800, category: "NAVIGATION", headingDeg: 110, travelPct: 1.3 },
      { left: 87, top: 30, rangeKm: 23400, category: "NAVIGATION", headingDeg: 258, travelPct: 1.3 },
      { left: 70, top: 40, rangeKm: 22600, category: "NAVIGATION", headingDeg: 82, travelPct: 1.4 },
      { left: 20, top: 62, rangeKm: 21200, category: "NAVIGATION", headingDeg: 176, travelPct: 1.4 },
      { left: 9, top: 44, rangeKm: 1210, category: "EARTH", headingDeg: 52, travelPct: 4.8 },
      { left: 78, top: 68, rangeKm: 860, category: "EARTH", headingDeg: 222, travelPct: 5.8 },
      { left: 57, top: 70, rangeKm: 1550, category: "OTHER", headingDeg: 140, travelPct: 4 },
      { left: 30, top: 74, rangeKm: 2700, category: "OTHER", headingDeg: 306, travelPct: 2.9 },
      { left: 92, top: 12, rangeKm: 3300, category: "OTHER", headingDeg: 64, travelPct: 2.6 },
      { left: 41, top: 24, rangeKm: 1750, category: "OTHER", headingDeg: 190, travelPct: 3.8 },
      { left: 66, top: 56, rangeKm: 4400, category: "OTHER", headingDeg: 332, travelPct: 2.3 },
      { left: 5, top: 70, rangeKm: 1050, category: "OTHER", headingDeg: 96, travelPct: 5.1 },
      { left: 50, top: 6, rangeKm: 2200, category: "COMMS", headingDeg: 126, travelPct: 3.3 }
    ]
  },

  {
    id: "06-pass",
    caption: {
      title: "Know when to look up",
      body: "Each landmark carries the arc it will cross, marked minute by minute, and the time it comes up."
    },
    sky: { ...NIGHT_CITY, seed: 53 },
    palette: "night",
    panels: { filter: "closed", status: "closed" },
    // Two passes, which is what the frame is about. One is under way and is
    // drawn at full strength from the object itself; the other has not begun,
    // so it has no marker at all — only the line, faded by how far off it is,
    // and its name and the clock time under the point it will come up at.
    paths: [
      pathAhead(CHEOPS_OVERHEAD, { runPct: 90 }),
      pathAhead(ISS_NEXT_PASS, { runPct: 85, lead: 0.55, rise: "22:41" })
    ],
    markers: [
      CHEOPS_OVERHEAD,
      ...geostationaryBelt({ top: 55, from: 8, to: 92, count: 6, seed: 29 }),
      { left: 68, top: 22, rangeKm: 20700, category: "NAVIGATION", headingDeg: 288, travelPct: 1.4 },
      { left: 15, top: 40, rangeKm: 22800, category: "NAVIGATION", headingDeg: 96, travelPct: 1.3 },
      { left: 86, top: 8, rangeKm: 940, category: "EARTH", headingDeg: 66, travelPct: 5.5 },
      { left: 44, top: 34, rangeKm: 1380, category: "EARTH", headingDeg: 204, travelPct: 4.2 },
      { left: 9, top: 12, rangeKm: 1650, category: "OTHER", headingDeg: 46, travelPct: 3.9 },
      { left: 58, top: 63, rangeKm: 2900, category: "OTHER", headingDeg: 318, travelPct: 2.8 },
      { left: 90, top: 70, rangeKm: 1450, category: "OTHER", headingDeg: 148, travelPct: 4.1 },
      { left: 20, top: 78, rangeKm: 4300, category: "OTHER", headingDeg: 254, travelPct: 2.3 },
      { left: 74, top: 46, rangeKm: 1120, category: "COMMS", headingDeg: 36, travelPct: 5 },
      { left: 37, top: 12, rangeKm: 1280, category: "COMMS", headingDeg: 118, travelPct: 4.6 }
    ]
  }
];

export default scenes;
