import type { Strings } from "../types";

export const de: Strings = {
  intro: {
    what: {
      body:
        "Richte dein Handy auf den Himmel und bewege es langsam. Du siehst die Satelliten " +
        "über dir – genau dort, wo sie sind."
    },
    marks: {
      title: "Was du siehst",
      body: "Jeder Punkt ist ein Satellit. Tippe darauf, um zu sehen, was es ist.",
      moving: {
        name: "In Bewegung",
        meaning: "Der Schweif zeigt, woher er kommt. Je größer der Punkt, desto näher."
      },
      parked: {
        name: "Ring",
        meaning: "Steht immer an derselben Stelle am Himmel."
      },
      shadow: {
        name: "Blass",
        meaning: "Im Erdschatten, also nicht zu sehen."
      },
      landmark: {
        name: "Highlights",
        meaning: "Raumstationen und große Teleskope, mit Namen."
      },
      colors: "Die Farbe zeigt, wofür er da ist:"
    },
    paths: {
      title: "Wann und wohin schauen",
      body: "Raumstationen und Teleskope zeigen ihre Bahn schon, bevor sie auftauchen.",
      minutes: "Ein Pfeil pro Minute, in Flugrichtung.",
      time: "Der Name und die Uhrzeit, zu der er dort ist.",
      follow: "Folge der Linie, um zu sehen, wo er auftaucht.",
      footnote: "Tippe auf den Namen für mehr Infos."
    },
    passes: {
      title: "Demnächst",
      body: "Unten links steht, was als Nächstes über dich hinwegzieht.",
      shut: "Der nächste Überflug und wie lange es noch dauert.",
      open:
        "Tippe darauf für die nächsten Stunden: wohin du schauen musst, wie hoch er steigt " +
        "und ob er zu sehen ist.",
      footnote: "Kommt nichts, bleibt die Ecke leer."
    },
    corners: {
      title: "In den Ecken",
      body: "Vier weitere Dinge zum Antippen.",
      count: {
        where: "Oben links",
        meaning: "Wie viele Satelliten gerade zu sehen sind. Tippe, um zu sehen, welche."
      },
      filter: {
        where: "Oben rechts",
        meaning: "Wähle, welche Arten von Satelliten angezeigt werden."
      },
      guide: {
        where: "Unten rechts",
        meaning: "Zeigt diese Seiten wieder, wann immer du sie brauchst."
      },
      console: {
        where: "Unten rechts",
        meaning: "Technische Daten, auf Englisch. Brauchst du nicht."
      }
    },
    access: {
      title: "Zwei Berechtigungen",
      body: "Dein Handy fragt gleich danach.",
      camera: {
        name: "Kamera",
        reason: "Um den Himmel vor dir zu zeigen."
      },
      location: {
        name: "Standort",
        reason: "Um zu wissen, welche Satelliten über dir sind."
      },
      footnote: "Dein Standort bleibt auf deinem Handy."
    },
    next: "WEITER",
    allowAccess: "ZUGRIFF ERLAUBEN"
  },
  guide: {
    open: "Hilfe",
    close: "Hilfe schließen",
    done: "ZURÜCK ZUM HIMMEL"
  },
  scene: {
    visibleSatellites: "{count} sichtbare Satelliten",
    markers: "Satellitenmarkierungen",
    breakdown: {
      title: "IM BILD",
      empty: "Nichts im Bild",
      other: "Andere"
    },
    sunlight: {
      daylight: "Tageslicht — noch ist keiner davon zu sehen",
      none: "Alle stehen im Erdschatten",
      some: "{count} davon stehen im Sonnenlicht",
      all: "Alle stehen im Sonnenlicht"
    },
    passes: {
      title: "ALS NÄCHSTES",
      open: "Kommende Überflüge",
      now: "jetzt",
      seeing: {
        visible: "mit bloßem Auge sichtbar",
        binoculars: "nur mit Fernglas",
        tooFaint: "zu schwach",
        eclipsed: "im Erdschatten",
        daylight: "Tageslicht — nichts zu sehen",
        unknown: "Helligkeit nicht erfasst"
      }
    }
  },
  filter: {
    title: "FILTER",
    open: "Kategoriefilter",
    showAll: "ALLE ZEIGEN",
    ringKey: "RING = STEHT ÜBER DEM ÄQUATOR",
    shadowKey: "BLASS = IM ERDSCHATTEN",
    categories: {
      LANDMARK: "HIGHLIGHTS",
      NAVIGATION: "NAVIGATION",
      EARTH: "ERDBEOBACHTUNG",
      COMMS: "INTERNET & TV",
      OTHER: "ANDERE"
    }
  },
  card: {
    details: "Satellitendetails",
    close: "Details schließen",
    holdsStation: "STEHT STILL",
    openSite: "{site} öffnen",
    photo: "Foto von {name}",
    missing: "Dieser Satellit steht nicht mehr im Katalog.",
    seeing: {
      visible: "Hell genug, um es jetzt zu sehen",
      binoculars: "Im Sonnenlicht, aber ein Fernglas wäre nötig",
      tooFaint: "Im Sonnenlicht, aber viel zu schwach zum Sehen",
      eclipsed: "Im Erdschatten — kein Sonnenlicht, das es zurückwerfen könnte",
      daylight: "Hier steht die Sonne noch — im Orbit ist noch nichts zu sehen",
      unknown: "Im Sonnenlicht; wie hell es leuchtet, ist nicht verzeichnet",
      magnitude: "Magnitude {value}",
      aboutMagnitude: "Magnitude etwa {value}",
      onPass: "Beim Überflug um {time}: {verdict}"
    },
    facts: {
      distance: "Entfernung",
      altitude: "Höhe",
      speed: "Geschwindigkeit",
      look: "Blickrichtung",
      orbit: "Umlauf"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} Min.",
    hoursMinutes: "{hours} Std. {minutes} Min.",
    up: "{degrees}° hoch",
    below: "{degrees}° unter dem Horizont",
    unknown: "—"
  },
  compass: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
  compassNotice: {
    calibrate: {
      title: "Kompass muss kalibriert werden",
      detail:
        "Bewege das Telefon in einer Acht, weg von Magneten, Metall und anderen " +
        "Telefonen. Bis dahin können die Satelliten Dutzende Grad neben ihrer " +
        "gezeichneten Stelle stehen."
    },
    magnetic: {
      title: "Richtungen zeigen magnetisch Nord",
      detail:
        "Dieses Telefon meldet keinen Versatz zum geografischen Norden, also ist alles " +
        "um die örtliche Deklination verschoben — meist ein paar Grad."
    }
  },
  boot: {
    failed: "Start fehlgeschlagen",
    tryAgain: "NOCHMAL VERSUCHEN",
    unsupported: "Dieses Gerät kann die Himmelsansicht nicht anzeigen."
  },
  language: {
    title: "Sprache",
    close: "Sprachliste schließen"
  }
};
