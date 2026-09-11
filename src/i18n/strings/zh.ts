import type { Strings } from "../types";

export const zh: Strings = {
  intro: {
    what: {
      body: "把手机对准天空，慢慢移动。你头顶上的卫星会显示在它们真实的位置。"
    },
    marks: {
      title: "怎么看",
      body: "每个点都是一颗卫星。点一下，就能知道它是什么。",
      moving: {
        name: "移动中",
        meaning: "尾巴表示它从哪里来。点越大，离你越近。"
      },
      parked: {
        name: "圆环",
        meaning: "总是停在天空中的同一个位置。"
      },
      shadow: {
        name: "淡色",
        meaning: "它在地球的阴影里，所以看不见。"
      },
      landmark: {
        name: "著名航天器",
        meaning: "空间站和大型太空望远镜，会显示名字。"
      },
      colors: "颜色表示用途："
    },
    paths: {
      title: "何时、往哪看",
      body: "空间站和望远镜在出现之前，就会显示它们将要经过的路线。",
      minutes: "每分钟一个箭头，指向前进方向。",
      time: "名字，以及它经过那里的时间。",
      follow: "沿着这条线，就能找到它从哪里出现。",
      footnote: "点一下名字，查看详细信息。"
    },
    passes: {
      title: "即将经过",
      body: "左下角会显示接下来从你头顶经过的卫星。",
      shut: "下一个经过的卫星，以及还要多久出现。",
      open: "点开可查看接下来几小时：往哪看、升到多高、能不能用肉眼看到。",
      footnote: "如果近期没有卫星经过，这里就不显示。"
    },
    corners: {
      title: "屏幕边角",
      body: "还有三个可以点的地方。",
      count: {
        where: "左上角",
        meaning: "屏幕上现在有多少颗卫星。点一下可查看是哪些。"
      },
      filter: {
        where: "右上角",
        meaning: "在这里选择要显示哪些类型的卫星。"
      },
      console: {
        where: "右下角",
        meaning: "技术数据，只有英文。平时用不到。"
      }
    },
    access: {
      title: "两项权限",
      body: "手机马上会请求这两项权限。",
      camera: {
        name: "相机",
        reason: "用来在屏幕上显示你面前的天空。"
      },
      location: {
        name: "位置",
        reason: "用来知道你头顶上有哪些卫星。"
      },
      footnote: "你的位置信息不会离开这台手机。"
    },
    next: "下一步",
    allowAccess: "允许访问"
  },
  scene: {
    visibleSatellites: "可见卫星 {count} 颗",
    markers: "卫星标记",
    breakdown: {
      title: "视野内",
      empty: "视野内没有卫星",
      other: "其他"
    },
    sunlight: {
      daylight: "白天 — 目前一颗也看不到",
      none: "它们都在地球的阴影里",
      some: "其中 {count} 颗被阳光照到",
      all: "它们都被阳光照到"
    },
    passes: {
      title: "即将经过",
      open: "即将到来的过境",
      now: "现在",
      seeing: {
        visible: "肉眼可见",
        binoculars: "需要双筒望远镜",
        tooFaint: "太暗看不见",
        eclipsed: "在地球的阴影里",
        daylight: "白天 — 看不到",
        unknown: "亮度未记录"
      }
    }
  },
  filter: {
    title: "筛选",
    open: "按类别筛选",
    showAll: "全部显示",
    ringKey: "圆环 = 定点在赤道上方",
    shadowKey: "淡色 = 在地球的阴影里",
    categories: {
      LANDMARK: "著名航天器",
      NAVIGATION: "导航",
      EARTH: "对地观测",
      COMMS: "上网与电视",
      OTHER: "其他"
    }
  },
  card: {
    details: "卫星详情",
    close: "关闭卫星详情",
    holdsStation: "定点不动",
    openSite: "打开 {site}",
    photo: "{name} 的照片",
    missing: "这颗卫星已不在目录中。",
    seeing: {
      visible: "现在够亮，可以看到",
      binoculars: "在阳光下，但需要双筒望远镜",
      tooFaint: "在阳光下，但太暗，看不到",
      eclipsed: "在地球的阴影里，没有阳光可反射",
      daylight: "这里太阳还没落 — 轨道上还什么都看不到",
      unknown: "在阳光下，但它有多亮没有记录",
      magnitude: "星等 {value}",
      aboutMagnitude: "星等约 {value}",
      onPass: "{time} 经过时：{verdict}"
    },
    facts: {
      distance: "距离",
      altitude: "高度",
      speed: "速度",
      look: "方位",
      orbit: "周期"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} 分钟",
    hoursMinutes: "{hours} 小时 {minutes} 分",
    up: "仰角 {degrees}°",
    below: "地平线下 {degrees}°",
    unknown: "—"
  },
  compass: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"],
  compassNotice: {
    calibrate: {
      title: "指南针需要校准",
      detail:
        "拿着手机画“8”字，远离磁铁、金属和其他手机。在此之前，卫星可能与画出的位置相差几十度。"
    },
    magnetic: {
      title: "方位以磁北为准",
      detail: "这台手机没有给出真北偏差，因此所有位置都偏了当地磁偏角——多数地方是几度。"
    }
  },
  boot: {
    failed: "无法启动",
    tryAgain: "重试",
    unsupported: "此设备无法运行天空视图。"
  },
  language: {
    title: "语言",
    close: "关闭语言列表"
  }
};
