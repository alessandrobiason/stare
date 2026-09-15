import type { Strings } from "../types";

export const it: Strings = {
  tour: {
    open: "Aiuto",
    about: "Una breve guida allo schermo.",
    step: "{step} di {count}",
    next: "Avanti",
    skip: "Salta",
    done: "Fatto",
    marks: {
      title: "Nel cielo",
      body: "Ogni segno è un satellite. Toccane uno per sapere cos'è.",
      moving: {
        name: "In movimento",
        meaning: "La scia indica da dove arriva. Più è grande, più è vicino."
      },
      parked: {
        name: "Anello",
        meaning: "Geostazionario: resta sempre nello stesso punto."
      },
      shadow: {
        name: "Sbiadito",
        meaning: "È nell'ombra della Terra, quindi non si vede."
      },
      landmark: {
        name: "Con nome",
        meaning: "Stazioni spaziali e grandi telescopi. La linea tratteggiata indica dove passeranno."
      }
    },
    count: {
      title: "In vista",
      body: "Quanti satelliti ci sono sullo schermo. Tocca per vedere quali."
    },
    filter: {
      title: "Filtro",
      body: "Scegli quali tipi di satellite mostrare."
    },
    freeze: {
      title: "Blocca",
      body: "Ferma la vista, poi abbassa il telefono e tocca i segni con calma."
    },
    passes: {
      title: "In arrivo",
      body: "Cosa passerà sopra di te a breve. Tocca per vedere le prossime ore."
    },
    settings: {
      title: "Impostazioni",
      body: "Cambia la lingua o rivedi questa guida."
    }
  },
  tabs: {
    sky: "Cielo",
    catalog: "Catalogo",
    settings: "Impostazioni"
  },
  scene: {
    visibleSatellites: "{count} satelliti visibili",
    markers: "Segni dei satelliti",
    breakdown: {
      title: "IN VISTA",
      empty: "Niente in vista",
      other: "Altri"
    },
    notable: {
      NAVIGATION: "Navigazione",
      EARTH: "Meteo e mappe",
      INTERNET: "Internet",
      TELECOM: "TV e telefonia",
      OTHER: "Altro"
    },
    sunlight: {
      daylight: "È giorno — nessuno di questi è ancora visibile",
      none: "Sono tutti nell'ombra della Terra",
      some: "{count} di questi sono illuminati dal Sole",
      all: "Sono tutti illuminati dal Sole"
    },
    passes: {
      title: "IN ARRIVO",
      open: "Prossimi passaggi",
      now: "ora",
      seeing: {
        visible: "visibile a occhio nudo",
        binoculars: "solo col binocolo",
        tooFaint: "troppo debole",
        eclipsed: "nell'ombra della Terra",
        daylight: "è giorno — niente da vedere",
        unknown: "luminosità non registrata"
      }
    },
    compass: {
      facing: "Direzione {point}"
    },
    freeze: {
      freeze: "Blocca la vista",
      resume: "Torna alla vista dal vivo",
      frozenAt: "Bloccata alle {time}"
    }
  },
  filter: {
    title: "FILTRO",
    open: "Filtro per categoria",
    showAll: "MOSTRA TUTTI",
    ringKey: "ANELLO = FERMO SULL'EQUATORE",
    shadowKey: "SBIADITO = NELL'OMBRA DELLA TERRA",
    categories: {
      LANDMARK: "IMPORTANTI",
      NAVIGATION: "NAVIGAZIONE",
      EARTH: "METEO E MAPPE",
      INTERNET: "INTERNET",
      TELECOM: "TV E TELEFONIA",
      OTHER: "ALTRO"
    },
    subcategories: {
      WEATHER: "METEO",
      IMAGING: "IMMAGINI E RADAR",
      STARLINK: "STARLINK",
      CONSTELLATIONS: "ALTRE COSTELLAZIONI",
      BROADCAST: "TV E DATI",
      MOBILE: "TELEFONI E IOT"
    }
  },
  card: {
    details: "Dettagli del satellite",
    close: "Chiudi i dettagli",
    holdsStation: "RESTA FERMO",
    openSite: "Apri {site}",
    photo: "Fotografia: {name}",
    missing: "Questo satellite non è più nel catalogo.",
    seeing: {
      visible: "Abbastanza luminoso da vedersi adesso",
      binoculars: "Illuminato dal Sole, ma servirebbe un binocolo",
      tooFaint: "Illuminato dal Sole, ma troppo debole per vederlo",
      eclipsed: "Nell'ombra della Terra: non c'è luce da riflettere",
      daylight: "Qui il Sole è ancora alto — non si vede ancora nulla in orbita",
      unknown: "Illuminato dal Sole, ma non è registrato quanto rifletta",
      magnitude: "magnitudine {value}",
      aboutMagnitude: "magnitudine circa {value}",
      onPass: "Quando passerà, alle {time}: {verdict}"
    },
    facts: {
      distance: "Distanza",
      altitude: "Quota",
      speed: "Velocità",
      look: "Direzione",
      orbit: "Orbita"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours}h {minutes}m",
    up: "{degrees}° sopra",
    below: "{degrees}° sotto",
    unknown: "—"
  },
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  compassNotice: {
    calibrate: {
      title: "La bussola va calibrata",
      detail:
        "Muovi il telefono a forma di otto, lontano da calamite, metallo e altri " +
        "telefoni. Fino ad allora i satelliti possono trovarsi decine di gradi lontano " +
        "da dove sono disegnati."
    },
    magnetic: {
      title: "Direzioni al nord magnetico",
      detail:
        "Questo telefono non ha comunicato lo scarto dal nord geografico, quindi tutto " +
        "è disegnato spostato della declinazione locale — pochi gradi quasi ovunque."
    }
  },
  boot: {
    failed: "Avvio non riuscito",
    tryAgain: "RIPROVA",
    unsupported: "Questo dispositivo non può mostrare la vista del cielo."
  },
  catalog: {
    soon:
      "Cerca qualsiasi oggetto del catalogo, anche quando non è sopra di te. Non c'è ancora."
  },
  language: {
    title: "Lingua"
  },
  console: {
    detail: "Dati tecnici, solo in inglese."
  }
};
