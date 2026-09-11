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
        "Point your phone at the sky and move it slowly. You'll see the satellites above " +
        "you, right where they are."
    },
    marks: {
      title: "What you'll see",
      body: "Every dot is a satellite. Tap one to find out what it is.",
      moving: {
        name: "Moving",
        meaning: "The tail shows where it came from. The bigger the dot, the closer it is."
      },
      parked: {
        name: "Ring",
        meaning: "Stays in the same spot in the sky."
      },
      shadow: {
        name: "Faint",
        meaning: "In the Earth's shadow, so you can't see it."
      },
      landmark: {
        name: "Highlights",
        meaning: "Space stations and big telescopes, shown with their name."
      },
      colors: "The colour shows what it's for:"
    },
    paths: {
      title: "When and where to look",
      body:
        "Space stations and telescopes show the path they'll take, even before they " +
        "appear.",
      minutes: "One arrow per minute, pointing the way it's going.",
      time: "Its name, and the time it will be there.",
      follow: "Follow the line to find where it will appear.",
      footnote: "Tap the name to learn more."
    },
    passes: {
      title: "Coming up",
      body: "The bottom-left corner shows what will pass over you next.",
      shut: "The next one, and how long until it appears.",
      open: "Tap to see the next few hours: where to look, how high it gets and whether you'll see it.",
      footnote: "If nothing is coming, the corner stays empty."
    },
    corners: {
      title: "Around the edges",
      body: "Four more things you can tap.",
      count: {
        where: "Top left",
        meaning: "How many satellites are on screen. Tap to see which ones."
      },
      filter: {
        where: "Top right",
        meaning: "Choose which kinds of satellite to show."
      },
      guide: {
        where: "Bottom right",
        meaning: "Shows these pages again, whenever you need them."
      },
      console: {
        where: "Bottom right",
        meaning: "Technical readings, in English. You won't need them."
      }
    },
    access: {
      title: "Two permissions",
      body: "Your phone will ask for them next.",
      camera: {
        name: "Camera",
        reason: "To show the sky in front of you."
      },
      location: {
        name: "Location",
        reason: "To know which satellites are above you."
      },
      footnote: "Your location never leaves your phone."
    },
    next: "NEXT",
    allowAccess: "ALLOW ACCESS"
  },
  guide: {
    open: "Help",
    close: "Close help",
    done: "BACK TO THE SKY"
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
      LANDMARK: "HIGHLIGHTS",
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
