import type { Strings } from "../types";

export const it: Strings = {
  intro: {
    what: {
      body:
        "Punta il telefono verso il cielo e giralo piano. I satelliti che ti passano " +
        "sopra vengono disegnati sull'immagine dove si trovano davvero, e tolti dove c'è " +
        "di mezzo un palazzo o un albero."
    },
    marks: {
      title: "Cosa dicono i segni",
      body:
        "Ogni segno è un satellite, disegnato dove si trova adesso. Toccane uno per " +
        "sapere cos'è.",
      moving: {
        name: "In movimento",
        meaning: "La scia è la strada appena fatta. Più è vicino, più il segno è grande."
      },
      parked: {
        name: "Fermo",
        meaning: "Un anello non si muove mai: resta fermo sopra l'equatore."
      },
      shadow: {
        name: "Sbiadito",
        meaning: "Nell'ombra della Terra, quindi lì non c'è niente da vedere."
      },
      landmark: {
        name: "Da non perdere",
        meaning: "Le stazioni spaziali e i grandi telescopi: con un alone e il nome."
      },
      colors: "Il colore dice a cosa serve:"
    },
    paths: {
      title: "Dove e quando guardare",
      body:
        "I pochi per cui vale la pena uscire portano la linea che seguiranno nel cielo, " +
        "anche prima di sorgere.",
      minutes: "Una punta di freccia per ogni minuto, nel verso in cui va.",
      time: "Il nome, e l'ora in cui sarà in quel punto.",
      follow:
        "Disegnata anche sopra i tetti e oltre il bordo dello schermo: seguila fino a " +
        "dove sorge.",
      footnote: "Tocca il nome per sapere tutto."
    },
    passes: {
      title: "Cosa sta per passare",
      body:
        "Quasi sempre sono sotto l'orizzonte, così l'angolo in basso a sinistra tiene " +
        "d'occhio i prossimi in arrivo.",
      shut: "Il prossimo sopra di te, e quanto manca al suo sorgere.",
      open:
        "Toccalo per le prossime tre ore: da dove sorge ciascuno, quanto sale e se si " +
        "potrà vedere. Tocca un passaggio per i dettagli.",
      footnote: "Se nelle prossime tre ore non passa niente, quell'angolo resta vuoto."
    },
    corners: {
      title: "E negli angoli",
      body: "Attorno al cielo ci sono altre tre cose.",
      count: {
        where: "In alto a sinistra",
        meaning:
          "Quanti satelliti sono disegnati adesso, non quanti ne esistono. Toccalo per " +
          "vedere quali sono e quanti sono illuminati dal sole."
      },
      filter: {
        where: "In alto a destra",
        meaning: "Quali tipi disegnare, Starlink compreso, e la legenda dei colori."
      },
      console: {
        where: "In basso a destra",
        meaning:
          "Le letture dei sensori dietro alla vista, per quando qualcosa non torna. " +
          "Solo in inglese, e mai necessarie per usare l'app."
      }
    },
    access: {
      title: "Cosa gli serve",
      body: "Due cose, e il telefono te le chiederà tra un istante.",
      camera: {
        name: "Fotocamera",
        reason: "Il cielo davanti a te, e quello che ci sta in mezzo."
      },
      location: {
        name: "Posizione",
        reason: "Quali satelliti hai sopra la testa, e in che punto del cielo stanno."
      },
      footnote:
        "La direzione in cui punti il telefono viene dai suoi sensori di movimento, che " +
        "legge senza chiedere. Tutto resta sul telefono: l'unica cosa che Stare scarica " +
        "è il catalogo pubblico dei satelliti, e la tua posizione non lascia mai il " +
        "dispositivo."
    },
    next: "AVANTI",
    allowAccess: "CONSENTI"
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
      LANDMARK: "DA NON PERDERE",
      NAVIGATION: "NAVIGAZIONE",
      EARTH: "OSSERVA LA TERRA",
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
