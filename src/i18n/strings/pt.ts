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
        "de ser desenhado por cima."
    },
    screen: {
      title: "O que há na tela",
      body: "À volta do céu há quatro coisas. São todas estas.",
      count: {
        where: "Canto superior esquerdo",
        meaning:
          "Quantos satélites estão desenhados neste momento — não quantos existem. O que " +
          "está abaixo do horizonte, ou atrás de um edifício, não conta. Toque para " +
          "ver quais são."
      },
      filter: {
        where: "Canto superior direito",
        meaning:
          "Que tipos desenhar, e a legenda das cores — incluindo o anel que assinala um " +
          "objeto parado sobre o equador."
      },
      marker: {
        where: "No céu",
        meaning:
          "Toque em qualquer marca: o que é o objeto, quem o opera, a que distância está " +
          "e para onde olhar."
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
    }
  },
  filter: {
    title: "FILTRO",
    open: "Filtro por categoria",
    showAll: "MOSTRAR TUDO",
    ringKey: "ANEL = PARADO SOBRE O EQUADOR",
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
