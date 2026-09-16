import type { Strings } from "../types";

/**
 * English: the language the app is written in, and the one the Italian file
 * is a translation of.
 *
 * When a string here changes, the Italian one is stale until it changes too —
 * there is no marker for that beyond the diff, so do the two together.
 */
export const en: Strings = {
  intro: {
    what: {
      body: "Point your phone up at the sky and move it slowly — you'll see the satellites above you, exactly where they are."
    },
    access: {
      title: "Two quick permissions",
      body: "Your phone is about to ask for these.",
      camera: {
        name: "Camera",
        reason: "To show you the sky in front of you."
      },
      location: {
        name: "Location",
        reason: "To know which satellites are above you."
      },
      footnote: "Your location stays on your phone — it's never sent anywhere."
    },
    next: "NEXT",
    allowAccess: "ALLOW ACCESS"
  },
  tour: {
    open: "Help",
    about: "A quick tour of the screen.",
    step: "{step} of {count}",
    next: "Next",
    skip: "Skip",
    done: "Done",
    marks: {
      title: "On the sky",
      body: "Every mark is a satellite. Tap one to see what it is.",
      moving: {
        name: "Moving",
        meaning: "The tail shows where it came from. Bigger means closer."
      },
      parked: {
        name: "Ring",
        meaning: "Geostationary: it stays in the same spot."
      },
      landmark: {
        name: "Named",
        meaning: "Space stations and big telescopes. The dashed line shows where they'll pass."
      }
    },
    count: {
      title: "In view",
      body: "How many satellites are on screen. Tap to see which ones."
    },
    filter: {
      title: "Filter",
      body: "Choose which kinds of satellite to show."
    },
    freeze: {
      title: "Freeze",
      body: "Hold the view still, then lower the phone and tap the marks at ease."
    },
    passes: {
      title: "Coming up",
      body: "What will pass over you next. Tap to see the next few hours."
    },
    settings: {
      title: "Settings",
      body: "Change the language, or see this tour again."
    }
  },
  tabs: {
    sky: "Sky",
    catalog: "Catalog",
    settings: "Settings"
  },
  scene: {
    visibleSatellites: "{count} visible satellites",
    markers: "Satellite markers",
    breakdown: {
      title: "IN VIEW",
      empty: "Nothing in view",
      other: "Others"
    },
    notable: {
      NAVIGATION: "Navigation",
      EARTH: "Earth watch",
      INTERNET: "Internet",
      TELECOM: "TV & phones",
      OTHER: "Other"
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
    },
    compass: {
      facing: "Facing {point}"
    },
    freeze: {
      freeze: "Freeze the view",
      resume: "Resume the live view",
      frozenAt: "Frozen at {time}"
    }
  },
  filter: {
    title: "FILTER",
    open: "Category filter",
    showAll: "SHOW ALL",
    ringKey: "RING = PARKED OVER THE EQUATOR",
    categories: {
      LANDMARK: "HIGHLIGHTS",
      NAVIGATION: "NAVIGATION",
      EARTH: "EARTH WATCH",
      INTERNET: "INTERNET",
      TELECOM: "TV & PHONES",
      OTHER: "OTHER"
    },
    subcategories: {
      WEATHER: "WEATHER",
      IMAGING: "IMAGING & RADAR",
      STARLINK: "STARLINK",
      CONSTELLATIONS: "OTHER NETWORKS",
      BROADCAST: "TV & DATA",
      MOBILE: "PHONES & IOT"
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
  catalog: {
    soon:
      "Look up any object in the catalog, whether or not it is over you right now. Not built yet."
  },
  language: {
    title: "Language"
  },
  console: {
    detail: "Technical readings, in English only."
  }
};
