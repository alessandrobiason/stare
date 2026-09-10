import type { Strings } from "../types";

/**
 * English: the language the app is written in, and the one every other file
 * is a translation of.
 *
 * When a string here changes, the eleven others are stale until they change
 * too — there is no marker for that beyond the diff, so keep the edits small
 * and do them together.
 */
export const en: Strings = {
  intro: {
    what: {
      body:
        "Point the phone at the sky. The satellites passing over you are drawn onto " +
        "the picture where they actually are."
    },
    holding: {
      title: "Hold it up, turn slowly",
      body:
        "Every mark is one object: its colour says what the satellite is for, its size " +
        "how far away it is. Anything behind a building or a tree is left out rather " +
        "than drawn over it. The few worth going outside for also carry the line they " +
        "are about to follow: an arrowhead for every minute along it, and the time it " +
        "comes up if it has not risen yet."
    },
    screen: {
      title: "What is on screen",
      body: "Five things sit around the sky. These three say what is up there.",
      count: {
        where: "Top left",
        meaning:
          "How many satellites are drawn right now — not how many exist. Anything " +
          "below the horizon, or behind a building, is not counted. Tap it to see " +
          "what they are."
      },
      passes: {
        where: "Bottom left",
        meaning:
          "The next landmark due over you, and how long until it rises. Tap it for the " +
          "rest, and for where to stand."
      },
      marker: {
        where: "On the sky",
        meaning:
          "Tap any mark: what the object is, who flies it, how far away it is and " +
          "where to look for it."
      }
    },
    controls: {
      title: "And two more",
      body: "One decides what gets drawn. The other is for when something looks wrong.",
      filter: {
        where: "Top right",
        meaning:
          "Which kinds to draw, and the key to the colours — including the ring that " +
          "marks an object parked over the equator."
      },
      console: {
        where: "Bottom right",
        meaning:
          "The sensor readings behind the view, for when something looks wrong. In " +
          "English only, and never needed to use the app."
      }
    },
    access: {
      title: "What it needs",
      body: "Two things, and the phone will ask you about each of them in a moment.",
      camera: {
        name: "Camera",
        reason: "The sky in front of you, and what is standing in the way of it."
      },
      location: {
        name: "Location",
        reason: "Which satellites are above you, and where in the sky they sit."
      },
      footnote:
        "Which way the phone is pointed comes from its own motion sensors, which it " +
        "reads without asking. Everything here is used on the phone alone: the only " +
        "thing Stare sends or fetches is the public satellite catalogue, and where you " +
        "are never leaves the device."
    },
    next: "NEXT",
    allowAccess: "ALLOW ACCESS"
  },
  scene: {
    visibleSatellites: "{count} visible satellites",
    markers: "Satellite markers",
    breakdown: {
      title: "IN VIEW",
      empty: "Nothing in view",
      other: "Others"
    },
    sunlight: {
      daylight: "Daylight — none of these can be seen yet",
      none: "All of these are in the Earth's shadow",
      some: "{count} of these are in sunlight",
      all: "All of these are in sunlight"
    },
    passes: {
      title: "COMING UP",
      open: "Upcoming passes",
      now: "now",
      seeing: {
        visible: "visible to the eye",
        binoculars: "binoculars only",
        tooFaint: "too faint to see",
        eclipsed: "in the Earth's shadow",
        daylight: "daylight — nothing to see",
        unknown: "brightness not recorded"
      }
    }
  },
  filter: {
    title: "FILTER",
    open: "Category filter",
    showAll: "SHOW ALL",
    ringKey: "RING = PARKED OVER THE EQUATOR",
    shadowKey: "FAINT = IN THE EARTH'S SHADOW",
    categories: {
      LANDMARK: "LANDMARKS",
      NAVIGATION: "NAVIGATION",
      EARTH: "EARTH WATCH",
      COMMS: "INTERNET & TV",
      OTHER: "OTHER"
    }
  },
  card: {
    details: "Satellite details",
    close: "Close satellite details",
    holdsStation: "HOLDS STATION",
    openSite: "Open {site}",
    photo: "Photograph of {name}",
    missing: "This satellite has left the catalog.",
    seeing: {
      visible: "Bright enough to see now",
      binoculars: "In sunlight, but you would want binoculars",
      tooFaint: "In sunlight, and far too faint to see",
      eclipsed: "In the Earth's shadow, with no sunlight on it to see",
      daylight: "The sun is still up here — nothing in orbit can be seen yet",
      unknown: "In sunlight, though how brightly it shines is not recorded",
      magnitude: "magnitude {value}",
      aboutMagnitude: "around magnitude {value}",
      onPass: "When it comes over at {time}: {verdict}"
    },
    facts: {
      distance: "Distance",
      altitude: "Altitude",
      speed: "Speed",
      look: "Look",
      orbit: "Orbit"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours}h {minutes}m",
    up: "{degrees}° up",
    below: "{degrees}° below",
    unknown: "—"
  },
  compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  compassNotice: {
    calibrate: {
      title: "Compass needs calibrating",
      detail:
        "Move the phone in a figure eight, away from magnets, metal and other phones. " +
        "Until then the satellites can be tens of degrees from where they are drawn."
    },
    magnetic: {
      title: "Headings are magnetic north",
      detail:
        "This phone has not reported a true-north offset, so everything is drawn out " +
        "by the local declination — a few degrees in most places."
    }
  },
  boot: {
    failed: "Could not start",
    tryAgain: "TRY AGAIN",
    unsupported: "This device cannot run the sky view."
  },
  language: {
    title: "Language",
    close: "Close the language list"
  }
};
