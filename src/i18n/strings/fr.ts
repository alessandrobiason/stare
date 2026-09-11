import type { Strings } from "../types";

export const fr: Strings = {
  intro: {
    what: {
      body:
        "Pointez le téléphone vers le ciel et tournez lentement. Les satellites qui " +
        "passent au-dessus de vous sont dessinés sur l'image là où ils se trouvent " +
        "vraiment, et retirés là où un immeuble ou un arbre les cache."
    },
    marks: {
      title: "Ce que disent les marques",
      body:
        "Chaque marque est un satellite, dessiné là où il est en ce moment. Touchez-en " +
        "une pour savoir ce que c'est.",
      moving: {
        name: "En mouvement",
        meaning: "La traîne est le chemin parcouru. Plus il est proche, plus la marque est grande."
      },
      parked: {
        name: "Fixe",
        meaning: "Un anneau ne bouge jamais : il reste fixe au-dessus de l'équateur."
      },
      shadow: {
        name: "Pâle",
        meaning: "Dans l'ombre de la Terre : il n'y a rien à voir."
      },
      landmark: {
        name: "À ne pas manquer",
        meaning: "Les stations spatiales et les grands télescopes : avec un halo et leur nom."
      },
      colors: "La couleur dit à quoi il sert :"
    },
    paths: {
      title: "Où et quand regarder",
      body:
        "Les quelques-uns qui valent la peine de sortir portent la trajectoire qu'ils " +
        "vont suivre dans le ciel, avant même de se lever.",
      minutes: "Une pointe de flèche par minute, dans le sens où il avance.",
      time: "Son nom, et l'heure à laquelle il sera à cet endroit.",
      follow:
        "Tracée aussi par-dessus les toits et au-delà du bord de l'écran : suivez-la " +
        "jusqu'à son lever.",
      footnote: "Touchez le nom pour tout savoir sur lui."
    },
    passes: {
      title: "Ce qui va passer",
      body:
        "Ils sont presque toujours sous l'horizon, alors le coin en bas à gauche garde " +
        "l'œil sur les prochains.",
      shut: "Le prochain au-dessus de vous, et le temps qu'il reste avant son lever.",
      open:
        "Touchez-le pour les trois prochaines heures : où chacun se lève, à quelle " +
        "hauteur il monte et s'il sera visible. Touchez un passage pour ses détails.",
      footnote: "Si rien ne passe dans les trois prochaines heures, ce coin reste vide."
    },
    corners: {
      title: "Et dans les coins",
      body: "Trois autres éléments entourent le ciel.",
      count: {
        where: "En haut à gauche",
        meaning:
          "Combien de satellites sont dessinés en ce moment — pas combien il en existe. " +
          "Touchez-le pour voir lesquels, et combien sont au soleil."
      },
      filter: {
        where: "En haut à droite",
        meaning: "Quels types dessiner, Starlink compris, et la légende des couleurs."
      },
      console: {
        where: "En bas à droite",
        meaning:
          "Les mesures des capteurs derrière la vue, si quelque chose cloche. En anglais " +
          "seulement, et jamais nécessaires pour s'en servir."
      }
    },
    access: {
      title: "Ce dont elle a besoin",
      body: "Deux choses, et le téléphone va vous les demander dans un instant.",
      camera: {
        name: "Appareil photo",
        reason: "Le ciel devant vous, et ce qui vient s'y interposer."
      },
      location: {
        name: "Localisation",
        reason: "Quels satellites sont au-dessus de vous, et où ils se trouvent dans le ciel."
      },
      footnote:
        "L'orientation du téléphone vient de ses propres capteurs de mouvement, qu'il lit " +
        "sans rien demander. Tout est utilisé sur le téléphone seul : la seule chose que " +
        "Stare télécharge est le catalogue public des satellites, et votre position ne " +
        "quitte jamais l'appareil."
    },
    next: "SUIVANT",
    allowAccess: "AUTORISER"
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
      LANDMARK: "À NE PAS MANQUER",
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
