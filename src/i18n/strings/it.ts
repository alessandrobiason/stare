import type { Strings } from "../types";

export const it: Strings = {
  intro: {
    what: {
      body:
        "Punta il telefono verso il cielo e muovilo piano. Vedrai i satelliti sopra di te, " +
        "esattamente dove sono."
    },
    marks: {
      title: "Cosa vedi",
      body: "Ogni pallino è un satellite. Toccalo per sapere cos'è.",
      moving: {
        name: "In movimento",
        meaning: "La scia indica da dove arriva. Più il pallino è grande, più è vicino."
      },
      parked: {
        name: "Anello",
        meaning: "Resta sempre nello stesso punto del cielo."
      },
      shadow: {
        name: "Sbiadito",
        meaning: "È nell'ombra della Terra, quindi non si vede."
      },
      landmark: {
        name: "Importanti",
        meaning: "Stazioni spaziali e grandi telescopi, con il loro nome."
      },
      colors: "Il colore indica a cosa serve:"
    },
    paths: {
      title: "Dove e quando guardare",
      body: "Stazioni e telescopi mostrano il percorso che faranno, anche prima di comparire.",
      minutes: "Una freccia per ogni minuto, nella direzione in cui va.",
      time: "Il nome e l'ora in cui passerà di lì.",
      follow: "Segui la linea per trovare il punto in cui comparirà.",
      footnote: "Tocca il nome per saperne di più."
    },
    passes: {
      title: "In arrivo",
      body: "In basso a sinistra trovi cosa passerà sopra di te.",
      shut: "Il prossimo passaggio e tra quanto compare.",
      open: "Toccalo per vedere le prossime ore: dove guardare, quanto sale e se sarà visibile.",
      footnote: "Se non passa niente, l'angolo resta vuoto."
    },
    corners: {
      title: "Negli angoli",
      body: "Altre quattro cose che puoi toccare.",
      count: {
        where: "In alto a sinistra",
        meaning: "Quanti satelliti ci sono sullo schermo. Toccalo per vedere quali."
      },
      filter: {
        where: "In alto a destra",
        meaning: "Scegli quali tipi di satelliti mostrare."
      },
      guide: {
        where: "In basso a destra",
        meaning: "Mostra di nuovo queste pagine, quando ti servono."
      },
      console: {
        where: "In basso a destra",
        meaning: "Dati tecnici, in inglese. Non ti servono."
      }
    },
    access: {
      title: "Due permessi",
      body: "Tra poco il telefono te li chiederà.",
      camera: {
        name: "Fotocamera",
        reason: "Per mostrare il cielo davanti a te."
      },
      location: {
        name: "Posizione",
        reason: "Per sapere quali satelliti hai sopra di te."
      },
      footnote: "La tua posizione non esce mai dal telefono."
    },
    next: "AVANTI",
    allowAccess: "CONSENTI"
  },
  guide: {
    open: "Aiuto",
    close: "Chiudi l'aiuto",
    done: "TORNA AL CIELO"
  },
  scene: {
    visibleSatellites: "{count} satelliti visibili",
    markers: "Segni dei satelliti",
    breakdown: {
      title: "IN VISTA",
      empty: "Niente in vista",
      other: "Altri"
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
      COMMS: "INTERNET E TV",
      OTHER: "ALTRO"
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
  language: {
    title: "Lingua",
    close: "Chiudi l'elenco delle lingue"
  }
};
