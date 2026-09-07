import type { Strings } from "../types";

export const zh: Strings = {
  intro: {
    what: {
      body: "把手机对准天空。正从你头顶经过的卫星，会被画在画面上它们真正所在的位置。"
    },
    holding: {
      title: "举起手机，慢慢转动",
      body:
        "每一个标记就是一个物体：颜色表示这颗卫星是做什么的，大小表示它有多远。" +
        "被楼房或树挡住的，会被略去，而不是画在遮挡物上面。"
    },
    screen: {
      title: "屏幕上有什么",
      body: "天空四周有四样东西，这里全在。",
      count: {
        where: "左上角",
        meaning:
          "此刻画出了多少颗卫星——不是一共有多少颗。在地平线以下、或被建筑挡住的都不计入。" +
          "点一下可以看到分别是哪些。"
      },
      filter: {
        where: "右上角",
        meaning: "选择要画出哪些类别，以及颜色图例——包括标示定点在赤道上方物体的那个圆环。"
      },
      marker: {
        where: "天空上",
        meaning: "点一下任意标记：这个物体是什么、由谁运营、离你多远，以及该往哪里看。"
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
    }
  },
  filter: {
    title: "筛选",
    open: "按类别筛选",
    showAll: "全部显示",
    ringKey: "圆环 = 定点在赤道上方",
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
    missing: "这颗卫星已不在目录中。",
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
