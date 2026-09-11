import type { Strings } from "../types";

export const fr: Strings = {
  intro: {
    what: {
      body:
        "Pointez votre téléphone vers le ciel et bougez-le lentement. Vous verrez les " +
        "satellites au-dessus de vous, là où ils sont."
    },
    marks: {
      title: "Ce que vous voyez",
      body: "Chaque point est un satellite. Touchez-le pour savoir ce que c'est.",
      moving: {
        name: "En mouvement",
        meaning: "La traînée montre d'où il vient. Plus le point est gros, plus il est proche."
      },
      parked: {
        name: "Anneau",
        meaning: "Toujours au même endroit dans le ciel."
      },
      shadow: {
        name: "Pâle",
        meaning: "Dans l'ombre de la Terre : on ne peut pas le voir."
      },
      landmark: {
        name: "Les plus connus",
        meaning: "Stations spatiales et grands télescopes, avec leur nom."
      },
      colors: "La couleur indique à quoi il sert :"
    },
    paths: {
      title: "Où et quand regarder",
      body:
        "Les stations et les télescopes affichent le trajet qu'ils vont suivre, avant même " +
        "d'apparaître.",
      minutes: "Une flèche par minute, dans le sens où il avance.",
      time: "Son nom et l'heure à laquelle il passera là.",
      follow: "Suivez la ligne pour savoir où il apparaîtra.",
      footnote: "Touchez le nom pour en savoir plus."
    },
    passes: {
      title: "Bientôt",
      body: "En bas à gauche, vous voyez ce qui va passer au-dessus de vous.",
      shut: "Le prochain passage, et dans combien de temps.",
      open:
        "Touchez-le pour voir les prochaines heures : où regarder, jusqu'où il monte et " +
        "s'il sera visible.",
      footnote: "Si rien n'arrive, ce coin reste vide."
    },
    corners: {
      title: "Dans les coins",
      body: "Quatre autres éléments à toucher.",
      count: {
        where: "En haut à gauche",
        meaning: "Le nombre de satellites à l'écran. Touchez pour voir lesquels."
      },
      filter: {
        where: "En haut à droite",
        meaning: "Choisissez les types de satellites à afficher."
      },
      guide: {
        where: "En bas à droite",
        meaning: "Réaffiche ces pages quand vous en avez besoin."
      },
      console: {
        where: "En bas à droite",
        meaning: "Données techniques, en anglais. Vous n'en aurez pas besoin."
      }
    },
    access: {
      title: "Deux autorisations",
      body: "Votre téléphone va vous les demander.",
      camera: {
        name: "Appareil photo",
        reason: "Pour afficher le ciel devant vous."
      },
      location: {
        name: "Localisation",
        reason: "Pour savoir quels satellites sont au-dessus de vous."
      },
      footnote: "Votre position ne quitte jamais le téléphone."
    },
    next: "SUIVANT",
    allowAccess: "AUTORISER"
  },
  guide: {
    open: "Aide",
    close: "Fermer l'aide",
    done: "RETOUR AU CIEL"
  },
  scene: {
    visibleSatellites: "{count} satellites visibles",
    markers: "Marques des satellites",
    breakdown: {
      title: "EN VUE",
      empty: "Rien en vue",
      other: "Autres"
    },
    sunlight: {
      daylight: "Il fait jour — aucun n'est encore visible",
      none: "Tous sont dans l'ombre de la Terre",
      some: "{count} d'entre eux sont éclairés par le Soleil",
      all: "Tous sont éclairés par le Soleil"
    },
    passes: {
      title: "À VENIR",
      open: "Prochains passages",
      now: "maintenant",
      seeing: {
        visible: "visible à l'œil nu",
        binoculars: "jumelles nécessaires",
        tooFaint: "trop faible",
        eclipsed: "dans l'ombre de la Terre",
        daylight: "il fait jour — rien à voir",
        unknown: "éclat non répertorié"
      }
    }
  },
  filter: {
    title: "FILTRE",
    open: "Filtre par catégorie",
    showAll: "TOUT AFFICHER",
    ringKey: "ANNEAU = FIXE AU-DESSUS DE L'ÉQUATEUR",
    shadowKey: "PÂLE = DANS L'OMBRE DE LA TERRE",
    categories: {
      LANDMARK: "LES PLUS CONNUS",
      NAVIGATION: "NAVIGATION",
      EARTH: "OBSERVATION TERRE",
      COMMS: "INTERNET ET TV",
      OTHER: "AUTRES"
    }
  },
  card: {
    details: "Détails du satellite",
    close: "Fermer les détails",
    holdsStation: "RESTE FIXE",
    openSite: "Ouvrir {site}",
    photo: "Photographie : {name}",
    missing: "Ce satellite ne figure plus au catalogue.",
    seeing: {
      visible: "Assez brillant pour être vu maintenant",
      binoculars: "Au soleil, mais il faudrait des jumelles",
      tooFaint: "Au soleil, mais bien trop faible pour être vu",
      eclipsed: "Dans l'ombre de la Terre : aucune lumière à réfléchir",
      daylight: "Ici le Soleil est encore levé — rien en orbite n'est encore visible",
      unknown: "Au soleil, mais sa brillance n'est pas répertoriée",
      magnitude: "magnitude {value}",
      aboutMagnitude: "magnitude {value} environ",
      onPass: "À son passage, à {time} : {verdict}"
    },
    facts: {
      distance: "Distance",
      altitude: "Altitude",
      speed: "Vitesse",
      look: "Direction",
      orbit: "Orbite"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours} h {minutes} min",
    up: "{degrees}° au-dessus",
    below: "{degrees}° sous l'horizon",
    unknown: "—"
  },
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  compassNotice: {
    calibrate: {
      title: "La boussole doit être calibrée",
      detail:
        "Faites un huit avec le téléphone, loin des aimants, du métal et des autres " +
        "téléphones. D'ici là les satellites peuvent être à des dizaines de degrés de " +
        "l'endroit où ils sont dessinés."
    },
    magnetic: {
      title: "Caps donnés au nord magnétique",
      detail:
        "Ce téléphone n'a pas indiqué l'écart au nord géographique : tout est donc " +
        "décalé de la déclinaison locale, quelques degrés dans la plupart des endroits."
    }
  },
  boot: {
    failed: "Démarrage impossible",
    tryAgain: "RÉESSAYER",
    unsupported: "Cet appareil ne peut pas afficher la vue du ciel."
  },
  language: {
    title: "Langue",
    close: "Fermer la liste des langues"
  }
};
