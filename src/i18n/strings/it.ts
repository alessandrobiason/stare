import type { Strings } from "../types";

export const it: Strings = {
  intro: {
    what: {
      body: "Punta il telefono verso il cielo e muovilo piano: vedrai i satelliti sopra di te, esattamente dove si trovano."
    },
    access: {
      title: "Tre permessi veloci",
      camera: {
        name: "Fotocamera",
        reason: "Per mostrarti il cielo che hai davanti."
      },
      location: {
        name: "Posizione",
        reason: "Per sapere quali satelliti hai sopra di te."
      },
      notifications: {
        name: "Notifiche — facoltativo",
        reason: "Per avvisarti quando sta per passare qualcosa che puoi vedere."
      },
      footnote: "La tua posizione non viene mai condivisa con altri."
    },
    next: "AVANTI",
    allowAccess: "CONSENTI"
  },
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
      longTail: {
        name: "Coda lunga",
        meaning: "Si muove veloce: di solito orbita bassa, circa 400–2.000 km di quota."
      },
      shortTail: {
        name: "Coda corta",
        meaning: "Si muove piano: di solito orbita media, circa 2.000–20.000 km di quota."
      },
      parked: {
        name: "Senza coda",
        meaning: "Resta fermo su un punto: molto lontano, circa 36.000 km di quota."
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
      body: "Cosa vedrai a occhio nudo: la linea tratteggiata mostra dove passerà. Tocca per la lista."
    },
    catalog: {
      title: "Catalogo",
      body: "Cerca un satellite per nome, anche sotto l'orizzonte, e scopri dove passerà."
    },
    settings: {
      title: "Impostazioni",
      body: "Qui trovi le impostazioni e le informazioni sull'app."
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
      none: "Sono tutti nel cono d'ombra della Terra",
      some: "{count} di questi sono illuminati dal Sole",
      all: "Sono tutti illuminati dal Sole"
    },
    passes: {
      title: "IN ARRIVO",
      open: "Prossimi passaggi",
      now: "ora",
      seeing: {
        visible: "visibile a occhio nudo",
        binoculars: "visible col binocolo",
        tooFaint: "non visible (troppo debole)",
        eclipsed: "non visibile (nel cono d'ombra della Terra)",
        daylight: "non visibile (è giorno)",
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
    photo: "Fotografia di {name}",
    missing: "Questo satellite non è più nel catalogo.",
    seeing: {
      visible: "Visibile a occhio nudo",
      binoculars: "Visibile con un binocolo",
      tooFaint: "Non visibile (troppo debole)",
      eclipsed: "Non visible (nel cono d'ombra della Terra)",
      daylight: "Non visible (è giorno)",
      unknown: "La sua luminosità non è registrata",
      magnitude: "magnitudine {value}",
      aboutMagnitude: "circa magnitudine {value}"
    },
    sighting: "Visibile a occhio nudo alle {time}",
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
      title: "Le direzioni indicano il nord magnetico",
      detail:
        "Questo telefono non indica lo scostamento dal nord geografico, quindi tutto " +
        "è disegnato spostato della declinazione locale — pochi gradi quasi ovunque."
    }
  },
  boot: {
    failed: "Avvio non riuscito",
    tryAgain: "RIPROVA",
    unsupported: "Questo dispositivo non può mostrare la vista del cielo."
  },
  catalog: {
    about: "Tutto ciò che è in orbita, anche se non è sopra di te. Toccane uno per metterlo sul cielo.",
    search: "Cerca per nome",
    objects: "{count} in orbita",
    above: "{count} di {total} sopra il tuo orizzonte",
    noneAbove: "Nessuno di questi è sopra il tuo orizzonte in questo momento.",
    highest: "Sono elencati i {count} più alti.",
    working: "Sto calcolando dove si trovano…",
    noMatch: "Nel catalogo non c'è niente con questo nome.",
    back: "Torna al catalogo"
  },
  language: {
    title: "Lingua"
  },
  console: {
    detail: "Dati tecnici."
  },
  alerts: {
    title: "Avvisi di passaggio",
    on: "Attivi",
    off: "Non attivi",
    granted:
      "Ti avvisiamo prima di un passaggio che puoi vedere. Tocca per cambiare nelle Impostazioni.",
    undetermined:
      "Ricevi una notifica prima di un passaggio che puoi vedere, anche ad app chiusa.",
    denied: "Le notifiche di Stare sono disattivate. Tocca per attivarle nelle Impostazioni.",
    notification: {
      title: "{name} passa tra {minutes} min"
    }
  },
  about: {
    title: "Informazioni",
    detail: "Autore, progetto e versione.",
    author: "Autore",
    project: "Progetto",
    version: "Versione"
  }
};
