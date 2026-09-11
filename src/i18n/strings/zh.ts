import type { Strings } from "../types";

export const zh: Strings = {
  intro: {
    what: {
      body: "把手机对准天空，慢慢转动。正从你头顶经过的卫星，会被画在画面上它们真正所在的位置；被楼房或树挡住的则不画。"
    },
    marks: {
      title: "标记怎么看",
      body: "每个标记就是一颗卫星，画在它此刻所在的位置。点一下，就知道它是什么。",
      moving: {
        name: "运动中",
        meaning: "尾巴是它刚走过的路。离得越近，标记越大。"
      },
      parked: {
        name: "定点",
        meaning: "圆环从不移动：它定点在赤道上方。"
      },
      shadow: {
        name: "淡色",
        meaning: "在地球的阴影里，那里看不到任何东西。"
      },
      landmark: {
        name: "地标天体",
        meaning: "空间站和大型望远镜：带光晕，并标出名字。"
      },
      colors: "颜色表示它的用途："
    },
    paths: {
      title: "何时、往哪看",
      body: "少数值得专程出门去看的，在升起之前就会画出它将划过天空的轨迹。",
      minutes: "每分钟一个箭头，指向它前进的方向。",
      time: "它的名字，以及它到达这一点的时刻。",
      follow: "屋顶上方和屏幕边缘之外也会画出：顺着它就能找到升起的地方。",
      footnote: "点一下名字，查看它的全部信息。"
    },
    passes: {
      title: "即将经过的",
      body: "它们大部分时间都在地平线以下，所以左下角会提示接下来要来的。",
      shut: "下一个从你头顶经过的，以及还有多久升起。",
      open: "点开可以看到未来三小时：每一个从哪里升起、升到多高、肉眼能否看见。点一次过境，查看详情。",
      footnote: "如果未来三小时内没有经过的，这个角落就是空的。"
    },
    corners: {
      title: "还有四个角",
      body: "天空四周还有三样东西。",
      count: {
        where: "左上角",
        meaning: "此刻画出了多少颗卫星——不是一共有多少颗。点一下可以看到分别是哪些，以及有几颗被阳光照亮。"
      },
      filter: {
        where: "右上角",
        meaning: "选择要画出哪些类别（包括 Starlink），以及颜色图例。"
      },
      console: {
        where: "右下角",
        meaning: "画面背后的各项传感器读数，供出问题时查看。只有英文，平时使用完全用不到。"
      }
    },
    access: {
      title: "需要哪些权限",
      body: "两项，手机马上会分别询问你。",
      camera: {
        name: "相机",
        reason: "你面前的天空，以及挡在中间的东西。"
      },
      location: {
        name: "位置",
        reason: "你头顶上有哪些卫星，它们又位于天空的哪个方向。"
      },
      footnote:
        "手机朝向由它自己的运动传感器给出，读取时不会询问。所有数据都只在手机上使用：" +
        "Stare 只会下载公开的卫星目录，你的位置绝不会离开这台设备。"
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
      LANDMARK: "地标天体",
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
