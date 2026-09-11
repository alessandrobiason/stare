import type { Strings } from "../types";

export const nl: Strings = {
  intro: {
    what: {
      body:
        "Richt je telefoon op de hemel en beweeg hem langzaam. Je ziet de satellieten boven " +
        "je, precies waar ze zijn."
    },
    marks: {
      title: "Wat je ziet",
      body: "Elke stip is een satelliet. Tik erop om te zien wat het is.",
      moving: {
        name: "In beweging",
        meaning: "Het staartje laat zien waar hij vandaan komt. Hoe groter de stip, hoe dichterbij."
      },
      parked: {
        name: "Ring",
        meaning: "Staat altijd op dezelfde plek aan de hemel."
      },
      shadow: {
        name: "Vaag",
        meaning: "In de schaduw van de aarde, dus niet te zien."
      },
      landmark: {
        name: "Hoogtepunten",
        meaning: "Ruimtestations en grote telescopen, met hun naam."
      },
      colors: "De kleur laat zien waarvoor hij dient:"
    },
    paths: {
      title: "Waar en wanneer kijken",
      body: "Ruimtestations en telescopen tonen hun route al voordat ze verschijnen.",
      minutes: "Eén pijl per minuut, in de richting waarin hij gaat.",
      time: "De naam en hoe laat hij daar is.",
      follow: "Volg de lijn om te zien waar hij verschijnt.",
      footnote: "Tik op de naam voor meer info."
    },
    passes: {
      title: "Binnenkort",
      body: "Linksonder zie je wat er straks over je heen komt.",
      shut: "De volgende en hoe lang het nog duurt.",
      open:
        "Tik erop voor de komende uren: waar je moet kijken, hoe hoog hij komt en of je hem " +
        "kunt zien.",
      footnote: "Komt er niets aan, dan blijft die hoek leeg."
    },
    corners: {
      title: "In de hoeken",
      body: "Nog vier dingen om op te tikken.",
      count: {
        where: "Linksboven",
        meaning: "Hoeveel satellieten er in beeld zijn. Tik om te zien welke."
      },
      filter: {
        where: "Rechtsboven",
        meaning: "Kies welke soorten satellieten je wilt zien."
      },
      guide: {
        where: "Rechtsonder",
        meaning: "Laat deze pagina's opnieuw zien wanneer je ze nodig hebt."
      },
      console: {
        where: "Rechtsonder",
        meaning: "Technische gegevens, in het Engels. Heb je niet nodig."
      }
    },
    access: {
      title: "Twee toestemmingen",
      body: "Je telefoon vraagt er zo om.",
      camera: {
        name: "Camera",
        reason: "Om de hemel voor je te laten zien."
      },
      location: {
        name: "Locatie",
        reason: "Om te weten welke satellieten boven je zijn."
      },
      footnote: "Je locatie verlaat je telefoon nooit."
    },
    next: "VERDER",
    allowAccess: "TOEGANG GEVEN"
  },
  guide: {
    open: "Help",
    close: "Help sluiten",
    done: "TERUG NAAR DE HEMEL"
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
