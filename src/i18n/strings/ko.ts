import type { Strings } from "../types";

export const ko: Strings = {
  intro: {
    what: {
      body:
        "휴대폰을 하늘로 향하고 천천히 돌려 보세요. 머리 위를 지나는 인공위성이 실제 위치 그대로 화면에 그려지고, " +
        "건물이나 나무에 가린 것은 빠집니다."
    },
    marks: {
      title: "점이 알려 주는 것",
      body: "점 하나가 위성 하나이며, 지금 있는 자리에 그려집니다. 눌러 보면 무엇인지 알 수 있습니다.",
      moving: {
        name: "움직이는 위성",
        meaning: "꼬리는 지나온 길입니다. 가까울수록 점이 커집니다."
      },
      parked: {
        name: "정지",
        meaning: "고리는 움직이지 않습니다. 적도 위에 정지해 있습니다."
      },
      shadow: {
        name: "흐린 점",
        meaning: "지구 그림자 속에 있어 볼 수 있는 것이 없습니다."
      },
      landmark: {
        name: "주요 천체",
        meaning: "우주정거장과 대형 망원경입니다. 빛무리와 이름이 붙습니다."
      },
      colors: "색은 용도를 나타냅니다:"
    },
    paths: {
      title: "언제, 어디를 볼까",
      body: "일부러 나가서 볼 만한 몇 개에는 뜨기 전부터 하늘을 지나갈 경로가 그려집니다.",
      minutes: "1분마다 찍히는 화살표로, 가는 방향을 가리킵니다.",
      time: "이름과 그 지점에 올 시각입니다.",
      follow: "지붕 위와 화면 밖까지 그려집니다. 따라가면 떠오르는 곳을 찾을 수 있습니다.",
      footnote: "이름을 누르면 자세한 정보가 나옵니다."
    },
    passes: {
      title: "곧 지나갈 것",
      body: "대부분의 시간은 지평선 아래에 있어서, 왼쪽 아래 구석이 다음에 올 것을 알려 줍니다.",
      shut: "다음에 머리 위를 지날 것과 떠오르기까지 남은 시간입니다.",
      open:
        "탭하면 앞으로 3시간이 나옵니다. 각각 어디서 떠오르는지, 얼마나 높이 오르는지, " +
        "눈으로 볼 수 있는지. 통과를 누르면 자세한 정보가 나옵니다.",
      footnote: "3시간 안에 지나가는 것이 없으면 그 구석은 비어 있습니다."
    },
    corners: {
      title: "그리고 구석에는",
      body: "하늘 주위에 세 가지가 더 있습니다.",
      count: {
        where: "왼쪽 위",
        meaning:
          "지금 그려진 위성의 수입니다. 전체 개수가 아닙니다. " +
          "탭하면 어떤 위성인지, 몇 개가 햇빛을 받고 있는지 보여 줍니다."
      },
      filter: {
        where: "오른쪽 위",
        meaning: "어떤 종류를 그릴지(Starlink 포함) 고르는 곳이자 색 범례입니다."
      },
      console: {
        where: "오른쪽 아래",
        meaning: "화면 뒤에서 도는 센서 수치입니다. 뭔가 이상할 때 보는 것으로, 영어로만 나오며 평소 사용에는 필요 없습니다."
      }
    },
    access: {
      title: "필요한 권한",
      body: "두 가지이며, 잠시 후 휴대폰이 각각 물어봅니다.",
      camera: {
        name: "카메라",
        reason: "앞에 펼쳐진 하늘과, 그 앞을 가로막고 있는 것."
      },
      location: {
        name: "위치",
        reason: "머리 위에 어떤 위성이 있는지, 하늘의 어느 쪽에 있는지."
      },
      footnote:
        "휴대폰이 어디를 향하는지는 기기의 모션 센서에서 읽으며, 여기에는 권한이 필요 없습니다. " +
        "모든 처리는 기기 안에서 이루어집니다. Stare가 주고받는 것은 공개된 위성 목록뿐이고, " +
        "위치 정보는 기기를 벗어나지 않습니다."
    },
    next: "다음",
    allowAccess: "접근 허용"
  },
  scene: {
    visibleSatellites: "보이는 위성 {count}개",
    markers: "위성 표시",
    breakdown: {
      title: "보이는 위성",
      empty: "보이는 위성이 없습니다",
      other: "기타"
    },
    sunlight: {
      daylight: "낮 — 아직 아무것도 보이지 않습니다",
      none: "모두 지구 그림자 속에 있습니다",
      some: "이 중 {count}개가 햇빛을 받고 있습니다",
      all: "모두 햇빛을 받고 있습니다"
    },
    passes: {
      title: "다음 통과",
      open: "다가오는 통과",
      now: "지나는 중",
      seeing: {
        visible: "맨눈으로 보임",
        binoculars: "쌍안경 필요",
        tooFaint: "너무 어두움",
        eclipsed: "지구 그림자 속",
        daylight: "낮 — 볼 수 없음",
        unknown: "밝기 기록 없음"
      }
    }
  },
  filter: {
    title: "필터",
    open: "분류 필터",
    showAll: "전체 보기",
    ringKey: "고리 = 적도 위 정지",
    shadowKey: "흐림 = 지구 그림자 속",
    categories: {
      LANDMARK: "주요 천체",
      NAVIGATION: "위성항법",
      EARTH: "지구 관측",
      COMMS: "인터넷·TV",
      OTHER: "기타"
    }
  },
  card: {
    details: "위성 정보",
    close: "위성 정보 닫기",
    holdsStation: "정지 중",
    openSite: "{site} 열기",
    photo: "{name} 사진",
    missing: "이 위성은 목록에서 빠졌습니다.",
    seeing: {
      visible: "지금 볼 수 있을 만큼 밝습니다",
      binoculars: "햇빛을 받고 있지만 쌍안경이 필요합니다",
      tooFaint: "햇빛을 받고 있지만 너무 어두워 보이지 않습니다",
      eclipsed: "지구 그림자 속이라 반사할 햇빛이 없습니다",
      daylight: "여기는 아직 해가 떠 있어 궤도의 물체는 보이지 않습니다",
      unknown: "햇빛을 받고 있지만 밝기는 기록되어 있지 않습니다",
      magnitude: "등급 {value}",
      aboutMagnitude: "등급 약 {value}",
      onPass: "{time}에 지나갈 때: {verdict}"
    },
    facts: {
      distance: "거리",
      altitude: "고도",
      speed: "속도",
      look: "방향",
      orbit: "주기"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value}분",
    hoursMinutes: "{hours}시간 {minutes}분",
    up: "고도 {degrees}°",
    below: "지평선 아래 {degrees}°",
    unknown: "—"
  },
  compass: ["북", "북동", "동", "남동", "남", "남서", "서", "북서"],
  compassNotice: {
    calibrate: {
      title: "나침반 보정이 필요합니다",
      detail:
        "자석, 금속, 다른 휴대폰에서 떨어진 곳에서 휴대폰을 8자로 움직여 주세요. " +
        "그전까지는 위성이 그려진 위치에서 수십 도까지 어긋날 수 있습니다."
    },
    magnetic: {
      title: "방위가 자북 기준입니다",
      detail:
        "이 휴대폰이 진북과의 차이를 알려주지 않아, 그 지역의 편각만큼 전체가 밀려 있습니다. " +
        "대부분의 지역에서는 몇 도입니다."
    }
  },
  boot: {
    failed: "시작하지 못했습니다",
    tryAgain: "다시 시도",
    unsupported: "이 기기에서는 하늘 화면을 실행할 수 없습니다."
  },
  language: {
    title: "언어",
    close: "언어 목록 닫기"
  }
};
