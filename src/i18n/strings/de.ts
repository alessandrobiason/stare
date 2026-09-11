import type { Strings } from "../types";

export const de: Strings = {
  intro: {
    what: {
      body:
        "Richte das Telefon zum Himmel und dreh es langsam. Die Satelliten über dir " +
        "werden genau dort ins Bild gezeichnet, wo sie wirklich stehen — und " +
        "weggelassen, wo ein Haus oder ein Baum im Weg ist."
    },
    marks: {
      title: "Was die Markierungen sagen",
      body:
        "Jede Markierung ist ein Satellit, gezeichnet, wo er gerade steht. Tippe eine " +
        "an, um zu sehen, was es ist.",
      moving: {
        name: "In Bewegung",
        meaning: "Der Schweif zeigt, woher er kommt. Je näher, desto größer die Markierung."
      },
      parked: {
        name: "Steht still",
        meaning: "Ein Ring bewegt sich nie: er steht über dem Äquator."
      },
      shadow: {
        name: "Blass",
        meaning: "Im Erdschatten, dort gibt es also nichts zu sehen."
      },
      landmark: {
        name: "Highlights",
        meaning: "Die Raumstationen und großen Teleskope: mit Schein und Namen."
      },
      colors: "Die Farbe sagt, wofür der Satellit da ist:"
    },
    paths: {
      title: "Wo und wann hinsehen",
      body:
        "Die wenigen, für die man vor die Tür geht, tragen die Bahn, der sie am Himmel " +
        "folgen werden — schon bevor sie aufgehen.",
      minutes: "Eine Pfeilspitze je Minute, in die Richtung, in die er zieht.",
      time: "Der Name, und die Uhrzeit, zu der er an dieser Stelle ist.",
      follow:
        "Auch über Dächer und über den Bildschirmrand hinaus gezeichnet: folge ihr bis " +
        "dorthin, wo er aufgeht.",
      footnote: "Tippe auf den Namen, um alles darüber zu erfahren."
    },
    passes: {
      title: "Was als Nächstes kommt",
      body:
        "Meist stehen sie unter dem Horizont, darum behält die Ecke unten links die " +
        "nächsten im Blick.",
      shut: "Der nächste über dir, und wie lange es bis zum Aufgang dauert.",
      open:
        "Antippen zeigt die nächsten drei Stunden: wo jeder aufgeht, wie hoch er steigt " +
        "und ob du ihn sehen kannst. Tippe einen Überflug an für die Details.",
      footnote: "Kommt in den nächsten drei Stunden nichts, bleibt diese Ecke leer."
    },
    corners: {
      title: "Und in den Ecken",
      body: "Drei weitere Dinge liegen um den Himmel herum.",
      count: {
        where: "Oben links",
        meaning:
          "Wie viele Satelliten gerade gezeichnet sind — nicht, wie viele es gibt. " +
          "Antippen zeigt, welche es sind und wie viele in der Sonne stehen."
      },
      filter: {
        where: "Oben rechts",
        meaning: "Welche Arten gezeichnet werden, Starlink inklusive, und die Farblegende."
      },
      console: {
        where: "Unten rechts",
        meaning:
          "Die Sensorwerte hinter der Ansicht, falls etwas nicht stimmt. Nur auf " +
          "Englisch, und zum Benutzen nie nötig."
      }
    },
    access: {
      title: "Was sie braucht",
      body: "Zwei Dinge, und das Telefon fragt gleich nach beiden.",
      camera: {
        name: "Kamera",
        reason: "Der Himmel vor dir, und was ihm im Weg steht."
      },
      location: {
        name: "Standort",
        reason: "Welche Satelliten über dir sind, und wo am Himmel sie stehen."
      },
      footnote:
        "Wohin das Telefon zeigt, kommt aus seinen eigenen Bewegungssensoren, die es " +
        "ohne Nachfrage ausliest. Alles bleibt auf dem Telefon: Stare lädt einzig den " +
        "öffentlichen Satellitenkatalog, und dein Standort verlässt das Gerät nie."
    },
    next: "WEITER",
    allowAccess: "ZUGRIFF ERLAUBEN"
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
