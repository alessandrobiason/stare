import type { Strings } from "../types";

export const ja: Strings = {
  intro: {
    what: {
      body:
        "スマホを空に向けて、ゆっくり回してください。頭上を通る人工衛星が、実際にある位置そのままに映像へ描かれます。" +
        "建物や木の陰に入るものは描きません。"
    },
    marks: {
      title: "印の読み方",
      body: "印ひとつが衛星ひとつで、いまある場所に描かれます。触れると、それが何かがわかります。",
      moving: {
        name: "動いている",
        meaning: "尾は通ってきた道すじです。近いほど印は大きくなります。"
      },
      parked: {
        name: "静止",
        meaning: "リングは動きません。赤道の上空で静止しています。"
      },
      shadow: {
        name: "淡い印",
        meaning: "地球の影の中にあり、見えるものはありません。"
      },
      landmark: {
        name: "注目の天体",
        meaning: "宇宙ステーションや大型望遠鏡です。光の輪と名前が付きます。"
      },
      colors: "色は用途を表します："
    },
    paths: {
      title: "いつ、どこを見るか",
      body: "外に出て見る価値のあるものには、昇る前から、これから空を通る道すじが描かれます。",
      minutes: "1分ごとの矢印。進む向きを指しています。",
      time: "名前と、その地点に来る時刻です。",
      follow: "屋根の上や画面の外にも描かれます。たどれば昇ってくる場所がわかります。",
      footnote: "名前に触れると詳しい情報が出ます。"
    },
    passes: {
      title: "これから通るもの",
      body: "たいていは地平線の下にあるので、左下の隅が次に来るものを知らせます。",
      shut: "次に頭上を通るものと、昇るまでの時間です。",
      open:
        "タップすると3時間先まで出ます。それぞれがどこから昇り、どこまで高く上がり、" +
        "肉眼で見えるかどうか。通過をタップすると詳しい情報が出ます。",
      footnote: "3時間以内に何も通らなければ、この隅には何も出ません。"
    },
    corners: {
      title: "そして四隅には",
      body: "空のまわりには、ほかに3つあります。",
      count: {
        where: "左上",
        meaning:
          "いま描かれている衛星の数です。存在する総数ではありません。" +
          "タップすると内訳と、日が当たっている数が出ます。"
      },
      filter: {
        where: "右上",
        meaning: "どの種類を描くか（Starlink も含む）の切り替えと、色の凡例です。"
      },
      console: {
        where: "右下",
        meaning: "表示の裏側にあるセンサーの数値です。様子がおかしいときのためのもので、英語のみ。ふだんの利用には不要です。"
      }
    },
    access: {
      title: "必要なもの",
      body: "2つあります。まもなくスマホがそれぞれについて尋ねます。",
      camera: {
        name: "カメラ",
        reason: "目の前の空と、その手前をさえぎっているもの。"
      },
      location: {
        name: "位置情報",
        reason: "頭上にどの衛星がいるか、そして空のどこに見えるか。"
      },
      footnote:
        "スマホの向きは本体のモーションセンサーから読み取っており、これに許可は要りません。" +
        "すべて端末内で処理されます。Stare が通信するのは公開されている衛星カタログだけで、" +
        "あなたの位置が端末の外へ出ることはありません。"
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
      LANDMARK: "注目の天体",
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
