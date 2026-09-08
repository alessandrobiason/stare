import type { Strings } from "../types";

export const de: Strings = {
  intro: {
    what: {
      body:
        "Richte das Telefon zum Himmel. Die Satelliten, die über dich hinwegziehen, " +
        "werden genau dort ins Bild gezeichnet, wo sie wirklich stehen."
    },
    holding: {
      title: "Hochhalten, langsam drehen",
      body:
        "Jede Markierung ist ein Objekt: die Farbe sagt, wofür der Satellit da ist, die " +
        "Größe, wie weit er weg ist. Was hinter einem Haus oder einem Baum steht, wird " +
        "weggelassen statt darübergezeichnet."
    },
    screen: {
      title: "Was auf dem Bildschirm ist",
      body: "Vier Dinge liegen um den Himmel herum. Das sind alle.",
      count: {
        where: "Oben links",
        meaning:
          "Wie viele Satelliten gerade gezeichnet sind — nicht, wie viele es gibt. Was " +
          "unter dem Horizont oder hinter einem Haus steht, zählt nicht. Antippen " +
          "zeigt, welche es sind."
      },
      filter: {
        where: "Oben rechts",
        meaning:
          "Welche Arten gezeichnet werden, und die Farblegende — samt dem Ring für ein " +
          "über dem Äquator stehendes Objekt."
      },
      marker: {
        where: "Am Himmel",
        meaning:
          "Tippe eine Markierung an: was das Objekt ist, wer es betreibt, wie weit weg " +
          "es ist und wo du danach suchst."
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
    }
  },
  filter: {
    title: "FILTER",
    open: "Kategoriefilter",
    showAll: "ALLE ZEIGEN",
    ringKey: "RING = STEHT ÜBER DEM ÄQUATOR",
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
