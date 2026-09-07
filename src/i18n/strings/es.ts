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
        "omite en lugar de dibujarse encima."
    },
    screen: {
      title: "Qué hay en pantalla",
      body: "Alrededor del cielo hay cuatro cosas. Estas son todas.",
      count: {
        where: "Arriba a la izquierda",
        meaning:
          "Cuántos satélites se están dibujando ahora mismo, no cuántos existen. Lo que " +
          "está bajo el horizonte, o detrás de un edificio, no cuenta."
      },
      filter: {
        where: "Arriba a la derecha",
        meaning:
          "Qué tipos dibujar, y la clave de los colores — incluido el anillo que marca " +
          "un objeto fijo sobre el ecuador."
      },
      marker: {
        where: "Sobre el cielo",
        meaning:
          "Toca cualquier marca: qué es el objeto, quién lo opera, a qué distancia está " +
          "y hacia dónde mirar."
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
    markers: "Marcas de satélites"
  },
  filter: {
    title: "FILTRO",
    open: "Filtro por categoría",
    showAll: "MOSTRAR TODO",
    ringKey: "ANILLO = FIJO SOBRE EL ECUADOR",
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
    missing: "Este satélite ya no está en el catálogo.",
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
