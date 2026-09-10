import type { Strings } from "../types";

export const nl: Strings = {
  intro: {
    what: {
      body:
        "Richt de telefoon op de hemel. De satellieten die over je heen trekken worden " +
        "in het beeld getekend, precies waar ze echt staan."
    },
    holding: {
      title: "Omhoog houden, langzaam draaien",
      body:
        "Elke stip is één object: de kleur zegt waar de satelliet voor dient, de grootte " +
        "hoe ver hij weg is. Wat achter een gebouw of een boom zit wordt weggelaten in " +
        "plaats van eroverheen getekend. De paar waarvoor je naar buiten loopt, dragen " +
        "ook de baan die ze zo gaan volgen: een pijlpunt per minuut, en de tijd waarop " +
        "ze opkomen als dat nog moet gebeuren."
    },
    screen: {
      title: "Wat er op het scherm staat",
      body: "Er staan vier dingen om de hemel heen. Dit zijn ze allemaal.",
      count: {
        where: "Linksboven",
        meaning:
          "Hoeveel satellieten er nu getekend zijn — niet hoeveel er zijn. Wat onder de " +
          "horizon of achter een gebouw zit, telt niet mee. Tik erop om te zien " +
          "welke."
      },
      filter: {
        where: "Rechtsboven",
        meaning:
          "Welke soorten getekend worden, en de kleurlegenda — met de ring voor een " +
          "object boven de evenaar."
      },
      marker: {
        where: "Op de hemel",
        meaning:
          "Tik op een stip: wat het object is, wie het vliegt, hoe ver weg het is en " +
          "waar je moet kijken."
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
      aboutMagnitude: "magnitude ongeveer {value}"
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
