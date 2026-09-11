import type { Strings } from "../types";

export const es: Strings = {
  intro: {
    what: {
      body:
        "Apunta el teléfono al cielo y muévelo despacio. Verás los satélites que tienes " +
        "encima, justo donde están."
    },
    marks: {
      title: "Qué ves",
      body: "Cada punto es un satélite. Tócalo para saber qué es.",
      moving: {
        name: "En movimiento",
        meaning: "La estela indica de dónde viene. Cuanto más grande, más cerca está."
      },
      parked: {
        name: "Anillo",
        meaning: "Siempre está en el mismo punto del cielo."
      },
      shadow: {
        name: "Tenue",
        meaning: "Está en la sombra de la Tierra, así que no se ve."
      },
      landmark: {
        name: "Destacados",
        meaning: "Estaciones espaciales y grandes telescopios, con su nombre."
      },
      colors: "El color indica para qué sirve:"
    },
    paths: {
      title: "Dónde y cuándo mirar",
      body:
        "Las estaciones y los telescopios muestran el recorrido que harán, incluso antes " +
        "de aparecer.",
      minutes: "Una flecha por minuto, en la dirección en la que va.",
      time: "Su nombre y la hora a la que pasará por ahí.",
      follow: "Sigue la línea para ver por dónde aparecerá.",
      footnote: "Toca el nombre para saber más."
    },
    passes: {
      title: "Próximos pases",
      body: "Abajo a la izquierda verás qué pasará sobre ti.",
      shut: "El siguiente y cuánto falta para que aparezca.",
      open: "Tócalo para ver las próximas horas: dónde mirar, cuánto sube y si se podrá ver.",
      footnote: "Si no viene nada, esa esquina queda vacía."
    },
    corners: {
      title: "En las esquinas",
      body: "Cuatro cosas más que puedes tocar.",
      count: {
        where: "Arriba a la izquierda",
        meaning: "Cuántos satélites hay en pantalla. Tócalo para ver cuáles."
      },
      filter: {
        where: "Arriba a la derecha",
        meaning: "Elige qué tipos de satélites mostrar."
      },
      guide: {
        where: "Abajo a la derecha",
        meaning: "Vuelve a mostrar estas páginas cuando las necesites."
      },
      console: {
        where: "Abajo a la derecha",
        meaning: "Datos técnicos, en inglés. No los necesitas."
      }
    },
    access: {
      title: "Dos permisos",
      body: "El teléfono te los pedirá ahora.",
      camera: {
        name: "Cámara",
        reason: "Para mostrar el cielo que tienes delante."
      },
      location: {
        name: "Ubicación",
        reason: "Para saber qué satélites tienes encima."
      },
      footnote: "Tu ubicación nunca sale del teléfono."
    },
    next: "SIGUIENTE",
    allowAccess: "PERMITIR"
  },
  guide: {
    open: "Ayuda",
    close: "Cerrar la ayuda",
    done: "VOLVER AL CIELO"
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
      LANDMARK: "DESTACADOS",
      NAVIGATION: "NAVEGACIÓN",
      EARTH: "OBSERVACIÓN TERRESTRE",
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
