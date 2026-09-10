import type { Strings } from "../types";

export const es: Strings = {
  intro: {
    what: {
      body:
        "Apunta el teléfono al cielo. Los satélites que pasan sobre ti se dibujan en la " +
        "imagen justo donde están."
    },
    holding: {
      title: "Levántalo y gira despacio",
      body:
        "Cada marca es un objeto: el color dice para qué sirve el satélite, y el tamaño " +
        "a qué distancia está. Lo que queda detrás de un edificio o de un árbol se " +
        "omite en lugar de dibujarse encima. Los pocos por los que merece la pena salir " +
        "llevan además la línea que están a punto de recorrer: una punta de flecha por " +
        "cada minuto, y la hora a la que salen si aún no han salido."
    },
    screen: {
      title: "Qué hay en pantalla",
      body: "Alrededor del cielo hay cinco cosas. Estas tres dicen qué hay allá arriba.",
      count: {
        where: "Arriba a la izquierda",
        meaning:
          "Cuántos satélites se están dibujando ahora mismo, no cuántos existen. Lo que " +
          "está bajo el horizonte, o detrás de un edificio, no cuenta. Tócalo para " +
          "ver cuáles son."
      },
      passes: {
        where: "Abajo a la izquierda",
        meaning:
          "El próximo objeto señalado que pasa sobre ti, y cuánto falta para que salga. " +
          "Tócalo para ver el resto y hacia dónde ponerte."
      },
      marker: {
        where: "Sobre el cielo",
        meaning:
          "Toca cualquier marca: qué es el objeto, quién lo opera, a qué distancia está " +
          "y hacia dónde mirar."
      }
    },
    controls: {
      title: "Y dos más",
      body: "Una decide qué se dibuja. La otra es para cuando algo no cuadra.",
      filter: {
        where: "Arriba a la derecha",
        meaning:
          "Qué tipos dibujar, y la clave de los colores — incluido el anillo que marca " +
          "un objeto fijo sobre el ecuador."
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
      aboutMagnitude: "magnitud en torno a {value}"
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
