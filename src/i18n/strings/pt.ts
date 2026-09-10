import type { Strings } from "../types";

export const pt: Strings = {
  intro: {
    what: {
      body:
        "Aponte o telefone para o céu. Os satélites que passam por cima de você são " +
        "desenhados na imagem exatamente onde estão."
    },
    holding: {
      title: "Levante e rode devagar",
      body:
        "Cada marca é um objeto: a cor diz para que serve o satélite, o tamanho a que " +
        "distância está. O que fica atrás de um prédio ou de uma árvore é omitido em vez " +
        "de ser desenhado por cima. Os poucos por que vale a pena sair levam também a " +
        "linha que estão prestes a percorrer: uma seta por cada minuto e, se ainda não " +
        "nasceram, a hora a que aparecem."
    },
    screen: {
      title: "O que há na tela",
      body: "À volta do céu há cinco coisas. Estas três dizem o que está lá em cima.",
      count: {
        where: "Canto superior esquerdo",
        meaning:
          "Quantos satélites estão desenhados neste momento — não quantos existem. O que " +
          "está abaixo do horizonte, ou atrás de um edifício, não conta. Toque para " +
          "ver quais são."
      },
      passes: {
        where: "Canto inferior esquerdo",
        meaning:
          "O próximo objeto assinalado a passar por cima de si, e quanto falta para " +
          "nascer. Toque para ver os restantes e onde se colocar."
      },
      marker: {
        where: "No céu",
        meaning:
          "Toque em qualquer marca: o que é o objeto, quem o opera, a que distância está " +
          "e para onde olhar."
      }
    },
    controls: {
      title: "E mais duas",
      body: "Uma decide o que é desenhado. A outra é para quando algo parece errado.",
      filter: {
        where: "Canto superior direito",
        meaning:
          "Que tipos desenhar, e a legenda das cores — incluindo o anel que assinala um " +
          "objeto parado sobre o equador."
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
      aboutMagnitude: "magnitude cerca de {value}"
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
