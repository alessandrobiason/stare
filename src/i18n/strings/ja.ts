import type { Strings } from "../types";

export const ja: Strings = {
  intro: {
    what: {
      body: "スマホを空に向けてください。頭上を通る人工衛星が、実際にある位置そのままに映像へ描かれます。"
    },
    holding: {
      title: "かざして、ゆっくり回す",
      body:
        "印ひとつが衛星ひとつです。色はその衛星の用途を、大きさは距離を表します。" +
        "建物や木の陰に入るものは、上から重ねずに省きます。"
    },
    screen: {
      title: "画面にあるもの",
      body: "空のまわりに4つあります。これで全部です。",
      count: {
        where: "左上",
        meaning:
          "いま描かれている衛星の数です。存在する総数ではなく、地平線の下や建物の陰にあるものは数えません。" +
          "タップすると内訳が出ます。"
      },
      filter: {
        where: "右上",
        meaning: "どの種類を描くかの切り替えと、色の凡例です。赤道上で静止している衛星を示すリングもここにあります。"
      },
      marker: {
        where: "空の上",
        meaning: "どの印でも触れてみてください。その衛星が何で、誰が運用し、どれだけ遠く、どちらを見ればよいかが出ます。"
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
    }
  },
  filter: {
    title: "フィルタ",
    open: "カテゴリのフィルタ",
    showAll: "すべて表示",
    ringKey: "リング = 赤道上で静止",
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
    missing: "この衛星はカタログから外れました。",
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
