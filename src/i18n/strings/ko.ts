import type { Strings } from "../types";

export const ko: Strings = {
  intro: {
    what: {
      body: "휴대폰을 하늘로 향해 보세요. 머리 위를 지나는 인공위성이 실제 위치 그대로 화면에 그려집니다."
    },
    holding: {
      title: "들어 올리고 천천히 돌리기",
      body:
        "점 하나가 위성 하나입니다. 색은 그 위성의 용도를, 크기는 거리를 나타냅니다. " +
        "건물이나 나무에 가린 것은 위에 겹쳐 그리지 않고 빼놓습니다."
    },
    screen: {
      title: "화면에 있는 것들",
      body: "하늘 주위에 네 가지가 있습니다. 이게 전부입니다.",
      count: {
        where: "왼쪽 위",
        meaning:
          "지금 그려진 위성의 수입니다. 전체 개수가 아니며, 지평선 아래나 건물에 가린 것은 세지 않습니다. " +
          "탭하면 어떤 위성인지 보여 줍니다."
      },
      filter: {
        where: "오른쪽 위",
        meaning: "어떤 종류를 그릴지 고르는 곳이자 색 범례입니다. 적도 위에 정지해 있는 위성을 나타내는 고리도 여기 있습니다."
      },
      marker: {
        where: "하늘 위",
        meaning: "아무 점이나 눌러 보세요. 그 물체가 무엇인지, 누가 운영하는지, 얼마나 먼지, 어디를 봐야 하는지 나옵니다."
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
    }
  },
  filter: {
    title: "필터",
    open: "분류 필터",
    showAll: "전체 보기",
    ringKey: "고리 = 적도 위 정지",
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
