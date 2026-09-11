import type { Strings } from "../types";

export const pt: Strings = {
  intro: {
    what: {
      body:
        "Aponte o telefone para o céu e rode devagar. Os satélites que passam por cima " +
        "de você são desenhados na imagem exatamente onde estão, e omitidos onde um " +
        "prédio ou uma árvore fica no caminho."
    },
    marks: {
      title: "O que dizem as marcas",
      body:
        "Cada marca é um satélite, desenhado onde está agora. Toque numa para saber o " +
        "que é.",
      moving: {
        name: "Em movimento",
        meaning: "A cauda é o caminho que fez. Quanto mais perto, maior a marca."
      },
      parked: {
        name: "Parado",
        meaning: "Um anel nunca se move: fica parado sobre o equador."
      },
      shadow: {
        name: "Esbatido",
        meaning: "Na sombra da Terra, por isso não há nada para ver."
      },
      landmark: {
        name: "Imperdíveis",
        meaning: "As estações espaciais e os grandes telescópios: com halo e nome."
      },
      colors: "A cor diz para que serve:"
    },
    paths: {
      title: "Onde e quando olhar",
      body:
        "Os poucos por que vale a pena sair levam a linha que vão seguir pelo céu, mesmo " +
        "antes de nascerem.",
      minutes: "Uma seta por cada minuto, no sentido em que avança.",
      time: "O nome, e a hora a que vai estar nesse ponto.",
      follow:
        "Desenhada também por cima dos telhados e além da borda da tela: siga-a até onde " +
        "nasce.",
      footnote: "Toque no nome para saber tudo sobre ele."
    },
    passes: {
      title: "O que vai passar",
      body:
        "Quase sempre estão abaixo do horizonte, por isso o canto inferior esquerdo fica " +
        "de olho nos próximos.",
      shut: "O próximo por cima de você, e quanto falta para nascer.",
      open:
        "Toque para ver as próximas três horas: onde nasce cada um, quanto sobe e se vai " +
        "dar para ver. Toque numa passagem para ver os detalhes.",
      footnote: "Se nada passar nas próximas três horas, esse canto fica vazio."
    },
    corners: {
      title: "E nos cantos",
      body: "À volta do céu há mais três coisas.",
      count: {
        where: "Canto superior esquerdo",
        meaning:
          "Quantos satélites estão desenhados agora — não quantos existem. Toque para ver " +
          "quais são e quantos estão ao sol."
      },
      filter: {
        where: "Canto superior direito",
        meaning: "Que tipos desenhar, Starlink incluído, e a legenda das cores."
      },
      console: {
        where: "Canto inferior direito",
        meaning:
          "As leituras dos sensores por trás da vista, para quando algo parece errado. " +
          "Só em inglês, e nunca necessárias para usar o app."
      }
    },
    access: {
      title: "Do que precisa",
      body: "Duas coisas, e o telefone vai perguntar sobre cada uma daqui a pouco.",
      camera: {
        name: "Câmara",
        reason: "O céu à sua frente, e o que fica no caminho."
      },
      location: {
        name: "Localização",
        reason: "Que satélites tem por cima, e em que ponto do céu estão."
      },
      footnote:
        "Para onde o telefone aponta vem dos seus próprios sensores de movimento, que " +
        "lê sem pedir. Tudo é usado só no telefone: a única coisa que o Stare descarrega " +
        "é o catálogo público de satélites, e a sua localização nunca sai do aparelho."
    },
    next: "SEGUINTE",
    allowAccess: "PERMITIR"
  },
  scene: {
    visibleSatellites: "{count} satélites visíveis",
    markers: "Marcas de satélites",
    breakdown: {
      title: "À VISTA",
      empty: "Nada à vista",
      other: "Outros"
    },
    sunlight: {
      daylight: "É dia — ainda não se vê nenhum",
      none: "Estão todos na sombra da Terra",
      some: "{count} destes estão iluminados pelo Sol",
      all: "Estão todos iluminados pelo Sol"
    },
    passes: {
      title: "A CAMINHO",
      open: "Próximas passagens",
      now: "agora",
      seeing: {
        visible: "visível a olho nu",
        binoculars: "só com binóculos",
        tooFaint: "fraco demais",
        eclipsed: "na sombra da Terra",
        daylight: "é dia — nada para ver",
        unknown: "brilho não registado"
      }
    }
  },
  filter: {
    title: "FILTRO",
    open: "Filtro por categoria",
    showAll: "MOSTRAR TUDO",
    ringKey: "ANEL = PARADO SOBRE O EQUADOR",
    shadowKey: "ESBATIDO = NA SOMBRA DA TERRA",
    categories: {
      LANDMARK: "IMPERDÍVEIS",
      NAVIGATION: "NAVEGAÇÃO",
      EARTH: "OBSERVAM A TERRA",
      COMMS: "INTERNET E TV",
      OTHER: "OUTROS"
    }
  },
  card: {
    details: "Detalhes do satélite",
    close: "Fechar os detalhes",
    holdsStation: "FICA PARADO",
    openSite: "Abrir {site}",
    photo: "Fotografia: {name}",
    missing: "Este satélite já não está no catálogo.",
    seeing: {
      visible: "Brilhante o suficiente para se ver agora",
      binoculars: "Ao sol, mas seriam precisos binóculos",
      tooFaint: "Ao sol, mas demasiado ténue para se ver",
      eclipsed: "Na sombra da Terra: não há luz para refletir",
      daylight: "Aqui o Sol ainda está alto — ainda não se vê nada em órbita",
      unknown: "Ao sol, embora não esteja registado quanto reflete",
      magnitude: "magnitude {value}",
      aboutMagnitude: "magnitude cerca de {value}",
      onPass: "Quando passar, às {time}: {verdict}"
    },
    facts: {
      distance: "Distância",
      altitude: "Altitude",
      speed: "Velocidade",
      look: "Onde olhar",
      orbit: "Órbita"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} min",
    hoursMinutes: "{hours} h {minutes} min",
    up: "{degrees}° acima",
    below: "{degrees}° abaixo",
    unknown: "—"
  },
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  compassNotice: {
    calibrate: {
      title: "A bússola precisa de calibragem",
      detail:
        "Mova o telefone em forma de oito, longe de ímanes, metal e outros telefones. " +
        "Até lá os satélites podem estar a dezenas de graus do lugar onde são desenhados."
    },
    magnetic: {
      title: "Direções ao norte magnético",
      detail:
        "Este telefone não indicou o desvio para o norte geográfico, por isso tudo está " +
        "deslocado da declinação local — poucos graus na maioria dos lugares."
    }
  },
  boot: {
    failed: "Não foi possível iniciar",
    tryAgain: "TENTAR DE NOVO",
    unsupported: "Este aparelho não consegue mostrar a vista do céu."
  },
  language: {
    title: "Idioma",
    close: "Fechar a lista de idiomas"
  }
};
