import type { Strings } from "../types";

export const es: Strings = {
  intro: {
    what: {
      body:
        "Apunta el teléfono al cielo y gira despacio. Los satélites que pasan sobre ti " +
        "se dibujan en la imagen justo donde están, y se omiten donde un edificio o un " +
        "árbol se interpone."
    },
    marks: {
      title: "Qué dicen las marcas",
      body:
        "Cada marca es un satélite, dibujado donde está ahora mismo. Toca una para saber " +
        "qué es.",
      moving: {
        name: "En movimiento",
        meaning: "La cola es el camino que trae. Cuanto más cerca, más grande la marca."
      },
      parked: {
        name: "Fijo",
        meaning: "Un anillo nunca se mueve: está fijo sobre el ecuador."
      },
      shadow: {
        name: "Tenue",
        meaning: "En la sombra de la Tierra, así que ahí no hay nada que ver."
      },
      landmark: {
        name: "Imprescindibles",
        meaning: "Las estaciones espaciales y los grandes telescopios: con halo y nombre."
      },
      colors: "El color dice para qué sirve:"
    },
    paths: {
      title: "Dónde y cuándo mirar",
      body:
        "Los pocos por los que merece la pena salir llevan la línea que seguirán por el " +
        "cielo, incluso antes de salir.",
      minutes: "Una punta de flecha por cada minuto, en el sentido en que avanza.",
      time: "Su nombre, y la hora a la que estará en ese punto.",
      follow:
        "Se dibuja también sobre los tejados y más allá del borde de la pantalla: síguela " +
        "hasta donde sale.",
      footnote: "Toca el nombre para saberlo todo de él."
    },
    passes: {
      title: "Qué está por pasar",
      body:
        "Casi siempre están bajo el horizonte, así que la esquina inferior izquierda " +
        "vigila los próximos.",
      shut: "El próximo sobre ti, y cuánto falta para que salga.",
      open:
        "Tócala para ver las próximas tres horas: por dónde sale cada uno, cuánto sube y " +
        "si se podrá ver. Toca un pase para ver sus detalles.",
      footnote: "Si no pasa nada en las próximas tres horas, esa esquina queda vacía."
    },
    corners: {
      title: "Y en las esquinas",
      body: "Alrededor del cielo hay tres cosas más.",
      count: {
        where: "Arriba a la izquierda",
        meaning:
          "Cuántos satélites se dibujan ahora mismo, no cuántos existen. Tócalo para ver " +
          "cuáles son y cuántos están al sol."
      },
      filter: {
        where: "Arriba a la derecha",
        meaning: "Qué tipos dibujar, Starlink incluido, y la clave de los colores."
      },
      console: {
        where: "Abajo a la derecha",
        meaning:
          "Las lecturas de los sensores que hay detrás de la vista, por si algo no " +
          "cuadra. Solo en inglés, y nunca hacen falta para usar la app."
      }
    },
    access: {
      title: "Qué necesita",
      body: "Dos cosas, y el teléfono te preguntará por cada una en un momento.",
      camera: {
        name: "Cámara",
        reason: "El cielo que tienes delante, y lo que se interpone en él."
      },
      location: {
        name: "Ubicación",
        reason: "Qué satélites tienes encima, y en qué punto del cielo están."
      },
      footnote:
        "Hacia dónde apunta el teléfono lo dicen sus propios sensores de movimiento, que " +
        "lee sin pedir permiso. Todo se usa solo en el teléfono: lo único que Stare " +
        "descarga es el catálogo público de satélites, y tu ubicación nunca sale del " +
        "dispositivo."
    },
    next: "SIGUIENTE",
    allowAccess: "PERMITIR"
  },
  scene: {
    visibleSatellites: "{count} satélites visibles",
    markers: "Marcas de satélites",
    breakdown: {
      title: "A LA VISTA",
      empty: "Nada a la vista",
      other: "Otros"
    },
    sunlight: {
      daylight: "Es de día — todavía no se ve ninguno",
      none: "Todos están en la sombra de la Tierra",
      some: "{count} de ellos están iluminados por el Sol",
      all: "Todos están iluminados por el Sol"
    },
    passes: {
      title: "PRÓXIMOS",
      open: "Próximos pases",
      now: "ahora",
      seeing: {
        visible: "visible a simple vista",
        binoculars: "solo con prismáticos",
        tooFaint: "demasiado débil",
        eclipsed: "en la sombra de la Tierra",
        daylight: "es de día — nada que ver",
        unknown: "brillo no registrado"
      }
    }
  },
  filter: {
    title: "FILTRO",
    open: "Filtro por categoría",
    showAll: "MOSTRAR TODO",
    ringKey: "ANILLO = FIJO SOBRE EL ECUADOR",
    shadowKey: "TENUE = EN LA SOMBRA DE LA TIERRA",
    categories: {
      LANDMARK: "IMPRESCINDIBLES",
      NAVIGATION: "NAVEGACIÓN",
      EARTH: "OBSERVAN LA TIERRA",
      COMMS: "INTERNET Y TV",
      OTHER: "OTROS"
    }
  },
  card: {
    details: "Detalles del satélite",
    close: "Cerrar los detalles",
    holdsStation: "SE MANTIENE FIJO",
    openSite: "Abrir {site}",
    photo: "Fotografía: {name}",
    missing: "Este satélite ya no está en el catálogo.",
    seeing: {
      visible: "Lo bastante brillante para verlo ahora",
      binoculars: "Iluminado por el Sol, pero harían falta prismáticos",
      tooFaint: "Iluminado por el Sol, pero demasiado débil para verlo",
      eclipsed: "En la sombra de la Tierra: no hay luz que reflejar",
      daylight: "Aquí el Sol sigue alto — todavía no se ve nada en órbita",
      unknown: "Iluminado por el Sol, aunque no está registrado cuánto refleja",
      magnitude: "magnitud {value}",
      aboutMagnitude: "magnitud en torno a {value}",
      onPass: "Cuando pase, a las {time}: {verdict}"
    },
    facts: {
      distance: "Distancia",
      altitude: "Altitud",
      speed: "Velocidad",
      look: "Mirar hacia",
      orbit: "Órbita"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours} h {minutes} min",
    up: "{degrees}° arriba",
    below: "{degrees}° abajo",
    unknown: "—"
  },
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  compassNotice: {
    calibrate: {
      title: "Hay que calibrar la brújula",
      detail:
        "Mueve el teléfono dibujando un ocho, lejos de imanes, metal y otros teléfonos. " +
        "Hasta entonces los satélites pueden estar a decenas de grados de donde se " +
        "dibujan."
    },
    magnetic: {
      title: "Rumbos al norte magnético",
      detail:
        "Este teléfono no ha informado del desvío al norte geográfico, así que todo se " +
        "dibuja corrido por la declinación local: unos pocos grados en casi todas partes."
    }
  },
  boot: {
    failed: "No se ha podido iniciar",
    tryAgain: "REINTENTAR",
    unsupported: "Este dispositivo no puede mostrar la vista del cielo."
  },
  language: {
    title: "Idioma",
    close: "Cerrar la lista de idiomas"
  }
};
