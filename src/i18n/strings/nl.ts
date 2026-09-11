import type { Strings } from "../types";

export const nl: Strings = {
  intro: {
    what: {
      body:
        "Richt de telefoon op de hemel en draai langzaam. De satellieten die over je " +
        "heen trekken worden in het beeld getekend waar ze echt staan, en weggelaten " +
        "waar een gebouw of een boom in de weg staat."
    },
    marks: {
      title: "Wat de stippen zeggen",
      body:
        "Elke stip is één satelliet, getekend waar hij nu staat. Tik erop om te zien wat " +
        "het is.",
      moving: {
        name: "In beweging",
        meaning: "De staart is de weg die hij kwam. Hoe dichterbij, hoe groter de stip."
      },
      parked: {
        name: "Staat stil",
        meaning: "Een ring beweegt nooit: hij staat stil boven de evenaar."
      },
      shadow: {
        name: "Vaag",
        meaning: "In de schaduw van de aarde, dus er is niets te zien."
      },
      landmark: {
        name: "Hoogtepunten",
        meaning: "De ruimtestations en grote telescopen: met een gloed en een naam."
      },
      colors: "De kleur zegt waar hij voor dient:"
    },
    paths: {
      title: "Waar en wanneer kijken",
      body:
        "De paar waarvoor je naar buiten loopt, dragen de baan die ze aan de hemel gaan " +
        "volgen, nog voordat ze opkomen.",
      minutes: "Een pijlpunt per minuut, in de richting waarin hij gaat.",
      time: "Zijn naam, en de tijd waarop hij op dat punt is.",
      follow:
        "Ook over daken en voorbij de rand van het scherm getekend: volg hem tot waar hij " +
        "opkomt.",
      footnote: "Tik op de naam voor alles erover."
    },
    passes: {
      title: "Wat er aankomt",
      body:
        "Meestal staan ze onder de horizon, dus houdt de hoek linksonder de volgende in " +
        "de gaten.",
      shut: "De volgende boven je, en hoe lang het nog duurt voor hij opkomt.",
      open:
        "Tik erop voor de komende drie uur: waar elk opkomt, hoe hoog hij komt en of je " +
        "hem kunt zien. Tik op een passage voor de details.",
      footnote: "Komt er de komende drie uur niets, dan blijft die hoek leeg."
    },
    corners: {
      title: "En in de hoeken",
      body: "Er staan nog drie dingen om de hemel heen.",
      count: {
        where: "Linksboven",
        meaning:
          "Hoeveel satellieten er nu getekend zijn — niet hoeveel er zijn. Tik erop om te " +
          "zien welke, en hoeveel er in de zon staan."
      },
      filter: {
        where: "Rechtsboven",
        meaning: "Welke soorten getekend worden, Starlink inbegrepen, en de kleurlegenda."
      },
      console: {
        where: "Rechtsonder",
        meaning:
          "De sensormetingen achter het beeld, voor als er iets niet klopt. Alleen in " +
          "het Engels, en nooit nodig."
      }
    },
    access: {
      title: "Wat de app nodig heeft",
      body: "Twee dingen, en de telefoon vraagt zo meteen om allebei.",
      camera: {
        name: "Camera",
        reason: "De hemel voor je, en wat er in de weg staat."
      },
      location: {
        name: "Locatie",
        reason: "Welke satellieten boven je staan, en waar aan de hemel ze zitten."
      },
      footnote:
        "Waar de telefoon heen wijst komt uit zijn eigen bewegingssensoren, die hij " +
        "zonder vragen uitleest. Alles blijft op de telefoon: het enige dat Stare " +
        "ophaalt is de openbare satellietcatalogus, en je locatie verlaat het toestel " +
        "nooit."
    },
    next: "VERDER",
    allowAccess: "TOEGANG GEVEN"
  },
  scene: {
    visibleSatellites: "{count} zichtbare satellieten",
    markers: "Satellietmarkeringen",
    breakdown: {
      title: "IN BEELD",
      empty: "Niets in beeld",
      other: "Overige"
    },
    sunlight: {
      daylight: "Het is dag — nog geen ervan is te zien",
      none: "Ze staan allemaal in de schaduw van de aarde",
      some: "{count} hiervan staan in het zonlicht",
      all: "Ze staan allemaal in het zonlicht"
    },
    passes: {
      title: "OP KOMST",
      open: "Komende passages",
      now: "nu",
      seeing: {
        visible: "met het blote oog te zien",
        binoculars: "alleen met verrekijker",
        tooFaint: "te zwak",
        eclipsed: "in de schaduw van de aarde",
        daylight: "het is dag — niets te zien",
        unknown: "helderheid niet vastgelegd"
      }
    }
  },
  filter: {
    title: "FILTER",
    open: "Categoriefilter",
    showAll: "ALLES TONEN",
    ringKey: "RING = STAAT BOVEN DE EVENAAR",
    shadowKey: "VAAG = IN DE SCHADUW VAN DE AARDE",
    categories: {
      LANDMARK: "HOOGTEPUNTEN",
      NAVIGATION: "NAVIGATIE",
      EARTH: "AARDOBSERVATIE",
      COMMS: "INTERNET & TV",
      OTHER: "OVERIG"
    }
  },
  card: {
    details: "Satellietgegevens",
    close: "Gegevens sluiten",
    holdsStation: "STAAT STIL",
    openSite: "{site} openen",
    photo: "Foto van {name}",
    missing: "Deze satelliet staat niet meer in de catalogus.",
    seeing: {
      visible: "Helder genoeg om nu te zien",
      binoculars: "In het zonlicht, maar je hebt een verrekijker nodig",
      tooFaint: "In het zonlicht, maar veel te zwak om te zien",
      eclipsed: "In de schaduw van de aarde: geen zonlicht om te weerkaatsen",
      daylight: "Hier staat de zon nog — in een baan is nog niets te zien",
      unknown: "In het zonlicht, al is niet vastgelegd hoe helder het is",
      magnitude: "magnitude {value}",
      aboutMagnitude: "magnitude ongeveer {value}",
      onPass: "Bij de overkomst om {time}: {verdict}"
    },
    facts: {
      distance: "Afstand",
      altitude: "Hoogte",
      speed: "Snelheid",
      look: "Kijkrichting",
      orbit: "Omloop"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours} u {minutes} min",
    up: "{degrees}° hoog",
    below: "{degrees}° onder de horizon",
    unknown: "—"
  },
  compass: ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"],
  compassNotice: {
    calibrate: {
      title: "Kompas moet gekalibreerd worden",
      detail:
        "Beweeg de telefoon in een acht, weg van magneten, metaal en andere telefoons. " +
        "Tot die tijd kunnen de satellieten tientallen graden naast hun getekende plek " +
        "staan."
    },
    magnetic: {
      title: "Richtingen zijn magnetisch noord",
      detail:
        "Deze telefoon meldt geen afwijking naar het ware noorden, dus alles staat " +
        "verschoven over de plaatselijke declinatie — meestal een paar graden."
    }
  },
  boot: {
    failed: "Kon niet starten",
    tryAgain: "OPNIEUW",
    unsupported: "Dit toestel kan de hemelweergave niet draaien."
  },
  language: {
    title: "Taal",
    close: "Talenlijst sluiten"
  }
};
