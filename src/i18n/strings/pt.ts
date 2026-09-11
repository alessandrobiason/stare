import type { Strings } from "../types";

export const pt: Strings = {
  intro: {
    what: {
      body:
        "Aponte o telefone para o céu e mova-o devagar. Os satélites acima de você " +
        "aparecem exatamente onde estão."
    },
    marks: {
      title: "O que você vê",
      body: "Cada ponto é um satélite. Toque nele para saber o que é.",
      moving: {
        name: "Em movimento",
        meaning: "O rastro mostra de onde ele vem. Quanto maior o ponto, mais perto."
      },
      parked: {
        name: "Anel",
        meaning: "Fica sempre no mesmo lugar do céu."
      },
      shadow: {
        name: "Fraco",
        meaning: "Está na sombra da Terra, então não dá para ver."
      },
      landmark: {
        name: "Destaques",
        meaning: "Estações espaciais e grandes telescópios, com o nome."
      },
      colors: "A cor mostra para que serve:"
    },
    paths: {
      title: "Onde e quando olhar",
      body: "Estações e telescópios mostram o caminho que vão fazer, antes mesmo de aparecer.",
      minutes: "Uma seta por minuto, no sentido em que ele vai.",
      time: "O nome e a hora em que ele vai passar ali.",
      follow: "Siga a linha para achar onde ele vai aparecer.",
      footnote: "Toque no nome para saber mais."
    },
    passes: {
      title: "Em breve",
      body: "No canto inferior esquerdo aparece o que vai passar sobre você.",
      shut: "O próximo e quanto falta para ele aparecer.",
      open:
        "Toque para ver as próximas horas: para onde olhar, até que altura sobe e se vai " +
        "dar para ver.",
      footnote: "Se nada estiver para passar, o canto fica vazio."
    },
    corners: {
      title: "Nos cantos",
      body: "Mais três coisas que você pode tocar.",
      count: {
        where: "Canto superior esquerdo",
        meaning: "Quantos satélites estão na tela. Toque para ver quais."
      },
      filter: {
        where: "Canto superior direito",
        meaning: "Escolha que tipos de satélite mostrar."
      },
      console: {
        where: "Canto inferior direito",
        meaning: "Dados técnicos, em inglês. Você não vai precisar."
      }
    },
    access: {
      title: "Duas permissões",
      body: "O telefone vai pedir as duas agora.",
      camera: {
        name: "Câmara",
        reason: "Para mostrar o céu à sua frente."
      },
      location: {
        name: "Localização",
        reason: "Para saber que satélites estão acima de você."
      },
      footnote: "Sua localização nunca sai do telefone."
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
    shadowKey: "FRACO = NA SOMBRA DA TERRA",
    categories: {
      LANDMARK: "DESTAQUES",
      NAVIGATION: "NAVEGAÇÃO",
      EARTH: "OBSERVAÇÃO DA TERRA",
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
