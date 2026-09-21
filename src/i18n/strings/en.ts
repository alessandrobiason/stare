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
      body: "Welcome to Stare! Point your phone up at the sky — you'll see the satellites above you, exactly where they are."
    },
    access: {
      title: "Three quick permissions",
      camera: {
        name: "Camera",
        reason: "To show you the sky in front of you."
      },
      location: {
        name: "Location",
        reason: "To know which satellites are above you."
      },
      notifications: {
        name: "Notifications — optional",
        reason: "To tell you when something you can see is about to pass over."
      },
      footnote: "Your location is never shared with others."
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
      longTail: {
        name: "Long tail",
        meaning: "Moving fast: usually a low orbit, roughly 400–2,000 km up."
      },
      shortTail: {
        name: "Short tail",
        meaning: "Moving slowly: usually a medium orbit, roughly 2,000–20,000 km up."
      },
      parked: {
        name: "No tail",
        meaning: "Holds still over one spot: very far out, around 36,000 km up."
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
      body: "Hold the view still, then lower the phone and tap the marks at your own pace."
    },
    passes: {
      title: "Coming up",
      body: "What you can see with the naked eye; the dashed line is its path. Tap for the list."
    },
    catalog: {
      title: "Catalog",
      body: "Find any satellite by name, even below the horizon, and see where it will pass."
    },
    settings: {
      title: "Settings",
      body: "Settings and information about the app are all in here."
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
        tooFar: "not visible (too far away)",
        visible: "visible to the eye",
        binoculars: "visible with binoculars",
        tooFaint: "not visible (too faint)",
        eclipsed: "not visible (in the Earth's shadow)",
        daylight: "not visible (daylight)",
        unknown: "brightness not recorded"
      }
    },
    findIt: {
      title: "LOOK FOR IT IN THE SKY",
      aim: "Point the phone {direction}",
      notRisenYet:
        "It hasn't risen yet, but its path is already drawn on the sky — raise the phone and follow the line to find it"
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
    more: "Scroll for more",
    seeing: {
      tooFar: "Not visible — too far away to see",
      visible: "Visible to the eye",
      binoculars: "Visible with binoculars",
      tooFaint: "Not visible (too faint)",
      eclipsed: "Not visible (in the Earth's shadow)",
      daylight: "Not visible (daylight)",
      unknown: "Brightness not recorded",
      magnitude: "magnitude {value}",
      aboutMagnitude: "around magnitude {value}"
    },
    sighting: "Visible to the eye at {time}",
    map: {
      label: "Ground track of {name}",
      title: "GROUND TRACK",
      footprint: "Inside the circle it is above the horizon",
      at: "at {time}"
    },
    facts: {
      distance: "Distance",
      altitude: "Altitude",
      speed: "Speed",
      look: "Look",
      orbit: "Orbit",
      launched: "Launched"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours}h {minutes}m",
    inTime: "in {time}",
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
      title: "Headings point to magnetic north",
      detail:
        "This phone has not reported a true-north offset, so everything is shown shifted " +
        "by the local declination — a few degrees in most places."
    }
  },
  boot: {
    failed: "Could not start",
    tryAgain: "TRY AGAIN",
    unsupported: "This device cannot run the sky view.",
    activity: {
      downloading: "Downloading the sky detection model",
      size: "{done} of {total} MB",
      preparing: "Preparing the sky detection model",
      kept: "It stays on the device afterwards."
    },
    openSettings: "OPEN SETTINGS",
    errors: {
      cameraRefused:
        "Stare needs the camera: it is the sky you see behind the marks, and it is how the app works out what is a building and what is open sky. Turn Camera on for Stare in Settings, then come back.",
      cameraBlocked:
        "Camera access is off for Stare. Turn it on in Settings — the camera is the sky behind the marks, and how the app tells a rooftop from open sky.",
      cameraFailed: "The camera could not be opened.",
      locationRefused:
        "Stare needs to know roughly where you are: a satellite is in a different part of the sky from one town to the next. Turn Location on for Stare in Settings, then come back.",
      locationOff:
        "Location services are switched off on this phone, so there is nowhere to place the satellites. Turn them on in Settings, then come back.",
      locationUnavailable:
        "Your location could not be found. Somewhere with a clearer view of the sky usually fixes it — indoors, the first fix can take a while.",
      noMotionSensor:
        "This device has no motion sensor, so there is no attitude to aim the view with.",
      noMagnetometer:
        "This device has no magnetometer, so a heading cannot be referenced to north.",
      sensorsUnknown: "The device's sensors could not be checked.",
      catalogOffline:
        "No satellite catalogue could be downloaded, and none is cached on this device. Stare gets orbital data from CelesTrak, a public satellite-tracking service — check your connection and try again in a few minutes.",
      catalogEmpty: "The satellite catalogue downloaded but held no usable orbits.",
      catalogFailed: "The satellite catalogue could not be loaded.",
      skyModelFailed:
        "The sky detection model could not be loaded, so nothing could be hidden behind terrain.",
      unknown: "Something went wrong during start-up."
    }
  },
  catalog: {
    about: "Everything in orbit, whether or not it is over you. Pick one to put it on the sky.",
    search: "Search by name",
    objects: "{count} in orbit",
    above: "{count} of {total} above your horizon",
    noneAbove: "None of these is above your horizon right now.",
    highest: "The {count} highest are listed.",
    working: "Working out where these are…",
    noMatch: "Nothing in the catalog is called that.",
    back: "Back to the catalog"
  },
  language: {
    title: "Language"
  },
  console: {
    detail: "Technical readings."
  },
  alerts: {
    title: "Pass alerts",
    on: "On",
    off: "Off",
    granted: "You'll be told before a pass you can see. Tap to change it in Settings.",
    undetermined:
      "Get a notification before a pass you can see, even with the app closed.",
    denied: "Notifications are off for Stare. Tap to turn them on in Settings.",
    notification: {
      title: "{name} passes over in {minutes} min"
    }
  },
  about: {
    title: "About",
    detail: "Author, project, credits and version.",
    author: "Author",
    project: "Project",
    model: "Sky detection",
    modelLicence: "SegFormer model by Realcat, used under the MIT licence.",
    version: "Version"
  }
};
