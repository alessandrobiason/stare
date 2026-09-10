import type { Strings } from "../types";

export const fr: Strings = {
  intro: {
    what: {
      body:
        "Pointez le téléphone vers le ciel. Les satellites qui passent au-dessus de vous " +
        "sont dessinés sur l'image, là où ils se trouvent vraiment."
    },
    holding: {
      title: "Levez-le, tournez lentement",
      body:
        "Chaque marque est un objet : sa couleur dit à quoi sert le satellite, sa taille " +
        "à quelle distance il est. Ce qui passe derrière un immeuble ou un arbre est " +
        "retiré plutôt que dessiné par-dessus. Les quelques-uns qui valent la peine de " +
        "sortir portent aussi la trajectoire qu'ils vont suivre : une pointe de flèche " +
        "par minute, et l'heure de leur lever s'ils ne sont pas encore levés."
    },
    screen: {
      title: "Ce qu'il y a à l'écran",
      body: "Cinq éléments entourent le ciel. Ces trois-là disent ce qu'il y a là-haut.",
      count: {
        where: "En haut à gauche",
        meaning:
          "Combien de satellites sont dessinés en ce moment — pas combien il en existe. " +
          "Ce qui est sous l'horizon ou derrière un mur ne compte pas. Touchez-le pour " +
          "voir lesquels."
      },
      passes: {
        where: "En bas à gauche",
        meaning:
          "Le prochain repère à passer au-dessus de vous, et le temps qu'il reste avant " +
          "son lever. Touchez-le pour les autres et pour savoir où vous placer."
      },
      marker: {
        where: "Sur le ciel",
        meaning:
          "Touchez n'importe quelle marque : ce qu'est l'objet, qui l'exploite, à quelle " +
          "distance il est et où le chercher."
      }
    },
    controls: {
      title: "Et deux autres",
      body: "L'un décide de ce qui est dessiné. L'autre sert quand quelque chose cloche.",
      filter: {
        where: "En haut à droite",
        meaning:
          "Quels types dessiner, et la légende des couleurs — dont l'anneau qui signale " +
          "un objet fixe au-dessus de l'équateur."
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
