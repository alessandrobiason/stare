import type { Strings } from "../types";

export const ja: Strings = {
  intro: {
    what: {
      body: "スマホを空に向けて、ゆっくり動かしてください。頭上の人工衛星が、実際にある場所に表示されます。"
    },
    marks: {
      title: "画面の見かた",
      body: "点のひとつひとつが人工衛星です。タップすると、何の衛星かわかります。",
      moving: {
        name: "移動中",
        meaning: "尾は来た方向を示します。点が大きいほど近くにあります。"
      },
      parked: {
        name: "リング",
        meaning: "空のいつも同じ場所にとどまっています。"
      },
      shadow: {
        name: "薄い点",
        meaning: "地球の影に入っているため、見ることができません。"
      },
      landmark: {
        name: "注目の衛星",
        meaning: "宇宙ステーションや大型望遠鏡。名前と一緒に表示されます。"
      },
      colors: "色は用途を表します："
    },
    paths: {
      title: "いつ、どこを見るか",
      body: "宇宙ステーションや望遠鏡は、現れる前から通り道が表示されます。",
      minutes: "矢印は1分ごと。進む向きを指しています。",
      time: "名前と、そこを通る時刻です。",
      follow: "線をたどると、どこから現れるかがわかります。",
      footnote: "名前をタップすると詳しい情報が見られます。"
    },
    passes: {
      title: "まもなく通過",
      body: "左下に、次に頭上を通るものが表示されます。",
      shut: "次に通るものと、現れるまでの時間です。",
      open: "タップすると数時間先まで表示。どこを見ればいいか、どこまで高く上がるか、見えるかどうかがわかります。",
      footnote: "しばらく何も通らないときは、何も表示されません。"
    },
    corners: {
      title: "画面のすみ",
      body: "ほかにタップできるものが3つあります。",
      count: {
        where: "左上",
        meaning: "画面に映っている衛星の数です。タップするとどの衛星かわかります。"
      },
      filter: {
        where: "右上",
        meaning: "表示する衛星の種類をここで選べます。"
      },
      console: {
        where: "右下",
        meaning: "技術的なデータです（英語のみ）。ふだんは使いません。"
      }
    },
    access: {
      title: "2つの許可",
      body: "このあと、スマホから確認が表示されます。",
      camera: {
        name: "カメラ",
        reason: "目の前の空を映すために使います。"
      },
      location: {
        name: "位置情報",
        reason: "頭上にどの衛星があるかを知るために使います。"
      },
      footnote: "位置情報がスマホの外に送られることはありません。"
    },
    next: "次へ",
    allowAccess: "アクセスを許可"
  },
  scene: {
    visibleSatellites: "見えている衛星 {count} 個",
    markers: "衛星の印",
    breakdown: {
      title: "表示中",
      empty: "表示中の衛星はありません",
      other: "その他"
    },
    sunlight: {
      daylight: "昼間 — まだどれも見えません",
      none: "すべて地球の影の中です",
      some: "このうち {count} 個が太陽に照らされています",
      all: "すべて太陽に照らされています"
    },
    passes: {
      title: "次の通過",
      open: "これからの通過",
      now: "通過中",
      seeing: {
        visible: "肉眼で見えます",
        binoculars: "双眼鏡が必要",
        tooFaint: "暗すぎて見えません",
        eclipsed: "地球の影の中",
        daylight: "昼間 — 見えません",
        unknown: "明るさは未記録"
      }
    }
  },
  filter: {
    title: "フィルタ",
    open: "カテゴリのフィルタ",
    showAll: "すべて表示",
    ringKey: "リング = 赤道上で静止",
    shadowKey: "淡い印 = 地球の影の中",
    categories: {
      LANDMARK: "注目の衛星",
      NAVIGATION: "測位",
      EARTH: "地球観測",
      COMMS: "通信・放送",
      OTHER: "その他"
    }
  },
  card: {
    details: "衛星の詳細",
    close: "衛星の詳細を閉じる",
    holdsStation: "静止中",
    openSite: "{site} を開く",
    photo: "{name} の写真",
    missing: "この衛星はカタログから外れました。",
    seeing: {
      visible: "いま見えるだけの明るさです",
      binoculars: "陽が当たっていますが、双眼鏡が要ります",
      tooFaint: "陽が当たっていますが、暗すぎて見えません",
      eclipsed: "地球の影の中で、反射する光がありません",
      daylight: "ここはまだ日が高く、軌道上のものは見えません",
      unknown: "陽が当たっていますが、明るさは記録されていません",
      magnitude: "等級 {value}",
      aboutMagnitude: "等級 約 {value}",
      onPass: "{time} に通過するとき: {verdict}"
    },
    facts: {
      distance: "距離",
      altitude: "高度",
      speed: "速度",
      look: "方角",
      orbit: "周期"
    }
  },
  units: {
    km: "{value} km",
    kmPerSecond: "{value} km/s",
    minutes: "{value} 分",
    hoursMinutes: "{hours} 時間 {minutes} 分",
    up: "仰角 {degrees}°",
    below: "地平線下 {degrees}°",
    unknown: "—"
  },
  compass: ["北", "北東", "東", "南東", "南", "南西", "西", "北西"],
  compassNotice: {
    calibrate: {
      title: "コンパスの調整が必要です",
      detail:
        "磁石・金属・ほかのスマホから離れた場所で、8の字を描くように動かしてください。" +
        "それまでは衛星が描かれた位置から数十度ずれることがあります。"
    },
    magnetic: {
      title: "方角は磁北基準です",
      detail:
        "このスマホは真北とのずれを報告していないため、その土地の偏角ぶんだけ全体がずれています。" +
        "多くの場所では数度です。"
    }
  },
  boot: {
    failed: "起動できませんでした",
    tryAgain: "再試行",
    unsupported: "この端末では空のビューを実行できません。"
  },
  language: {
    title: "言語",
    close: "言語の一覧を閉じる"
  }
};
