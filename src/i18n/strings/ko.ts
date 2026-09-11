import type { Strings } from "../types";

export const ko: Strings = {
  intro: {
    what: {
      body: "휴대폰을 하늘로 향하고 천천히 움직여 보세요. 머리 위의 위성이 실제 위치에 표시됩니다."
    },
    marks: {
      title: "화면 보는 법",
      body: "점 하나가 위성 하나입니다. 누르면 어떤 위성인지 알 수 있습니다.",
      moving: {
        name: "움직이는 위성",
        meaning: "꼬리는 온 방향을 보여 줍니다. 점이 클수록 가깝습니다."
      },
      parked: {
        name: "고리",
        meaning: "하늘의 같은 자리에 늘 머물러 있습니다."
      },
      shadow: {
        name: "흐린 점",
        meaning: "지구 그림자 속에 있어서 보이지 않습니다."
      },
      landmark: {
        name: "주요 위성",
        meaning: "우주정거장과 대형 망원경으로, 이름이 함께 표시됩니다."
      },
      colors: "색은 용도를 나타냅니다:"
    },
    paths: {
      title: "언제, 어디를 볼까",
      body: "우주정거장과 망원경은 나타나기 전부터 지나갈 길이 표시됩니다.",
      minutes: "화살표 하나가 1분이며, 가는 방향을 가리킵니다.",
      time: "이름과 그곳을 지나는 시각입니다.",
      follow: "선을 따라가면 어디서 나타날지 알 수 있습니다.",
      footnote: "이름을 누르면 자세한 정보를 볼 수 있습니다."
    },
    passes: {
      title: "곧 지나갈 위성",
      body: "왼쪽 아래에 다음으로 머리 위를 지날 위성이 표시됩니다.",
      shut: "다음 위성과 나타나기까지 남은 시간입니다.",
      open: "누르면 앞으로 몇 시간 동안의 목록이 나옵니다. 어디를 볼지, 얼마나 높이 오를지, 눈으로 보이는지 알 수 있습니다.",
      footnote: "한동안 지나가는 위성이 없으면 표시되지 않습니다."
    },
    corners: {
      title: "화면 모서리",
      body: "누를 수 있는 것이 네 가지 더 있습니다.",
      count: {
        where: "왼쪽 위",
        meaning: "지금 화면에 있는 위성 수입니다. 누르면 어떤 위성인지 보여 줍니다."
      },
      filter: {
        where: "오른쪽 위",
        meaning: "표시할 위성 종류를 고를 수 있습니다."
      },
      guide: {
        where: "오른쪽 아래",
        meaning: "이 페이지들을 언제든 다시 볼 수 있습니다."
      },
      console: {
        where: "오른쪽 아래",
        meaning: "기술 데이터이며 영어로만 나옵니다. 평소에는 필요 없습니다."
      }
    },
    access: {
      title: "두 가지 권한",
      body: "잠시 후 휴대폰이 권한을 요청합니다.",
      camera: {
        name: "카메라",
        reason: "눈앞의 하늘을 보여 주기 위해 필요합니다."
      },
      location: {
        name: "위치",
        reason: "머리 위에 어떤 위성이 있는지 알기 위해 필요합니다."
      },
      footnote: "위치 정보는 휴대폰 밖으로 나가지 않습니다."
    },
    next: "다음",
    allowAccess: "접근 허용"
  },
  guide: {
    open: "도움말",
    close: "도움말 닫기",
    done: "하늘로 돌아가기"
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
      LANDMARK: "주요 위성",
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
