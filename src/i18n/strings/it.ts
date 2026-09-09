import type { Strings } from "../types";

export const it: Strings = {
  intro: {
    what: {
      body:
        "Punta il telefono verso il cielo. I satelliti che ti passano sopra vengono " +
        "disegnati sull'immagine esattamente dove si trovano."
    },
    holding: {
      title: "Tienilo alzato, gira piano",
      body:
        "Ogni segno è un oggetto: il colore dice a cosa serve il satellite, la " +
        "dimensione quanto è lontano. Quello che finisce dietro un palazzo o un albero " +
        "viene tolto, non disegnato sopra. I pochi per cui vale la pena uscire portano " +
        "anche la linea che stanno per percorrere: una punta di freccia per ogni " +
        "minuto, e l'ora in cui sorgono se non sono ancora sorti."
    },
    screen: {
      title: "Cosa c'è sullo schermo",
      body: "Attorno al cielo ci sono quattro cose. Sono tutte qui.",
      count: {
        where: "In alto a sinistra",
        meaning:
          "Quanti satelliti sono disegnati in questo momento — non quanti ne esistono. " +
          "Quelli sotto l'orizzonte, o dietro un edificio, non contano. Toccalo per " +
          "vedere quali sono."
      },
      filter: {
        where: "In alto a destra",
        meaning:
          "Quali tipi disegnare, e la legenda dei colori — compreso l'anello che segna " +
          "un oggetto fermo sopra l'equatore."
      },
      marker: {
        where: "Sul cielo",
        meaning:
          "Tocca un segno qualsiasi: cos'è l'oggetto, chi lo gestisce, quanto è lontano " +
          "e dove cercarlo."
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
    }
  },
  filter: {
    title: "FILTRO",
    open: "Filtro per categoria",
    showAll: "MOSTRA TUTTI",
    ringKey: "ANELLO = FERMO SULL'EQUATORE",
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
